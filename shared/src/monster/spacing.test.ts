import { describe, expect, it } from 'vitest';
import { COMBAT, MONSTERS } from '../data/load';
import { aimable, aimDy, ringSlot, spreadGoal, waitGoal } from './spacing';
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
  it('기다리는 자리: 10마리가 양옆·위아래로 나뉘고 서로 겹치지 않음 (일자로 줄 서지 않게)', () => {
    const slots = Array.from({ length: 10 }, (_, i) => ringSlot(newMonster(i + 1, 'mushroom', 0, 0), player));
    const left = slots.filter((s) => s.x < player.x).length, up = slots.filter((s) => s.y < player.y).length;
    expect(left).toBeGreaterThanOrEqual(3);
    expect(10 - left).toBeGreaterThanOrEqual(3);
    expect(up).toBeGreaterThanOrEqual(3);
    expect(10 - up).toBeGreaterThanOrEqual(3);
    for (const s of slots) expect(Math.hypot((s.x - player.x) / COMBAT.ai.orbitDistance, (s.y - player.y) / COMBAT.ai.orbitDepth)).toBeCloseTo(1);
    const minGap = Math.min(...slots.flatMap((a, i) => slots.slice(i + 1).map((b) => Math.hypot(a.x - b.x, a.y - b.y))));
    expect(minGap).toBeGreaterThan(8);
  });
  it('기다리는 몬스터: 제 자리로, 자리가 반대편이면 위·아래로 돌아감, 플레이어가 바로 옆이면 물러나지 않음', () => {
    const slot4 = ringSlot(newMonster(4, 'boar', 0, 0), player);
    expect(slot4.x).toBeLessThan(player.x);
    // 같은 쪽(왼쪽)에서 오면 곧장 제 자리로
    const sameSide = newMonster(4, 'boar', 0, 50);
    expect(waitGoal(sameSide, player)).toEqual(slot4);
    // 반대쪽(오른쪽)에서 같은 깊이로 오면 플레이어를 가로지르지 않고 자리 쪽 깊이(위·아래)로 먼저
    const across = newMonster(4, 'boar', 300, 50);
    const g = waitGoal(across, player)!;
    expect(g.x).toBe(300);
    expect(Math.abs(g.y - player.y)).toBe(COMBAT.ai.orbitDepth);
    const close = newMonster(4, 'boar', 110, 52);
    expect(waitGoal(close, player)).toBeNull();
  });
  it('방 밖 자리는 반대편으로 뒤집음 (벽에 몰리지 않게)', () => {
    const atWall = { x: 20, y: 50 }, bounds = { minX: 8, maxX: 400, minY: 8, maxY: 100 };
    for (let id = 1; id <= 10; id++) {
      const s = ringSlot(newMonster(id, 'mushroom', 0, 0), atWall, bounds);
      expect(s.x).toBeGreaterThanOrEqual(bounds.minX);
    }
  });
  it('내가 더 가까우면 자리를 지킴 (떨림 없음)', () => {
    const me = newMonster(1, 'mushroom', 122, 50);
    const far = newMonster(2, 'mushroom', 125, 52);
    expect(spreadGoal(me, { x: 120, y: 50 }, player, [me, far])).toEqual({ x: 120, y: 50 });
  });
});
