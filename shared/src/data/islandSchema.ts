// shared/data/island.json 형식 (docs/data.md 8장)
import { z } from 'zod';

const cell = z.number().int().nonnegative();
const size = z.number().int().positive();
const rect = z.object({ x: cell, y: cell, w: size, h: size }).strict();

export const island = z.object({
  /** 섬 격자 (칸) */
  grid: z.object({ w: size, h: size }).strict(),
  /** 맨 앞 줄들: 모래·절벽·물 (화면 30px = 3칸) */
  shoreRows: size,
  /** 걸을 수 있는 영역 */
  walk: rect,
  /** 장식을 놓을 수 있는 영역 (island.md 2장 약 30×22) */
  place: rect,
  /** 고정 시설: 그림 id, 차지하는 칸 */
  facilities: z.array(rect.extend({ id: z.string() })).min(1),
  /** 처음부터 깔린 흙길 (바닥 무늬, 걸을 수 있음. 장식을 놓을 수 있음) */
  paths: z.array(rect),
  /** 배경 사물 (가장자리 나무, 걸을 수 없는 곳). 칸 = 발밑 */
  scenery: z.array(z.object({ id: z.string(), x: cell, y: cell }).strict()),
  /** 들어오는 자리 (칸) */
  spawn: z.object({ x: cell, y: cell }).strict(),
  /** 시설 상호작용 거리 (px, 시설 앞 가운데부터) */
  interactRange: z.number().positive(),
}).strict();

export type IslandDef = z.infer<typeof island>;

/** shared/data/items.json (docs/data.md 9장) */
export const items = z.object({
  decorations: z.record(z.object({
    name: z.string().min(1),
    /** 차지하는 칸 [가로, 세로] (회전 1·3이면 바뀜) */
    size: z.tuple([size, size]),
    price: z.number().int().positive(),
    /** 위로 걸어 다닐 수 있는지 */
    walkable: z.boolean(),
    /** shop = 잡화점·개인 지갑, treasury = 공동 금고 → 공용 창고 (island.md 3장) */
    source: z.enum(['shop', 'treasury']),
    /** 그림이 아니라 바닥 무늬 (돌길) */
    ground: z.boolean().optional(),
  }).strict()),
  /** 잡화점 소모품 (물약, island.md 5장). 가방에 쌓이고 던전 입장 때 한도까지 지참 (4-8) */
  consumables: z.record(z.object({ name: z.string().min(1), price: z.number().int().positive() }).strict()),
  /** 층 재료 (던전 보상, 정산 때 가방으로) */
  materials: z.record(z.object({ name: z.string().min(1), floor: z.number().int().positive() }).strict()),
  /** 가입 선물 (장식 id → 개수, island.md 7장) */
  starter: z.record(z.number().int().positive()),
}).strict();

export type ItemsDef = z.infer<typeof items>;
export type DecorationDef = ItemsDef['decorations'][string];
