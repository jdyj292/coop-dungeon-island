// 장식 배치 규칙 (클라이언트·서버 공용, docs/island.md 3장): 차지하는 칸, 놓을 수 있는지, 걷기 장애물, 시설 옮기기 (2장)
import { ISLAND, ITEMS } from '../data/load';
import type { Block } from '../map/collision';
import { playerHalf, type Vec2 } from '../movement';
import { TILE } from '../constants';
import { cellBlock, entranceOf, isFixedFacility, type CellRect, type Facility } from './world';

export interface Placed {
  id: string;
  itemId: string;
  /** 왼쪽 위 칸 */
  x: number;
  y: number;
  /** 회전 0~3 (90° 단위) */
  rot: number;
}

export type PlaceFail = 'unknown' | 'outside' | 'facility' | 'clearance' | 'overlap' | 'occupied' | 'fixed' | 'entrance';

/** 차지하는 칸: 회전 1·3이면 가로·세로가 바뀐다 (벤치 2×1 → 1×2) */
export function footprint(itemId: string, x: number, y: number, rot: number): CellRect {
  const [w, h] = ITEMS.decorations[itemId]?.size ?? [1, 1];
  return rot % 2 ? { x, y, w: h, h: w } : { x, y, w, h };
}

const overlaps = (a: CellRect, b: CellRect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** 비워 둘 칸: 우물 주변 1칸, 다른 시설은 입구(앞 줄) 1칸 (동선 보장), 들어오는 자리 두 곳의 줄 (spawnPos 4칸, 갇히지 않게) */
export function reservedCells(facs: readonly Facility[] = ISLAND.facilities): CellRect[] {
  return [
    ...facs.map((f) => (f.id === 'well' ? { x: f.x - 1, y: f.y - 1, w: f.w + 2, h: f.h + 2 } : entranceOf(f))),
    ...Object.values(ISLAND.spawn).map((s) => ({ x: s.x - 2, y: s.y, w: 4, h: 1 })),
  ];
}

/**
 * 놓을 수 있으면 null, 아니면 이유. ignoreId = 옮기는 중인 자기 자신. facs = 이 섬의 시설 위치.
 * 걸을 수 없는 장식은 주민이 서 있는 칸에 놓을 수 없다 (갇히지 않게)
 */
export function canPlace(itemId: string, x: number, y: number, rot: number, placed: readonly Placed[], residents: readonly Vec2[] = [], ignoreId?: string, facs: readonly Facility[] = ISLAND.facilities): PlaceFail | null {
  const def = ITEMS.decorations[itemId];
  if (!def) return 'unknown';
  const r = footprint(itemId, x, y, rot);
  if (!inPlaceArea(r)) return 'outside';
  if (facs.some((f) => overlaps(r, f))) return 'facility';
  if (reservedCells(facs).some((c) => overlaps(r, c))) return 'clearance';
  if (placed.some((p) => p.id !== ignoreId && overlaps(r, footprint(p.itemId, p.x, p.y, p.rot)))) return 'overlap';
  if (!def.walkable && standsOn(r, residents)) return 'occupied';
  return null;
}

/** 이 칸들 위에 주민이 서 있음 */
function standsOn(r: CellRect, residents: readonly Vec2[]): boolean {
  const b = cellBlock(r, ''), h = playerHalf();
  return residents.some((p) => p.x + h.x > b.x0 && p.x - h.x < b.x1 && p.y + h.y > b.y0 && p.y - h.y < b.y1);
}

const inPlaceArea = (r: CellRect): boolean => {
  const P = ISLAND.place;
  return r.x >= P.x && r.y >= P.y && r.x + r.w <= P.x + P.w && r.y + r.h <= P.y + P.h;
};

/**
 * 시설 옮기기 (island.md 2장, 주민 누구나): 옮길 수 있으면 null. 우물은 고정, 회전 없음.
 * 장식 규칙에 더해 새 입구(앞 줄 1칸)도 놓는 영역 안이고 장식·다른 시설이 없어야 한다
 */
export function canMoveFacility(id: string, x: number, y: number, facs: readonly Facility[], placed: readonly Placed[], residents: readonly Vec2[] = []): PlaceFail | null {
  const f = facs.find((o) => o.id === id);
  if (!f) return 'unknown';
  if (isFixedFacility(id)) return 'fixed';
  const r = { x, y, w: f.w, h: f.h }, door = entranceOf(r), others = facs.filter((o) => o.id !== id);
  if (!inPlaceArea(r) || !inPlaceArea(door)) return 'outside';
  if (others.some((o) => overlaps(r, o) || overlaps(door, o))) return 'facility';
  if (reservedCells(others).some((c) => overlaps(r, c))) return 'clearance';
  const decor = placed.map((p) => footprint(p.itemId, p.x, p.y, p.rot));
  if (decor.some((d) => overlaps(r, d))) return 'overlap';
  if (decor.some((d) => overlaps(door, d))) return 'entrance';
  if (standsOn(r, residents)) return 'occupied';
  return null;
}

/** 걸을 수 없는 장식 → 이동 장애물 (islandBounds에 더함) */
export const placementBlocks = (placed: readonly Placed[]): Block[] =>
  placed.filter((p) => !ITEMS.decorations[p.itemId]?.walkable).map((p) => cellBlock(footprint(p.itemId, p.x, p.y, p.rot), p.itemId));

/** 이 칸을 차지한 장식 (없으면 undefined) */
export const placedAt = (placed: readonly Placed[], cx: number, cy: number): Placed | undefined =>
  placed.find((p) => overlaps({ x: cx, y: cy, w: 1, h: 1 }, footprint(p.itemId, p.x, p.y, p.rot)));

/** 로직 px → 칸 */
export const cellOf = (p: Vec2): { x: number; y: number } => ({ x: Math.floor(p.x / TILE), y: Math.floor(p.y / TILE) });
