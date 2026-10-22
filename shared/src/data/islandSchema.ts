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
