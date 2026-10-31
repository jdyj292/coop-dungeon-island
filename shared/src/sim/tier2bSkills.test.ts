// 계열 2단계 새 판정 (SK-4 1차b, skills.md 2·3장): 대검 투척(왕복·꽂기)·검흔 베기(표식·터짐·옮겨감)·번개 연쇄·화염구(폭발·분열·관통)·가속장 (Lv1 ATK 10)
import { describe, expect, it } from 'vitest';
import { weaponDef } from '../actions';
import { budgetFactors, totalCoef } from '../balance/budget';
import { chargedDef } from '../charge';
import { SKILLS } from '../data/load';
import { TICK } from '../constants';
import type { Monster } from '../monster/state';
import type { PlayerInput } from '../player';
import { withPerks } from '../passives';
import { resolveSkill } from '../skillTree';
import { RoomSim, type SimEvent } from './room';

const bounds = { minX: 0, maxX: 1000, minY: 0, maxY: 100 };
const none: PlayerInput = { x: 0, y: 0, attack: false, skill: null, backstep: false };
const room = (weapon: string) => new RoomSim(weaponDef(weapon), bounds, { x: 100, y: 50 }, { ai: false });
const run = (sim: RoomSim, first: PlayerInput, sec: number): SimEvent[] => {
  const events: SimEvent[] = [];
  for (let i = 0; i < Math.round(sec / TICK); i++) events.push(...sim.tick(TICK, i === 0 ? first : none).events);
  return events;
};
const tough = (m: Monster) => Object.assign(m, { hp: 5000, maxHp: 5000 });
const spawn = (sim: RoomSim, ...at: [number, number][]) => sim.spawn(at.map(([x, y]) => ({ kind: 'capknight', x, y }))).map(tough);
const hits = (ev: SimEvent[]) => ev.flatMap((e) => (e.type === 'hit' ? [e.damage] : []));
const hitsOn = (ev: SimEvent[], m: Monster) => ev.filter((e) => e.type === 'hit' && e.m === m).length;
const cast = (id: string, variant?: string): PlayerInput => ({ ...none, skill: resolveSkill(id, variant ? { points: 3, variant } : { points: 1 }) });

describe('대검 투척', () => {
  it('꿰뚫으며 날아갔다 돌아온다: 갈 때·올 때 한 번씩', () => {
    const sim = room('greatsword');
    const [m] = spawn(sim, [150, 50]);
    const ev = run(sim, cast('gs_throw'), 2);
    expect(hits(ev)).toEqual([30, 30]);
    expect(ev.filter((e) => e.type === 'bolt')).toHaveLength(2);
    expect(sim.bolts).toHaveLength(0);
    expect(m!.hp).toBe(5000 - 60);
  });

  it('부메랑: 두 번 왕복 (4번)', () => {
    const sim = room('greatsword');
    spawn(sim, [150, 50]);
    expect(hits(run(sim, cast('gs_throw', 'boomerang'), 3))).toHaveLength(4);
  });

  it('꽂기: 돌아오지 않고 끝에서 2초 동안 8번', () => {
    const sim = room('greatsword');
    const [m] = spawn(sim, [204, 50]);
    const ev = run(sim, cast('gs_throw', 'stick'), 3);
    // 꽂힌 자리 판정 8번 (첫 번은 after, 나머지는 repeat), 맞은 적은 밀려나 몇 번은 빠질 수 있다
    expect(ev.filter((e) => e.type === 'echo').map((e) => e.type === 'echo' && e.echo.kind)).toEqual(['after', ...Array(7).fill('repeat')]);
    expect(hitsOn(ev, m!)).toBeGreaterThanOrEqual(4);
    expect(ev.filter((e) => e.type === 'bolt')).toHaveLength(1);
  });
});

describe('검흔 베기', () => {
  it('맞은 적에 검흔, 내 검기가 맞히면 터진다 (200%)', () => {
    const sim = room('greatsword');
    const [m] = spawn(sim, [120, 50]);
    expect(hits(run(sim, cast('gs_scar'), 1))).toEqual([30]);
    expect(m!.scar?.left).toBeGreaterThan(1.5);
    expect(hits(run(sim, cast('gs_wave'), 1))).toEqual([35, 20]);
    expect(m!.scar).toBeUndefined();
  });

  it('검흔은 3초 뒤 사라진다', () => {
    const sim = room('greatsword');
    const [m] = spawn(sim, [120, 50]);
    run(sim, cast('gs_scar'), 3.5);
    expect(m!.scar).toBeUndefined();
    expect(hits(run(sim, cast('gs_wave'), 1))).toEqual([35]);
  });

  it('연쇄 검흔: 터지면 가까운 적에 옮겨가고, 그 적도 검기에 맞아 터진다', () => {
    const sim = room('greatsword');
    const [a, b] = spawn(sim, [120, 50], [170, 50]);
    run(sim, cast('gs_scar', 'chain'), 1);
    expect([!!a!.scar, !!b!.scar]).toEqual([true, false]);
    const ev = run(sim, cast('gs_wave'), 1);
    expect([hitsOn(ev, a!), hitsOn(ev, b!)]).toEqual([2, 2]);
    expect(ev.filter((e) => e.type === 'echo' && e.echo.kind === 'shatter')).toHaveLength(2);
  });

  it('깊은 검흔: 400%, 옮겨가지 않음', () => {
    const sim = room('greatsword');
    const [a, b] = spawn(sim, [120, 50], [170, 50]);
    run(sim, cast('gs_scar', 'deep'), 1);
    const ev = run(sim, cast('gs_wave'), 1);
    expect(hits(ev)).toContain(52);
    expect([hitsOn(ev, a!), hitsOn(ev, b!)]).toEqual([2, 1]);
  });
});

describe('번개 연쇄', () => {
  const line = (sim: RoomSim) => spawn(sim, [60, 50], [150, 50], [190, 50], [230, 50], [270, 50], [310, 50], [350, 50]);

  it('앞쪽 가장 가까운 적부터 튀며 최대 5마리 (뒤쪽 적은 첫 대상이 아님)', () => {
    const sim = room('staff');
    const ms = line(sim);
    const ev = run(sim, cast('st_chain'), 1);
    expect(hits(ev)).toEqual([60, 60, 60, 60, 60]);
    expect(ms.map((m) => hitsOn(ev, m))).toEqual([0, 1, 1, 1, 1, 1, 0]);
  });

  it('확산 8마리 (각 420%), 집중은 한 마리 900%', () => {
    const sim = room('staff');
    line(sim);
    expect(hits(run(sim, cast('st_chain', 'spread'), 1))).toHaveLength(6);
    const one = room('staff');
    line(one);
    expect(hits(run(one, cast('st_chain', 'focus'), 1))).toEqual([117]);
  });

  it('앞쪽 7타일 안에 적이 없으면 헛방', () => {
    const sim = room('staff');
    spawn(sim, [260, 50]);
    expect(hits(run(sim, cast('st_chain'), 1))).toEqual([]);
  });
});

describe('화염구', () => {
  it('처음 닿은 적 자리에서 폭발해 둘레 적 모두 (직격 따로 없음)', () => {
    const sim = room('staff');
    const ms = spawn(sim, [180, 50], [200, 56]);
    const ev = run(sim, cast('st_fireball'), 2);
    expect(hits(ev)).toEqual([80, 80]);
    expect(ms.map((m) => m.burn.left)).toEqual([0, 0]);
  });

  it('사거리 끝에서도 폭발한다', () => {
    const sim = room('staff');
    const [m] = spawn(sim, [236, 72]);
    expect(hitsOn(run(sim, cast('st_fireball'), 2), m!)).toBe(1);
  });

  it('분열: 폭발 자리에서 작은 화염구 4개', () => {
    const sim = room('staff');
    spawn(sim, [180, 50]);
    const ev = run(sim, cast('st_fireball', 'split'), 2);
    expect(ev.filter((e) => e.type === 'bolt')).toHaveLength(5);
  });

  it('관통: 폭발 없이 꿰뚫으며 0.25초마다 다시', () => {
    const sim = room('staff');
    const [m] = spawn(sim, [160, 50]);
    const ev = run(sim, cast('st_fireball', 'pierce'), 2.5);
    expect(hitsOn(ev, m!)).toBeGreaterThanOrEqual(3);
    expect(ev.some((e) => e.type === 'echo')).toBe(false);
  });
});

describe('가속장', () => {
  it('나와 범위 안 동료의 스킬 쿨이 4초 동안 1.2배 빨리 돈다, 적 감속은 그대로', () => {
    const sim = room('staff');
    const [m] = spawn(sim, [150, 50]);
    const near = sim.addPlayer('p2', { x: 140, y: 50 }), far = sim.addPlayer('p3', { x: 400, y: 50 });
    run(sim, cast('st_gravfield', 'haste'), 0.6);
    expect(m!.slow.amount).toBeCloseTo(0.4);
    expect([sim.player.haste?.mul, near.state.haste?.mul, far.state.haste]).toEqual([1.2, 1.2, undefined]);
    near.state.cooldowns.st_orb = 1;
    run(sim, none, 0.5);
    expect(near.state.cooldowns.st_orb).toBeCloseTo(0.4, 1);
    run(sim, none, 4);
    expect(near.state.haste).toBeUndefined();
  });

  it('원소 친화(lasting)는 가속 시간도 늘린다', () => {
    expect(withPerks(resolveSkill('st_gravfield', { points: 1, variant: 'haste' }), { lastingMul: 1.25 }).allyBuff?.time).toBe(5);
  });
});

describe('계수 배율·예산 (SK-4 1차b 필드)', () => {
  it('레벨 배율·충전은 끝 판정·분열·검흔 계수도 키운다', () => {
    expect(resolveSkill('gs_scar', { points: 3, variant: 'deep' }).mark?.coef).toBeCloseTo(520);
    expect(resolveSkill('st_fireball', { points: 3, variant: 'split' }).projectile?.blast?.shards?.coef).toBeCloseTo(195);
    const stick = chargedDef(resolveSkill('gs_throw', { points: 1, variant: 'stick' }), 0.5);
    expect(stick.projectile?.blast?.coef).toBeCloseTo(90);
    expect(stick.projectile?.back).toBeUndefined();
  });

  it('왕복은 판정 2번, 폭발·연쇄는 범위 보정', () => {
    const rules = { tolerance: 0.25, factors: { launch: 0.9, hold: 0.75, pull: 0.85, control: 0.75, area: 0.85, ranged: 0.9, movement: 0.9, superArmor: 0.9, longWindup: 1.15, longRecovery: 1.1 }, rangedPx: 64, longPhaseSec: 0.5 };
    expect(totalCoef(SKILLS.gs_throw!)).toBe(600);
    expect(budgetFactors(SKILLS.st_fireball!, rules)).toContain('area');
    expect(budgetFactors(SKILLS.st_chain!, rules)).toEqual(['area', 'ranged']);
  });
});
