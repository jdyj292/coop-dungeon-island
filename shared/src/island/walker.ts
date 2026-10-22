// 섬에서 걷기 (클라이언트 예측·서버 공용): 전투 없이 이동·달리기·방향만. 속도는 던전과 같은 player.json move
import { moveSpeed, newRunState, stepMove, stepRun, type Bounds, type RunState, type Vec2 } from '../movement';

export interface Walker {
  pos: Vec2;
  /** 1 오른쪽 / −1 왼쪽 */
  facing: number;
  run: RunState;
  moving: boolean;
}

export interface WalkInput {
  mx: number;
  my: number;
  /** 클라이언트가 두 번 누르기로 판정한 달리기 (network.md 4장) */
  run: boolean;
}

export const newWalker = (pos: Vec2, facing = 1): Walker => ({ pos: { ...pos }, facing, run: newRunState(), moving: false });

export const cloneWalker = (w: Walker): Walker => ({ ...w, pos: { ...w.pos }, run: { ...w.run } });

/** 한 틱 */
export function stepWalker(w: Walker, input: WalkInput, dt: number, bounds: Bounds): void {
  const running = stepRun(w.run, input.mx, dt, input.run);
  const before = w.pos;
  w.pos = stepMove(w.pos, { x: input.mx, y: input.my, run: running }, dt, moveSpeed(running), bounds);
  if (input.mx) w.facing = Math.sign(input.mx);
  w.moving = w.pos.x !== before.x || w.pos.y !== before.y;
}
