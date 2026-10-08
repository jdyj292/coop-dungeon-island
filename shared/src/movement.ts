// 이동 계산 (클라이언트·서버 공용). 속도는 shared/data/player.json, 의미는 docs/combat.md 3장
import playerData from '../data/player.json';

export interface Vec2 {
  x: number;
  /** 깊이 */
  y: number;
}

/** 방향 입력: 각 축 -1 / 0 / 1 */
export interface MoveInput {
  x: number;
  y: number;
  run?: boolean;
}

export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export type MoveSpeed = { x: number; y: number };

export const PLAYER_MOVE: { walk: MoveSpeed; run: MoveSpeed } = playerData.move;

/** 축마다 따로 움직인다 (대각선도 정규화하지 않음: 깊이 이동이 느린 것이 핵심) */
export function stepMove(pos: Vec2, input: MoveInput, dt: number, speed: MoveSpeed, bounds: Bounds): Vec2 {
  const sx = Math.sign(input.x), sy = Math.sign(input.y);
  return {
    x: Math.min(bounds.maxX, Math.max(bounds.minX, pos.x + sx * speed.x * dt)),
    y: Math.min(bounds.maxY, Math.max(bounds.minY, pos.y + sy * speed.y * dt)),
  };
}
