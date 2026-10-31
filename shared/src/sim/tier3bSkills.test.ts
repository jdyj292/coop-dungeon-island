// 대검 B 계열 3단계 (SK-7, skills.md 2장): 십자 검기(2연발·사방·교차점)·일섬(이중·반환)·잔상·검의 춤 (Lv1 ATK 10)
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

describe('십자 검기', () => {
  it('같은 줄로 두 번 (각 700%)', () => {
    const sim = room();
    const [m] = spawn(sim, [170, 50]);
    expect(hitsOn(run(sim, 1.4, { 0: cast({}, 'gs_cross') }), m!)).toEqual([70, 70]);
  });

  it('사방: 앞·뒤·위·아래 한 번에 (각 450%)', () => {
    const b = { gs_cross: { points: 1, variant: 'four' } };
    const sim = room(b);
    const ms = spawn(sim, [160, 50], [40, 50], [100 + MUZZLE, 15], [100 + MUZZLE, 85]);
    const ev = run(sim, 1.4, { 0: cast(b, 'gs_cross') });
    for (const m of ms) expect(hitsOn(ev, m)).toEqual([45]);
  });

  it('교차점: 위아래 줄이 앞 4타일에서 엇갈리며 폭발 (700% × 2 + 500%)', () => {
    const b = { gs_cross: { points: 1, variant: 'meet' } };
    const sim = room(b);
    const [mid] = spawn(sim, [100 + MUZZLE + 64, 50]);
    const ev = run(sim, 1.4, { 0: cast(b, 'gs_cross') });
    expect(hitsOn(ev, mid!).sort()).toEqual([50, 70, 70]);
    expect(ev.some((e) => e.type === 'echo' && e.echo.look === 'meet')).toBe(true);
  });
});

describe('일섬', () => {
  it('앞 12타일 한 줄 (1300%), 그 너머는 안 맞음', () => {
    const sim = room();
    const [near, far] = spawn(sim, [280, 50], [330, 50]);
    const ev = run(sim, 1.5, { 0: cast({}, 'gs_flash') });
    expect([hitsOn(ev, near!), hitsOn(ev, far!)]).toEqual([[130], []]);
  });

  it('이중 일섬은 각 750% 두 번, 반환은 0.5초 뒤 맞은 적에게 400% (움직여도)', () => {
    const dbl = { gs_flash: { points: 1, variant: 'double' } };
    const sim = room(dbl);
    const [m] = spawn(sim, [200, 50]);
    expect(hitsOn(run(sim, 1.5, { 0: cast(dbl, 'gs_flash') }), m!)).toEqual([75, 75]);
    const tr = { gs_flash: { points: 1, variant: 'trail' } };
    const sim2 = room(tr);
    const [a, b] = spawn(sim2, [200, 50], [200, 90]);
    const first = run(sim2, 0.5, { 0: cast(tr, 'gs_flash') });
    expect([hitsOn(first, a!), hitsOn(first, b!)]).toEqual([[130], []]);
    a!.body.x = 600;
    const later = run(sim2, 0.6, {});
    expect([hitsOn(later, a!), hitsOn(later, b!)]).toEqual([[40], []]);
    expect(later.some((e) => e.type === 'echo' && e.echo.look === 'cut')).toBe(true);
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
  /** 검흔 베기 후딜레이에 검기 날리기를 캔슬로 잇는다 */
  const chain = (b: SkillBuild) => {
    const sim = room(b);
    const [m] = spawn(sim, [180, 50]);
    const ev = run(sim, 1.5, { 0: cast(b, 'gs_scar'), [tick(0.32)]: cast(b, 'gs_wave') });
    return hitsOn(ev, m!);
  };
  it('스킬 캔슬로 이은 스킬 +20% (캔슬이 없으면 이어지지 않음)', () => {
    expect(chain({ 'greatsword.cancel': { points: 1 } })).toEqual([35]);
    expect(chain({ 'greatsword.cancel': { points: 1 }, gs_dance: { points: 1 } })).toEqual([42]);
    expect(chain({ gs_dance: { points: 1 } })).toEqual([]);
  });
});
