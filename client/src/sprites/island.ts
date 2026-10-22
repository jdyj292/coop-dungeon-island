// 섬 사물 (docs/sprites.md 12장): 시설·장식·배경. 승인 데모처럼 픽셀마다 색(팔레트 경로 또는 그 램프 단계)을 정해 둔 격자
// 자동 음영 없이 그대로 찍고, 바깥 4방향에 1px 외곽선 (데모 obj()와 같음)
import { z } from 'zod';
import draftIslandJson from '../../data/sprites/drafts/island.json';
import islandJson from '../../data/sprites/island.json';
import { color } from '../palette';
import { draftsOn } from './data';
import type { RenderedSprite } from './render';
import { ramp } from './shade';

const frameSchema = z.object({ rows: z.array(z.string()).min(1), foot: z.tuple([z.number().int(), z.number().int()]) });
/** 회전 방향별 프레임: "이름" 또는 "이름|flip"(좌우 반전). 배열이면 순환 (animSec마다) */
const viewSchema = z.union([z.string(), z.array(z.string()).min(1)]);
export const islandObjectSchema = z.object({
  /** 글자 → "팔레트 경로" 또는 "경로:램프 단계(0 밝음 1 기본 2 그림자 3 가장 어두움)" */
  colors: z.record(z.string()),
  frames: z.record(frameSchema),
  /** 길이 1(대칭) / 2 / 4 (art.md 6장 회전) */
  rot: z.array(viewSchema).refine((r) => [1, 2, 4].includes(r.length), '회전은 1·2·4방향'),
  animSec: z.number().positive().optional(),
});
export type IslandObject = z.infer<typeof islandObjectSchema>;

const withoutNotes = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith('_')));

export function parseIsland(raw: Record<string, unknown>): Record<string, IslandObject> {
  const out: Record<string, IslandObject> = {};
  for (const [id, v] of Object.entries(withoutNotes(raw))) {
    const o = islandObjectSchema.parse(withoutNotes(v as Record<string, unknown>));
    for (const [name, f] of Object.entries(o.frames)) {
      const w = f.rows[0]!.length;
      f.rows.forEach((r, j) => {
        if (r.length !== w) throw new Error(`island.${id}.${name}: ${j}행 길이 ${r.length} ≠ ${w}`);
        for (const ch of r) if (ch !== '.' && !o.colors[ch]) throw new Error(`island.${id}.${name}: 색이 없는 글자 '${ch}'`);
      });
    }
    for (const ref of o.rot.flat()) if (!o.frames[ref.split('|')[0]!]) throw new Error(`island.${id}.rot: 없는 프레임 ${ref}`);
    out[id] = o;
  }
  return out;
}

/** 초안: 새 사물은 통째로, 있는 사물은 프레임을 겹치고 rot·animSec은 바꿈 */
export function withIslandDrafts(base: Record<string, unknown>, drafts: Record<string, unknown>): Record<string, unknown> {
  const out = { ...base };
  for (const [id, d] of Object.entries(withoutNotes(drafts)) as [string, Partial<IslandObject>][]) {
    const b = base[id] as IslandObject | undefined;
    out[id] = b ? { ...b, ...d, colors: { ...b.colors, ...d.colors }, frames: { ...b.frames, ...d.frames } } : d;
  }
  return out;
}

let cached: { drafts: boolean; data: Record<string, IslandObject> } | undefined;

export function islandObjects(): Record<string, IslandObject> {
  const drafts = draftsOn();
  if (cached?.drafts !== drafts) {
    const raw = islandJson as Record<string, unknown>;
    cached = { drafts, data: parseIsland(drafts ? withIslandDrafts(raw, draftIslandJson as Record<string, unknown>) : raw) };
  }
  return cached.data;
}

/** 초안 프레임 이름: 사물 id → 프레임들 (미리보기 표시용) */
export const draftIslandFrames = (): Record<string, string[]> => Object.fromEntries(
  Object.entries(withoutNotes(draftIslandJson as Record<string, unknown>)).map(([id, d]) => [id, Object.keys((d as { frames?: object }).frames ?? {})]),
);

/** 색 참조 → hex ("경로" 또는 "경로:단계") */
export function islandColor(ref: string): string {
  const [path, tone] = ref.split(':');
  const hex = color(path!);
  return tone === undefined ? hex : ramp(hex)[Number(tone)]!;
}

/** 프레임 하나 → 픽셀 (외곽선 1px 포함). flip이면 좌우 반전 */
export function renderIslandFrame(o: IslandObject, frameName: string, flip = false): RenderedSprite {
  const f = o.frames[frameName];
  if (!f) throw new Error(`섬 사물 프레임 '${frameName}' 없음`);
  const rows = flip ? f.rows.map((r) => [...r].reverse().join('')) : f.rows;
  const w = rows[0]!.length, h = rows.length, width = w + 2, height = h + 2;
  const cols = Object.fromEntries(Object.entries(o.colors).map(([ch, ref]) => [ch, islandColor(ref)]));
  const filled = (i: number, j: number) => i >= 0 && j >= 0 && i < w && j < h && rows[j]![i] !== '.';
  const pixels: (string | null)[] = Array(width * height).fill(null);
  const ol = color('global.outline');
  for (let j = -1; j <= h; j++) {
    for (let i = -1; i <= w; i++) {
      const k = (j + 1) * width + (i + 1);
      if (filled(i, j)) pixels[k] = cols[rows[j]![i]!]!;
      else if (filled(i + 1, j) || filled(i - 1, j) || filled(i, j + 1) || filled(i, j - 1)) pixels[k] = ol;
    }
  }
  const footX = flip ? w - 1 - f.foot[0] : f.foot[0];
  return { width, height, pixels, foot: [footX + 1, f.foot[1] + 1] };
}

/** 회전 r(0~3)의 지금 프레임 (t = 초, 순환용) */
export function islandView(o: IslandObject, r: number, t = 0): { frame: string; flip: boolean } {
  const v = o.rot[r % o.rot.length]!;
  const list = [v].flat();
  const ref = list[Math.floor(t / (o.animSec ?? 0.5)) % list.length]!;
  const [frame, mod] = ref.split('|');
  return { frame: frame!, flip: mod === 'flip' };
}
