// 캐릭터 스프라이트 데이터 스키마 (docs/sprites.md). 로드 시 한 번 검사한다
import { z } from 'zod';

const point = z.tuple([z.number().int(), z.number().int()]);
const rows = z.array(z.string()).min(1);

export const LAYERS = [
  'weapon_back', 'cape', 'back_arm', 'bottom', 'top', 'neck', 'head',
  'face', 'hair', 'hat', 'shoulder', 'front_arm', 'weapon',
] as const;
export const SLOTS = ['hat', 'top', 'bottom', 'cape'] as const;

const layer = z.enum(LAYERS);

export const partSchema = z
  .object({
    layer,
    offset: point,
    rows: rows.optional(),
    frames: z.record(rows).optional(),
  })
  .refine((p) => !!p.rows !== !!p.frames, 'rows와 frames 중 하나만');

export const baseSchema = z.object({
  box: point,
  foot: point,
  shoulders: z.object({ front: point, back: point }),
  defaultHands: z.object({ front: point, back: point }),
  layerOrder: z.array(layer).length(LAYERS.length),
  parts: z.array(partSchema),
  faces: z.record(z.object({ offset: point, rows })),
  hairStyles: z.record(z.array(partSchema)),
});

export const outfitsSchema = z.object({
  items: z.record(
    z.object({
      slot: z.enum(SLOTS),
      name: z.string(),
      sleeve: z.string().length(1).optional(),
      parts: z.array(partSchema),
    }),
  ),
  sets: z.record(z.array(z.string())),
});

const dir = point.refine(
  ([x, y]) => Math.abs(x) <= 1 && Math.abs(y) <= 1 && (x !== 0 || y !== 0),
  'dir은 8방향',
);

const hand = z.object({
  hand: point,
  gauntlet: z.boolean().optional(),
  detached: z.boolean().optional(),
});

export const poseSchema = z.object({
  front: hand.nullable().optional(),
  back: hand.nullable().optional(),
  weapons: z
    .array(
      z.object({
        hand: z.enum(['front', 'back']),
        dir,
        behind: z.boolean().optional(),
        origin: point.optional(),
      }),
    )
    .optional(),
  fx: z.record(z.unknown()).optional(),
});

export const posesSchema = z.object({
  walk: z.object({ cycle: z.array(z.string()).min(1) }),
  weapons: z.record(z.record(poseSchema)),
});

const weaponPart = z
  .object({
    at: z.number().int().optional(),
    from: z.number().int().optional(),
    to: z.number().int().optional(),
    mat: z.string().length(1),
    width: z.number().int().positive().optional(),
    block: z.number().int().positive().optional(),
  })
  .refine((p) => (p.at !== undefined) !== (p.from !== undefined && p.to !== undefined), 'at 또는 from~to');

export const weaponsSchema = z.object({
  profiles: z.record(
    z
      .object({
        type: z.string(),
        parts: z.array(weaponPart).optional(),
        gauntlet: z.object({ mat: z.string().length(1), size: z.number().int().positive() }).optional(),
      })
      .passthrough(),
  ),
});

export const materialsSchema = z.object({
  shaded: z.record(z.string()),
  fixed: z.record(z.string()),
});

/** 몬스터: 프레임마다 완성된 재질 격자 (docs/sprites.md 6장) */
export const monsterFrameSchema = z.object({
  rows,
  foot: point,
  offset: point.optional(),
  shake: z.boolean().optional(),
  spin: z.boolean().optional(),
  superArmorOutline: z.boolean().optional(),
  fx: z.array(z.object({ type: z.string(), at: point }).passthrough()).optional(),
});

export const monsterSchema = z.object({
  materials: z.record(z.string()),
  fixedExtra: z.record(z.string()).optional(),
  frames: z.record(monsterFrameSchema),
  states: z.record(z.union([z.string(), z.array(z.string()).min(1)])),
});

export const monstersSchema = z.record(monsterSchema);

export type Point = z.infer<typeof point>;
export type MonsterFrame = z.infer<typeof monsterFrameSchema>;
export type Monster = z.infer<typeof monsterSchema>;
export type Layer = z.infer<typeof layer>;
export type Part = z.infer<typeof partSchema>;
export type Base = z.infer<typeof baseSchema>;
export type Outfits = z.infer<typeof outfitsSchema>;
export type Pose = z.infer<typeof poseSchema>;
export type Poses = z.infer<typeof posesSchema>;
export type Weapons = z.infer<typeof weaponsSchema>;
export type WeaponProfile = Weapons['profiles'][string];
export type Materials = z.infer<typeof materialsSchema>;
