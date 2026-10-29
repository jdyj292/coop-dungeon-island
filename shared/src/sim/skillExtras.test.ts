// 변형 특수 판정 (data.md 3장): 재입력·후속·반복·해제 판정, 감속 상태 (Lv1 ATK 10)
import { describe, expect, it } from 'vitest';
import { weaponDef } from '../actions';
import { TICK } from '../constants';
import type { Monster } from '../monster/state';
import type { PlayerInput } from '../player';
import { resolveSkill } from '../skillTree';
import { RoomSim, type SimEvent } from './room';

const bounds = { minX: 0, maxX: 1000, minY: 0, maxY: 100 };
const none: PlayerInput = { x: 0, y: 0, attack: false, skill: null, backstep: false };
const room = (weapon: string, ai = false) => new RoomSim(weaponDef(weapon), bounds, { x: 100, y: 50 }, { ai });
const run = (sim: RoomSim, first: PlayerInput, sec: number): SimEvent[] => {
  const events: SimEvent[] = [];
  for (let i = 0; i < Math.round(sec / TICK); i++) events.push(...sim.tick(TICK, i === 0 ? first : none).events);
  return events;
};
const tough = (m: Monster) => Object.assign(m, { hp: 5000, maxHp: 5000 });
const hits = (ev: SimEvent[]) => ev.flatMap((e) => (e.type === 'hit' ? [e.damage] : []));

describe('재입력 (연속 올려베기)', () => {
  const double = resolveSkill('gs_launch', { points: 3, variant: 'double' });

  it('끝난 뒤 짧은 시간 안에 한 번 더: 쿨타임·MP를 다시 쓰지 않는다', () => {
    const sim = room('greatsword'), p = sim.player;
    run(sim, { ...none, skill: double }, 0.7);
    const mp = p.mp, cd = p.cooldowns.gs_launch!;
    expect(p.fighter.run).toBeNull();
    const ev = run(sim, { ...none, skill: double }, 0.1);
    expect(ev.some((e) => e.type === 'fighter' && e.e.type === 'start')).toBe(true);
    expect(p.mp).toBeGreaterThanOrEqual(mp);
    expect(p.cooldowns.gs_launch!).toBeCloseTo(cd - 0.1, 1);
    // 횟수를 다 쓰면 쿨타임
    run(sim, none, 0.7);
    const third = run(sim, { ...none, skill: double }, 0.1);
    expect(third.some((e) => e.type === 'fighter' && e.e.type === 'start')).toBe(false);
  });

  it('스킬 후딜레이에서 바로 이어진다', () => {
    const sim = room('greatsword');
    run(sim, { ...none, skill: double }, 0.35);
    expect(sim.player.fighter.run?.def.id).toBe('gs_launch');
    const ev = run(sim, { ...none, skill: double }, TICK);
    expect(ev.some((e) => e.type === 'fighter' && e.e.type === 'start')).toBe(true);
  });

  it('시간이 지나면 재입력 끝', () => {
    const sim = room('greatsword');
    run(sim, { ...none, skill: double }, 0.65 + 0.7);
    expect(sim.player.reinput).toBeNull();
  });
});

describe('후속 판정 (균열)', () => {
  it('1초 뒤 같은 자리에 2차 판정 300% (3포인트 ×1.3 → 39)', () => {
    const sim = room('greatsword');
    const [m] = sim.spawn([{ kind: 'mushroom', x: 130, y: 50 }]);
    tough(m!);
    const ev = run(sim, { ...none, skill: resolveSkill('gs_earthsplit', { points: 3, variant: 'crack' }) }, 1.6);
    expect(hits(ev)).toEqual([78, 39]);
    expect(ev.filter((e) => e.type === 'echo')).toHaveLength(1);
  });
});

describe('반복 판정 (연쇄)', () => {
  it('0.2초 간격 3번, 각 300% (×1.3 → 39)', () => {
    const sim = room('staff');
    const [m] = sim.spawn([{ kind: 'mushroom', x: 164, y: 50 }]);
    tough(m!);
    const ev = run(sim, { ...none, skill: resolveSkill('st_fireburst', { points: 3, variant: 'chain' }) }, 1.2);
    expect(hits(ev)).toEqual([39, 39, 39]);
  });
});

describe('해제 판정 (빙결 폭발)', () => {
  it('빙결이 풀릴 때 400% (×1.3 → 52)', () => {
    const sim = room('staff');
    const [m] = sim.spawn([{ kind: 'mushroom', x: 148, y: 50 }]);
    tough(m!);
    const ev = run(sim, { ...none, skill: resolveSkill('st_icefield', { points: 3, variant: 'shatter' }) }, 2.5);
    expect(hits(ev)).toEqual([20, 52]);
    expect(ev.some((e) => e.type === 'echo' && e.echo.kind === 'shatter')).toBe(true);
    expect(m!.frozenBy).toBeUndefined();
  });

  it('변형이 없으면 해제 판정도 없다', () => {
    const sim = room('staff');
    const [m] = sim.spawn([{ kind: 'mushroom', x: 148, y: 50 }]);
    tough(m!);
    expect(hits(run(sim, { ...none, skill: resolveSkill('st_icefield') }, 2.5))).toEqual([15]);
  });
});

describe('감속 (동토)', () => {
  it('빙결 대신 4초 동안 걷는 속도 −40%', () => {
    const sim = room('staff');
    const [m] = sim.spawn([{ kind: 'mushroom', x: 170, y: 50 }]);
    tough(m!);
    run(sim, { ...none, skill: resolveSkill('st_icefield', { points: 3, variant: 'permafrost' }) }, 0.6);
    expect(m!.frozen).toBe(0);
    expect(m!.slow.amount).toBeCloseTo(0.4);
    expect(m!.slow.left).toBeGreaterThan(3.5);
  });
});
