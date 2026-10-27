// 장애물 충돌 (docs/dungeon.md 10장 "장애물은 낮게, 돌진·투사체에 쓰이게"): 방 경계 + 장애물 칸
// 이동은 축마다 따로 막아 벽을 따라 미끄러지게 한다. 플레이어·몬스터 이동, 넉백, 돌진, 투사체가 같은 함수를 쓴다
import type { Bounds, Vec2 } from '../movement';

/** 장애물 사각형 (로직 px, x0 ≤ x < x1, y0 ≤ y < y1). kind = 그림 종류 (rock, stump …) */
export interface Block {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  kind: string;
}

/** 반 크기 (피격 상자 너비·깊이의 절반) */
export interface Half {
  x: number;
  y: number;
}

const POINT: Half = { x: 0, y: 0 };

/** 이 자리에 상자가 놓이면 장애물과 겹치나 */
export function hitsBlock(pos: Vec2, half: Half, b: Bounds): boolean {
  for (const k of b.blocks ?? []) {
    if (pos.x + half.x > k.x0 && pos.x - half.x < k.x1 && pos.y + half.y > k.y0 && pos.y - half.y < k.y1) return true;
  }
  return false;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** from → to 이동. 방 경계로 자르고, 장애물에 막힌 축은 제자리 (x 먼저, 그다음 y) */
export function moveBox(from: Vec2, to: Vec2, half: Half, b: Bounds): Vec2 {
  const x = clamp(to.x, b.minX, b.maxX), y = clamp(to.y, b.minY, b.maxY);
  // 이미 장애물에 겹쳐 있으면(겹침 풀기에 밀려 들어감 등) 빠져나갈 수 있게 막지 않는다
  if (!b.blocks?.length || hitsBlock(from, half, b)) return { x, y };
  const nx = hitsBlock({ x, y: from.y }, half, b) ? from.x : x;
  const ny = hitsBlock({ x: nx, y }, half, b) ? from.y : y;
  return { x: nx, y: ny };
}

/** 점(투사체 중심)이 장애물 안인가 */
export const pointBlocked = (pos: Vec2, b: Bounds): boolean => hitsBlock(pos, POINT, b);
