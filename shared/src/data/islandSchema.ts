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
  /** 시설: 그림 id, 이름(게시판 기록), 새 섬의 칸. fixed = 옮길 수 없음 (우물). 옮긴 위치는 섬마다 DB (island.md 2장) */
  facilities: z.array(rect.extend({ id: z.string(), name: z.string().min(1), fixed: z.boolean().optional() })).min(1),
  /** 처음부터 깔린 흙길 (바닥 무늬, 걸을 수 있음. 장식을 놓을 수 있음) */
  paths: z.array(rect),
  /** 배경 사물 (가장자리 나무·선착장). 칸 = 발밑. ground = 바닥 높이 (캐릭터가 위를 걸음, 늘 캐릭터 아래에 그림) */
  scenery: z.array(z.object({ id: z.string(), x: cell, y: cell, ground: z.boolean().optional() }).strict()),
  /** 들어오는 자리 (칸): login = 접속 (남쪽 선착장), return = 던전에서 돌아옴 (우물 앞) */
  spawn: z.object({ login: z.object({ x: cell, y: cell }).strict(), return: z.object({ x: cell, y: cell }).strict() }).strict(),
  /** 던전에서 나온 뒤 이 초 안에 섬에 들어오면 return 자리 */
  returnWindowSec: z.number().positive(),
  /** 새 섬에 처음부터 놓인 공용 장식 (island.md 7장). 옮기고 치울 수 있음 (치우면 공용 창고) */
  starterDecor: z.array(z.object({ itemId: z.string(), x: cell, y: cell, rot: z.number().int().min(0).max(3) }).strict()),
  /** 시설 상호작용 거리 (px, 시설 앞 가운데부터) */
  interactRange: z.number().positive(),
  /** 우물 출발 (island.md 6장): 카운트다운 초, 파티 최대, 갈 수 있는 층 (rooms.json 키) */
  well: z.object({ countdownSec: z.number().positive(), maxParty: z.number().int().min(1).max(4), floors: z.array(z.string()).min(1) }).strict(),
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
