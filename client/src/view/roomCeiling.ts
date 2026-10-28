// 던전 방 위쪽 (docs/art.md 6장 "땅 밑 숲"): 흙 천장·늘어진 뿌리, 우물에서 떨어지는 방(rooms.json wellDrop)은 입장 지점 위 구멍에서 내려오는 밧줄과 빛줄기
import { color } from '../palette';
import { ramp } from '../sprites/shade';
import { entryPos, type RoomDef } from '@game/shared';
import { FLOOR_TOP, project, WALL_TOP } from './layout';

/** 천장 두께 (줄) */
const CEIL_H = 4;
/** 뿌리 간격 (px) */
const ROOT_EVERY = 11;

function rng(seed: number): () => number {
  let s = seed % 2147483647 || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

/** 첫 방 우물 구멍 자리 = 혼자일 때 입장 지점 (월드 x, 화면 y) */
export function wellHole(room: RoomDef): { x: number; sy: number } {
  const start = entryPos(room, 0);
  return { x: Math.round(start.x), sy: project(start.x, start.y).sy };
}

/** hole = 첫 방 입장 지점 (월드 x, 화면 y) — 그 위 천장에 구멍, 빛줄기·밧줄 */
export function drawCeiling(b: CanvasRenderingContext2D, floor: number, roomW: number, hole?: { x: number; sy: number }): void {
  const c = (k: string) => color(`floors.${floor}.${k}`);
  const P = (x: number, y: number, col: string) => { b.fillStyle = col; b.fillRect(x, y, 1, 1); };
  const RT = ramp(c('env.trunk')), RM = ramp(c('env.moss')), RW = ramp(color('island.wood'));
  const holeL = hole ? hole.x - 7 : -99, holeR = hole ? hole.x + 7 : -99;
  const rnd = rng(11);

  // 빛줄기: 구멍에서 입장 지점까지 바둑판 디더링 (art.md 0장 예외: 빛줄기)
  if (hole) {
    b.globalAlpha = 0.35;
    for (let y = 0; y < hole.sy; y++) {
      const half = 5 + Math.floor((y / hole.sy) * 6);
      for (let x = hole.x - half; x <= hole.x + half; x++) if ((x + y) % 2 === 0) P(x, y, c('env.glow'));
    }
    b.globalAlpha = 1;
  }

  // 흙 천장: 울퉁불퉁한 아래 가장자리, 이끼 점
  for (let x = 0; x < roomW; x++) {
    if (x >= holeL && x <= holeR) continue;
    const h = CEIL_H + Math.round(Math.sin(x * 0.37) + Math.sin(x * 0.11) * 1.5);
    for (let y = 0; y < h; y++) P(x, y, y === h - 1 ? RT[3] : (x * 5 + y * 3) % 13 === 0 ? RM[2] : c('env.cliff'));
  }
  if (hole) for (let x = holeL - 1; x <= holeR + 1; x += holeR - holeL + 2) for (let y = 0; y < CEIL_H + 1; y++) P(x, y, RT[2]);

  // 늘어진 뿌리: 천장에서 나무 위(벽 위)까지 구불구불, 끝은 이끼
  for (let x0 = 4; x0 < roomW; x0 += ROOT_EVERY + Math.floor(rnd() * 6)) {
    if (x0 >= holeL - 2 && x0 <= holeR + 2) continue;
    const len = 6 + Math.floor(rnd() * (WALL_TOP - 4));
    let x = x0;
    for (let y = CEIL_H - 1; y < CEIL_H + len; y++) {
      if (rnd() < 0.25) x += rnd() < 0.5 ? -1 : 1;
      P(x, y, y === CEIL_H + len - 1 ? RM[0] : (y % 4 === 0 ? RT[0] : RT[2]));
      if (y < CEIL_H + 3) P(x + 1, y, RT[3]);
    }
  }

  // 밧줄: 구멍에서 입장 지점 바로 위까지, 끝은 매듭
  if (hole) {
    const end = Math.min(hole.sy - 18, FLOOR_TOP);
    for (let y = 0; y < end; y++) P(hole.x + (y % 6 < 3 ? 0 : 1), y, y % 3 === 0 ? RW[0] : RW[1]);
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1]] as const) P(hole.x + dx, end + dy, RW[2]);
  }
}
