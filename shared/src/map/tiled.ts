// Tiled JSON 맵 → 방 맵 (docs/dungeon.md 10장). 레이어: ground(그림 전용) / walls(장애물 칸, 타일 속성 kind) / objects(위치)
// 1칸 = 16px, Tiled 세로축 = 깊이(y). 배경 그림은 절차 생성(art.md 6장)이라 ground는 읽지 않는다
import { z } from 'zod';
import type { Vec2 } from '../movement';
import type { Block } from './collision';

const prop = z.object({ name: z.string(), type: z.string().optional(), value: z.union([z.string(), z.number(), z.boolean()]) });
const tiledMap = z.object({
  width: z.number().int().positive(), height: z.number().int().positive(),
  tilewidth: z.number(), tileheight: z.number(),
  tilesets: z.array(z.object({
    firstgid: z.number().int(), tiles: z.array(z.object({ id: z.number().int(), properties: z.array(prop).optional() })).optional(),
  })),
  layers: z.array(z.object({
    name: z.string(), type: z.string(), data: z.array(z.number()).optional(),
    objects: z.array(z.object({ name: z.string(), x: z.number(), y: z.number(), properties: z.array(prop).optional() })).optional(),
  })),
});

export type SpawnRole = 'front' | 'back' | 'boss';

export interface SpawnPoint extends Vec2 {
  wave: number;
  role: SpawnRole;
}

export interface RoomMap {
  /** 방 크기 (px) */
  width: number;
  depth: number;
  blocks: Block[];
  /** 입장 순서별 시작 위치 (index 속성 순) */
  starts: Vec2[];
  doorIn: Vec2 | null;
  doorOut: Vec2 | null;
  spawns: SpawnPoint[];
  returnPoint: Vec2 | null;
  chest: Vec2 | null;
}

const propOf = (props: z.infer<typeof prop>[] | undefined, name: string) => props?.find((p) => p.name === name)?.value;

/** raw = Tiled JSON 객체. 형식이 틀리면 예외 (맵 이름을 붙여서) */
export function parseTiledMap(raw: unknown, name = 'map'): RoomMap {
  const r = tiledMap.safeParse(raw);
  if (!r.success) throw new Error(`맵 ${name}: ${r.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join(', ')}`);
  const m = r.data, tw = m.tilewidth, th = m.tileheight;
  // 타일 gid → 장애물 종류
  const kinds = new Map<number, string>();
  for (const ts of m.tilesets) for (const t of ts.tiles ?? []) {
    const kind = propOf(t.properties, 'kind');
    if (typeof kind === 'string') kinds.set(ts.firstgid + t.id, kind);
  }
  const blocks: Block[] = [];
  m.layers.find((l) => l.name === 'walls')?.data?.forEach((gid, i) => {
    if (!gid) return;
    const x = (i % m.width) * tw, y = Math.floor(i / m.width) * th;
    blocks.push({ x0: x, y0: y, x1: x + tw, y1: y + th, kind: kinds.get(gid) ?? 'rock' });
  });
  const objs = m.layers.find((l) => l.name === 'objects')?.objects ?? [];
  const pos = (o: { x: number; y: number }): Vec2 => ({ x: o.x, y: o.y });
  const one = (n: string) => { const o = objs.find((x) => x.name === n); return o ? pos(o) : null; };
  return {
    width: m.width * tw, depth: m.height * th, blocks,
    starts: objs.filter((o) => o.name === 'player_start')
      .sort((a, b) => Number(propOf(a.properties, 'index') ?? 0) - Number(propOf(b.properties, 'index') ?? 0)).map(pos),
    doorIn: one('door_in'), doorOut: one('door_out'), returnPoint: one('return_point'), chest: one('chest'),
    spawns: objs.filter((o) => o.name === 'spawn').map((o) => ({
      ...pos(o), wave: Number(propOf(o.properties, 'wave') ?? 1), role: (String(propOf(o.properties, 'role') ?? 'front')) as SpawnRole,
    })),
  };
}
