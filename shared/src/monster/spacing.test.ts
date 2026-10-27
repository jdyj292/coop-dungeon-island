import { describe, expect, it } from 'vitest';
import { COMBAT, MONSTERS } from '../data/load';
import { aimable, aimDy, spreadGoal } from './spacing';
import { newMonster } from './state';

const atk = (kind: string, id: string) => MONSTERS[kind]!.attacks.find((a) => a.id === id)!;
const player = { x: 100, y: 50 };

describe('대각선 조준 (dungeon.md 3장)', () => {
  it('내려치기·박치기는 조준, 돌진·투사체는 똑바로', () => {
    expect(aimable(atk('mushroom', 'mushroom_slam'))).toBe(true);
    expect(aimable(atk('capknight', 'capknight_slam'))).toBe(true);
    expect(aimable(atk('boar', 'boar_charge'))).toBe(false);
    expect(aimable(atk('sporeflower', 'spore_shot'))).toBe(false);
  });
  it('플레이어 깊이 쪽으로, 최대 aimDepth', () => {
    const m = newMonster(1, 'capknight', 130, 40);
    const slam = atk('capknight', 'capknight_slam');
    expect(aimDy(m, slam, { x: 100, y: 46 })).toBe(6);
    expect(aimDy(m, slam, { x: 100, y: 90 })).toBe(COMBAT.ai.aimDepth);
    expect(aimDy(m, slam, { x: 100, y: 0 })).toBe(-COMBAT.ai.aimDepth);
    expect(aimDy(m, atk('boar', 'boar_charge'), { x: 100, y: 90 })).toBe(0);
  });
});

describe('퍼지기', () => {
  it('앞자리가 비었으면 그대로', () => {
    const m = newMonster(1, 'mushroom', 160, 50);
    expect(spreadGoal(m, { x: 120, y: 50 }, player, [m])).toEqual({ x: 120, y: 50 });
  });
  it('플레이어에 더 가까운 동료가 그 자리에 있으면 반대편으로, 반대편도 막히면 옆 줄', () => {
    const front = newMonster(1, 'mushroom', 122, 50);
    const me = newMonster(2, 'mushroom', 160, 50);
    expect(spreadGoal(me, { x: 120, y: 50 }, player, [front, me])).toEqual({ x: 80, y: 50 });
    const behind = newMonster(3, 'mushroom', 80, 50);
    expect(spreadGoal(me, { x: 120, y: 50 }, player, [front, behind, me])).toEqual({ x: 120, y: 50 + COMBAT.ai.spread.lane });
  });
  it('내가 더 가까우면 자리를 지킴 (떨림 없음)', () => {
    const me = newMonster(1, 'mushroom', 122, 50);
    const far = newMonster(2, 'mushroom', 125, 52);
    expect(spreadGoal(me, { x: 120, y: 50 }, player, [me, far])).toEqual({ x: 120, y: 50 });
  });
});
