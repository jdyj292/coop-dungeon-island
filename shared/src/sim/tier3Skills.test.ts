// 대검 A 계열 3단계 (SK-7, skills.md 2장): 파쇄참(슈퍼아머 경직·3단 충전·즉발)·대지붕괴(다운 유지·확산·솟구침)·거인의 힘·전장 장악 (Lv1 ATK 10)
import { describe, expect, it } from 'vitest';
import { weaponDef, type ActionDef } from '../actions';
import { TICK } from '../constants';
import type { Monster } from '../monster/state';
import { perksOf, withPerks } from '../passives';
import { chargeLevel, newPlayerState, stepPlayerState, type PlayerInput, type PlayerState } from '../player';
import { resolveSkill, type SkillBuild } from '../skillTree';
import { AURA_SEC } from './echoes';
import { RoomSim, type SimEvent } from './room';

const gs = weaponDef('greatsword');
const bounds = { minX: 0, maxX: 1000, minY: 0, maxY: 100 };
const none: PlayerInput = { x: 0, y: 0, attack: false, skill: null, backstep: false };
const room = (skills: SkillBuild = {}) => new RoomSim(gs, bounds, { x: 100, y: 50 }, { ai: false, skills });
const run = (sim: RoomSim, first: PlayerInput, sec: number): SimEvent[] => {
  const events: SimEvent[] = [];
  for (let i = 0; i < Math.round(sec / TICK); i++) events.push(...sim.tick(TICK, i === 0 ? first : none).events);
  return events;
};
const spawn = (sim: RoomSim, kind: string, ...at: [number, number][]) =>
  sim.spawn(at.map(([x, y]) => ({ kind, x, y }))).map((m) => Object.assign(m, { hp: 50000, maxHp: 50000 }));
const hits = (ev: SimEvent[]) => ev.flatMap((e) => (e.type === 'hit' ? [e.damage] : []));
const hitsOn = (ev: SimEvent[], m: Monster) => ev.filter((e) => e.type === 'hit' && e.m === m).length;
const cast = (skills: SkillBuild, id: string): PlayerInput => ({ ...none, skill: withPerks(resolveSkill(id, skills[id] ?? { points: 1 }), perksOf(gs, skills)) });

/** 혼자 충전: holdSec 동안 누르고 있다가 뗀다. 발동 순간 정의와 그때까지 가장 높았던 충전 비율 */
function charge(p: PlayerState, skill: ActionDef, holdSec: number): { def: ActionDef; peak: number } {
  let t = 0, peak = 0;
  for (let i = 0; i < 600; i++) {
    const ev = stepPlayerState(p, gs, { ...none, skill: i === 0 ? skill : null, hold: t < holdSec }, TICK, bounds).events.find((e) => e.type === 'active');
    peak = Math.max(peak, chargeLevel(p, gs));
    t += TICK;
    if (ev) return { def: ev.run.def, peak };
  }
  throw new Error('발동 안 함');
}
const player = (skills: SkillBuild = {}): PlayerState => ({ ...newPlayerState({ x: 500, y: 50 }), perks: perksOf(gs, skills) });

describe('파쇄참', () => {
  it('1500%, 슈퍼아머(이끼곰)도 0.3초 경직', () => {
    const sim = room();
    const [bear] = spawn(sim, 'mossbear', [130, 50]);
    bear!.body.armor = true;
    const ev = run(sim, cast({}, 'gs_crush'), 0.65);
    expect(hits(ev)).toEqual([150]);
    expect(bear!.body.state).toBe('hitstun');
    // 다른 슈퍼아머 없는 스킬은 경직 없음
    const sim2 = room();
    const [b2] = spawn(sim2, 'mossbear', [130, 50]);
    b2!.body.armor = true;
    run(sim2, cast({}, 'gs_earthsplit'), 0.4);
    expect(b2!.body.state).toBe('idle');
  });

  it('3단 충전: 최대 2초까지 모여 1000% → 2000%, 즉발은 누르고 있어도 충전 없음', () => {
    const tri = resolveSkill('gs_crush', { points: 1, variant: 'tri' });
    const half = charge(player(), tri, tri.phases.windup + 1.0);
    expect(Math.abs(half.def.coef - 1500)).toBeLessThan(20);
    expect(half.peak).toBeCloseTo(0.5, 1);
    expect(charge(player(), tri, 5).def.coef).toBeCloseTo(2000);
    const inst = resolveSkill('gs_crush', { points: 1, variant: 'instant' });
    const r = charge(player(), inst, 5);
    expect(r.def.coef).toBe(1100);
    expect(r.peak).toBe(0);
  });
});

describe('거인의 힘', () => {
  it('충전 최대 보너스 +50% → +80% (3포인트 +100%)', () => {
    const crush = resolveSkill('gs_crush');
    expect(charge(player(), crush, 5).def.coef).toBeCloseTo(2250);
    expect(charge(player({ gs_giant: { points: 1 } }), crush, 5).def.coef).toBeCloseTo(2700);
    expect(charge(player({ gs_giant: { points: 3 } }), crush, 5).def.coef).toBeCloseTo(3000);
  });
});

describe('대지붕괴', () => {
  it('3초 동안 12번, 땅의 적은 계속 다운 (다운 대상 ×0.5)', () => {
    const sim = room();
    const [m] = spawn(sim, 'capknight', [140, 50]);
    const ev = run(sim, cast({}, 'gs_collapse'), 3.6);
    expect(hits(ev)).toEqual([12, ...Array(11).fill(6)]);
    expect(m!.body.state).toBe('down');
  });

  it('확산은 넓고 각 90%, 솟구침은 끝에 모두 띄움 (300%)', () => {
    const wide = { gs_collapse: { points: 1, variant: 'spread' } };
    const sim = room(wide);
    const [far] = spawn(sim, 'capknight', [190, 50]);
    expect(hitsOn(run(sim, cast(wide, 'gs_collapse'), 3.6), far!)).toBeGreaterThan(3);
    const base = room();
    const [far2] = spawn(base, 'capknight', [190, 50]);
    expect(hitsOn(run(base, cast({}, 'gs_collapse'), 3.6), far2!)).toBe(0);
    const rise = { gs_collapse: { points: 1, variant: 'rise' } };
    const sim2 = room(rise);
    const [m] = spawn(sim2, 'capknight', [140, 50]);
    const ev = run(sim2, cast(rise, 'gs_collapse'), 3.35);
    expect(hits(ev).at(-1)).toBe(15);
    expect(ev.some((e) => e.type === 'echo' && e.echo.look === 'rise')).toBe(true);
    expect(m!.body.state).toBe('air');
  });
});

describe('전장 장악', () => {
  it('둘레 3타일 안 적만 감속, 벗어나면 곧 풀림', () => {
    const sim = room({ gs_dominate: { points: 1 } });
    const [near, far] = spawn(sim, 'capknight', [140, 50], [200, 50]);
    run(sim, none, 0.1);
    expect(near!.slow.amount).toBeCloseTo(0.3);
    expect(far!.slow.left).toBe(0);
    near!.body.x = 300;
    run(sim, none, AURA_SEC + 0.1);
    expect(near!.slow.left).toBe(0);
  });
});
