import { describe, expect, it } from 'vitest';
import { PLAYER_MOVE, stepMove } from './movement';

const bounds = { minX: 0, maxX: 100, minY: 0, maxY: 50 };

describe('stepMove', () => {
  it('걷기 1초: 좌우 60, 깊이 40 (combat.md 3장)', () => {
    expect(stepMove({ x: 0, y: 0 }, { x: 1, y: 1 }, 1, PLAYER_MOVE.walk, { ...bounds, maxX: 999, maxY: 999 }))
      .toEqual({ x: 60, y: 40 });
  });
  it('입력 크기와 상관없이 방향만 본다', () => {
    expect(stepMove({ x: 10, y: 10 }, { x: -5, y: 0 }, 0.5, PLAYER_MOVE.walk, bounds)).toEqual({ x: 0, y: 10 });
  });
  it('방 경계 안으로 제한', () => {
    expect(stepMove({ x: 95, y: 48 }, { x: 1, y: 1 }, 1, PLAYER_MOVE.walk, bounds)).toEqual({ x: 100, y: 50 });
  });
});
