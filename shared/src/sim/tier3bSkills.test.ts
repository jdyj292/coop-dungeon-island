// 대검 B 계열 3단계 (SK-7, skills.md 2장): 검의 장막(깊이 끝까지·다단 감속·두 줄·밀어내기)·일섬(다단·이중·반환)·잔상·검의 춤(스킬 끝 1초 안 다음 스킬) (Lv1 ATK 10)
import { describe, expect, it } from 'vitest';
import { weaponDef } from '../actions';
import { TICK } from '../constants';
import { MUZZLE } from '../monster/hazards';
import type { Monster } from '../monster/state';
import { perksOf, withPerks } from '../passives';
import type { PlayerInput } from '../player';
import { resolveSkill, type SkillBuild } from '../skillTree';
import { RoomSim, type SimEvent } from './room';

const gs = weaponDef('greatsword');
const bounds = { minX: 0, maxX: 1000, minY: 0, maxY: 100 };
const none: PlayerInput = { x: 0, y: 0, attack: false, skill: null, backstep: false };
const room = (skills: SkillBuild = {}) => new RoomSim(gs, bounds, { x: 100, y: 50 }, { ai: false, skills });
const cast = (skills: SkillBuild, id: string): PlayerInput => ({ ...none, skill: withPerks(resolveSkill(id, skills[id] ?? { points: 1 }), perksOf(gs, skills)) });
/** inputs[i] = i번째 틱 입력 (없으면 입력 없음) */
const run = (sim: RoomSim, sec: number, inputs: Record<number, PlayerInput>): SimEvent[] => {
  const events: SimEvent[] = [];
  for (let i = 0; i < Math.round(sec / TICK); i++) events.push(...sim.tick(TICK, inputs[i] ?? none).events);
  return events;
};
const spawn = (sim: RoomSim, ...at: [number, number][]) =>
  sim.spawn(at.map(([x, y]) => ({ kind: 'capknight', x, y }))).map((m) => Object.assign(m, { hp: 50000, maxHp: 50000 }));
const hitsOn = (ev: SimEvent[], m: Monster) => ev.flatMap((e) => (e.type === 'hit' && e.m === m ? [e.damage] : []));
const tick = (sec: number) => Math.round(sec / TICK);

describe('검의 장막', () => {
  it('앞 4타일에 방 위아래 끝까지 (600%), 2초 동안 0.25초마다 80% + 감속', () => {
    const sim = room();
    const [m, top, side] = spawn(sim, [164, 50], [164, 2], [200, 50]);
    const ev = run(sim, 3, { 0: cast({}, 'gs_cross') });
    // 맞을 때마다 조금씩 밀려 장막 밖으로 나가면 끝 (걸어 들어오면 다시 베임)
    const [big, ...ticks] = hitsOn(ev, m!);
    expect(big).toBe(60);
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    expect(new Set(ticks)).toEqual(new Set([8]));
    expect(hitsOn(ev, top!)[0]).toBe(60);
    expect(hitsOn(ev, side!)).toEqual([]);
  });

  it('지나가다 들어온 적도 베이고 느려진다', () => {
    const sim = room();
    const [m] = spawn(sim, [200, 50]);
    const first = run(sim, 0.8, { 0: cast({}, 'gs_cross') });
    expect(hitsOn(first, m!)).toEqual([]);
    m!.body.x = 164;
    const later = run(sim, 0.3, {});
    expect(hitsOn(later, m!)).toEqual([8]);
    expect(m!.slow.left).toBeGreaterThan(0);
  });

  it('두 줄: 앞 2타일·5타일에 한 줄씩 (각 320%, 지날 때 40%)', () => {
    const b = { gs_cross: { points: 1, variant: 'twin' } };
    const sim = room(b);
    const [near, far] = spawn(sim, [132, 50], [180, 50]);
    const ev = run(sim, 3, { 0: cast(b, 'gs_cross') });
    for (const m of [near!, far!]) expect(hitsOn(ev, m).slice(0, 3)).toEqual([32, 4, 4]);
  });

  it('밀어내기: 장막이 앞으로 나아가 처음 자리 밖 적도 맞힌다', () => {
    const b = { gs_cross: { points: 1, variant: 'push' } };
    const sim = room(b);
    const [m] = spawn(sim, [200, 50]);
    const ev = run(sim, 3, { 0: cast(b, 'gs_cross') });
    expect(hitsOn(ev, m!).length).toBeGreaterThan(0);
    expect(hitsOn(ev, m!)[0]).toBe(7);
  });
});

describe('일섬', () => {
  it('앞 부채꼴(반지름 96·100°): 벨 때는 판정 없고 0.5초 뒤 검기 11번 (각 80%), 부채꼴 밖은 안 맞음', () => {
    const sim = room();
    const [near, far, side] = spawn(sim, [160, 50], [260, 50], [125, 98]);
    // active(0.45초) 직후에는 아직 안 맞음
    expect(hitsOn(run(sim, 0.7, { 0: cast({}, 'gs_flash') }), near!)).toEqual([]);
    const ev = run(sim, 1.3, {});
    expect([hitsOn(ev, near!), hitsOn(ev, far!), hitsOn(ev, side!)]).toEqual([[...Array(11).fill(8)], [], []]);
  });

  it('충전하면 부채꼴이 커짐 (최대 2초 충전, +50%: 반지름 144)', () => {
    const sim = room();
    const [m] = spawn(sim, [230, 50]);
    const hold = cast({}, 'gs_flash');
    const inputs: Record<number, PlayerInput> = {};
    for (let i = 0; i < tick(2.6); i++) inputs[i] = { ...none, skill: i === 0 ? hold.skill : null, hold: true };
    // 최대 충전: 피해도 ×1.5 (첫 검기 120%). 맞을 때마다 밀려 끝쪽 적은 다단 도중 범위를 벗어날 수 있음
    expect(hitsOn(run(sim, 4, inputs), m!)[0]).toBe(12);
    const sim2 = room();
    const [m2] = spawn(sim2, [230, 50]);
    expect(hitsOn(run(sim2, 2, { 0: hold }), m2!)).toEqual([]);
  });

  it('이중 일섬은 검기 각 50% 뒤 마지막 300%, 반환은 첫 검기 0.5초 뒤 맞은 적에게 한 번 300% (움직여도)', () => {
    const dbl = { gs_flash: { points: 1, variant: 'double' } };
    const sim = room(dbl);
    const [m] = spawn(sim, [160, 50]);
    expect(hitsOn(run(sim, 2.4, { 0: cast(dbl, 'gs_flash') }), m!)).toEqual([8, ...Array(10).fill(5), 30]);
    const tr = { gs_flash: { points: 1, variant: 'trail' } };
    const sim2 = room(tr);
    const [a, b, c] = spawn(sim2, [160, 50], [300, 50], [170, 40]);
    const first = run(sim2, 1.0, { 0: cast(tr, 'gs_flash') });
    expect([hitsOn(first, a!), hitsOn(first, b!)]).toEqual([[8], []]);
    a!.body.x = 600;
    const later = run(sim2, 1.2, {});
    expect([hitsOn(later, a!), hitsOn(later, b!)]).toEqual([[30], []]);
    expect(later.some((e) => e.type === 'echo' && e.echo.look === 'cut')).toBe(true);
    // 다단마다 반환이 걸리지 않음: 끝까지 범위 안에 있던 적도 300%는 한 번
    expect(hitsOn([...first, ...later], c!).filter((d) => d === 30)).toEqual([30]);
  });

  it('검기 다단은 가볍게 (light 경직·시전 소리 없음)', () => {
    const sim = room();
    const [m] = spawn(sim, [160, 50]);
    const hits = run(sim, 2.0, { 0: cast({}, 'gs_flash') }).flatMap((e) => (e.type === 'hit' && e.m === m ? [e.def] : []));
    expect(hits.map((d) => d.strength)).toEqual(['heavy', ...Array(10).fill('light')]);
    expect(hits[1]!.sfx?.active).toBeUndefined();
  });
});

describe('잔상', () => {
  it('베기 스킬은 0.5초 뒤 처음 자리에서 한 번 더 (50%), 원 판정 스킬은 없음', () => {
    const b = { gs_phantom: { points: 1 } };
    const sim = room(b);
    const [m] = spawn(sim, [120, 50]);
    const ev = run(sim, 1.2, { 0: cast(b, 'gs_scar') });
    expect(hitsOn(ev, m!)).toEqual([30, 15]);
    expect(ev.some((e) => e.type === 'echo' && e.echo.look === 'phantom')).toBe(true);
    const sim2 = room(b);
    const [m2] = spawn(sim2, [124, 50]);
    expect(hitsOn(run(sim2, 1.2, { 0: cast(b, 'gs_quake') }), m2!).length).toBe(1);
  });

  it('검기는 처음 쏜 자리에서 반투명 검기로 한 번 더 (3포인트 60%)', () => {
    const b = { gs_phantom: { points: 3 } };
    const sim = room(b);
    const [m] = spawn(sim, [160, 50]);
    const ev = run(sim, 1.5, { 0: cast(b, 'gs_wave'), 5: { ...none, x: -1 } });
    expect(hitsOn(ev, m!)).toEqual([35, 21]);
    expect(ev.filter((e) => e.type === 'bolt').map((e) => e.type === 'bolt' && !!e.bolt.ghost)).toEqual([false, true]);
  });
});

describe('검의 춤', () => {
  /** 검흔 베기가 끝나고 gap초 뒤 검기 날리기 */
  const chain = (b: SkillBuild, gap: number) => {
    const sim = room(b);
    const [m] = spawn(sim, [180, 50]);
    const { windup, active, recovery } = resolveSkill('gs_scar', { points: 1 }).phases;
    const ev = run(sim, 3, { 0: cast(b, 'gs_scar'), [tick(windup + active + recovery + gap)]: cast(b, 'gs_wave') });
    return hitsOn(ev, m!);
  };
  it('스킬이 끝나고 1초 안에 쓴 다음 스킬 +20% (1초 넘으면 그대로)', () => {
    expect(chain({}, 0.3)).toEqual([35]);
    expect(chain({ gs_dance: { points: 1 } }, 0.3)).toEqual([42]);
    expect(chain({ gs_dance: { points: 1 } }, 1.2)).toEqual([35]);
  });
});
