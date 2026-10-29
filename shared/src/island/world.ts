// 섬 공간 계산 (클라이언트·서버 공용, docs/island.md 2장): 칸 ↔ 로직 px, 시설 위치, 걷는 경계·시설 장애물, 입장 자리, 가까운 시설
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

/** 시설 (차지하는 칸). 위치는 섬마다 다름: 새 섬은 island.json 칸, 옮기면 DB (우물만 고정) */
export interface Facility extends CellRect {
  id: string;
}

/** 새 섬의 시설 위치 */
export const defaultFacilities = (): Facility[] => ISLAND.facilities.map(({ id, x, y, w, h }) => ({ id, x, y, w, h }));

/** 저장된 위치를 기본 위치에 덮어씀 (모르는 id는 무시) */
export const facilitiesWith = (saved: readonly { id: string; x: number; y: number }[]): Facility[] =>
  defaultFacilities().map((f) => {
    const s = saved.find((o) => o.id === f.id);
    return s && !isFixedFacility(f.id) ? { ...f, x: s.x, y: s.y } : f;
  });

/** 옮길 수 없는 시설 (우물) */
export const isFixedFacility = (id: string): boolean => !!ISLAND.facilities.find((f) => f.id === id)?.fixed;

/** 시설 이름 (게시판 기록) */
export const facilityName = (id: string): string | undefined => ISLAND.facilities.find((f) => f.id === id)?.name;

/** 시설 입구: 앞 줄 1칸 (비워 둠, 상호작용 자리) */
export const entranceOf = (f: CellRect): CellRect => ({ x: f.x, y: f.y + f.h, w: f.w, h: 1 });

/** 이 칸을 차지한 시설 */
export const facilityAt = (facs: readonly Facility[], cx: number, cy: number): Facility | undefined =>
  facs.find((f) => cx >= f.x && cx < f.x + f.w && cy >= f.y && cy < f.y + f.h);

/** 칸 사각형 → 로직 px 장애물 */
export const cellBlock = (r: CellRect, kind: string): Block => ({ x0: r.x * TILE, y0: r.y * TILE, x1: (r.x + r.w) * TILE, y1: (r.y + r.h) * TILE, kind });

/** 섬 전체 크기 (로직 px) */
export const islandSize = (): { w: number; h: number } => ({ w: ISLAND.grid.w * TILE, h: ISLAND.grid.h * TILE });

/** 걷는 경계 + 시설 장애물 + extra (장식 장애물) */
export function islandBounds(extra: Block[] = [], facs: readonly Facility[] = ISLAND.facilities): Bounds {
  const w = ISLAND.walk;
  return {
    minX: w.x * TILE, maxX: (w.x + w.w) * TILE, minY: w.y * TILE, maxY: (w.y + w.h) * TILE - 1,
    blocks: [...facs.map((f) => cellBlock(f, f.id)), ...extra],
  };
}

/**
 * 사물 발밑 (로직 px): 차지하는 칸의 가로 가운데, 맨 앞 줄 안쪽 끝.
 * 그 앞에 선 캐릭터가 사물보다 앞에 그려진다 (깊이 정렬 = y)
 */
export const footOf = (r: CellRect): Vec2 => ({ x: (r.x + r.w / 2) * TILE, y: (r.y + r.h) * TILE - 1 });

export type SpawnKind = 'login' | 'return';

/** 입장 자리: 접속은 선착장, 던전 복귀는 우물 앞. 사람마다 옆으로 한 칸씩 */
export function spawnPos(index: number, kind: SpawnKind = 'login'): Vec2 {
  const s = ISLAND.spawn[kind], side = [0, -1, 1, -2][index % 4]!;
  return { x: (s.x + 0.5 + side) * TILE, y: (s.y + 0.5) * TILE };
}

/** 상호작용할 수 있는 가장 가까운 시설 id (시설 앞 가운데에서 interactRange 안) */
export function nearFacility(p: Vec2, facs: readonly Facility[] = ISLAND.facilities): string | null {
  let best: string | null = null, bestD = ISLAND.interactRange;
  for (const f of facs) {
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
