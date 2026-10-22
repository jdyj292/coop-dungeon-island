// 섬 공간 계산 (클라이언트·서버 공용, docs/island.md 2장): 칸 ↔ 로직 px, 걷는 경계·시설 장애물, 입장 자리, 가까운 시설
import { ISLAND } from '../data/load';
import type { Block } from '../map/collision';
import type { Bounds, Vec2 } from '../movement';
import { TILE } from '../constants';

export interface CellRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 칸 사각형 → 로직 px 장애물 */
export const cellBlock = (r: CellRect, kind: string): Block => ({ x0: r.x * TILE, y0: r.y * TILE, x1: (r.x + r.w) * TILE, y1: (r.y + r.h) * TILE, kind });

/** 섬 전체 크기 (로직 px) */
export const islandSize = (): { w: number; h: number } => ({ w: ISLAND.grid.w * TILE, h: ISLAND.grid.h * TILE });

/** 걷는 경계 + 고정 시설 장애물 (장식 장애물은 4-6에서 더함) */
export function islandBounds(extra: Block[] = []): Bounds {
  const w = ISLAND.walk;
  return {
    minX: w.x * TILE, maxX: (w.x + w.w) * TILE, minY: w.y * TILE, maxY: (w.y + w.h) * TILE - 1,
    blocks: [...ISLAND.facilities.map((f) => cellBlock(f, f.id)), ...extra],
  };
}

/**
 * 사물 발밑 (로직 px): 차지하는 칸의 가로 가운데, 맨 앞 줄 안쪽 끝.
 * 그 앞에 선 캐릭터가 사물보다 앞에 그려진다 (깊이 정렬 = y)
 */
export const footOf = (r: CellRect): Vec2 => ({ x: (r.x + r.w / 2) * TILE, y: (r.y + r.h) * TILE - 1 });

/** 입장 자리: 우물 앞, 사람마다 옆으로 한 칸씩 */
export function spawnPos(index: number): Vec2 {
  const s = ISLAND.spawn, side = [0, -1, 1, -2][index % 4]!;
  return { x: (s.x + 0.5 + side) * TILE, y: (s.y + 0.5) * TILE };
}

/** 상호작용할 수 있는 가장 가까운 시설 id (시설 앞 가운데에서 interactRange 안) */
export function nearFacility(p: Vec2): string | null {
  let best: string | null = null, bestD = ISLAND.interactRange;
  for (const f of ISLAND.facilities) {
    const front = { x: (f.x + f.w / 2) * TILE, y: (f.y + f.h) * TILE + TILE / 2 };
    // 가로는 시설 폭 안이면 거리 0으로 (넓은 시설 앞 어디서나)
    const dx = Math.max(0, Math.abs(p.x - front.x) - (f.w * TILE) / 2), dy = Math.abs(p.y - front.y);
    const d = Math.hypot(dx, dy);
    if (d <= bestD) {
      bestD = d;
      best = f.id;
    }
  }
  return best;
}
