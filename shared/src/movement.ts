// 이동 계산 (클라이언트·서버 공용). 속도는 shared/data/player.json, 의미는 docs/combat.md 1장
import { PLAYER } from './data/load';

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

export const PLAYER_MOVE: { walk: MoveSpeed; run: MoveSpeed } = PLAYER.move;

/** 걷기·달리기 기본 속도 × 무기 배율 (weapons.json moveMul) */
export function moveSpeed(run: boolean, moveMul = 1): MoveSpeed {
  const s = run ? PLAYER.move.run : PLAYER.move.walk;
  return { x: s.x * moveMul, y: s.y * moveMul };
}

/** 축마다 따로 움직인다 (대각선도 정규화하지 않음: 깊이 이동이 느린 것이 핵심) */
export function stepMove(pos: Vec2, input: MoveInput, dt: number, speed: MoveSpeed, bounds: Bounds): Vec2 {
  const sx = Math.sign(input.x), sy = Math.sign(input.y);
  return {
    x: Math.min(bounds.maxX, Math.max(bounds.minX, pos.x + sx * speed.x * dt)),
    y: Math.min(bounds.maxY, Math.max(bounds.minY, pos.y + sy * speed.y * dt)),
  };
}

/** 달리기 판정 상태 (틱마다 갱신) */
export interface RunState {
  running: boolean;
  /** 달리는 방향 */
  dir: number;
  /** 직전 틱의 좌우 입력 */
  prevX: number;
  lastTapDir: number;
  lastTapAt: number;
  time: number;
}

export const newRunState = (): RunState => ({ running: false, dir: 0, prevX: 0, lastTapDir: 0, lastTapAt: -Infinity, time: 0 });

/**
 * 좌우를 같은 방향으로 runDoubleTap초 안에 두 번 누르면(떼었다 다시) 달리기.
 * 좌우를 떼거나 반대로 누르면 해제 (combat.md 1장 조작)
 */
export function stepRun(s: RunState, inputX: number, dt: number): boolean {
  s.time += dt;
  const x = Math.sign(inputX);
  if (x !== 0 && x !== s.prevX) {
    if (x === s.lastTapDir && s.time - s.lastTapAt <= PLAYER.runDoubleTap) {
      s.running = true;
      s.dir = x;
    }
    s.lastTapDir = x;
    s.lastTapAt = s.time;
  }
  if (s.running && x !== s.dir) s.running = false;
  s.prevX = x;
  return s.running;
}
