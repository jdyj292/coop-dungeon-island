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
  /** 몸 전체 변화 (웅크림 등, art.md 4장): bob = 다리를 뺀 몸을 내리는 px, legs = 다리(bottom) 프레임 */
  body: z.object({ bob: z.number().int().min(0).max(4).optional(), legs: z.string().optional() }).strict().optional(),
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

/**
 * 이동·상태 모션 (art.md 4장, 무기와 상관없음). legs = 다리 프레임, bob = 다리를 뺀 몸 내림 px,
 * lean = 다리를 뺀 몸을 앞(+)·뒤(-)로 옮기는 px, face = 표정, weaponPose = 무기 포즈(없으면 지금 포즈),
 * lie = 누움: 재질 격자를 90° 돌린 뒤 음영 (back = 뒤로 누움, front = 엎드림). 누우면 무기는 그리지 않음
 */
export const motionSchema = z.object({
  legs: z.string().optional(),
  bob: z.number().int().min(0).max(4).optional(),
  lean: z.number().int().min(-3).max(3).optional(),
  face: z.string().optional(),
  weaponPose: z.string().optional(),
  lie: z.enum(['back', 'front']).optional(),
}).strict();

export const posesSchema = z.object({
  walk: z
    .object({
      cycle: z.array(z.string()).min(1),
      bob: z.array(z.number().int().min(0)).optional(),
      pxPerBeat: z.number().positive(),
    })
    .refine((w) => !w.bob || w.bob.length === w.cycle.length, 'walk.bob 길이는 cycle과 같아야 함'),
  weapons: z.record(z.record(poseSchema)),
  motions: z.record(motionSchema).default({}),
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
  /** 대기(idle) 순환 한 프레임 길이 (초) */
  idleSec: z.number().positive(),
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
export type Motion = z.infer<typeof motionSchema>;
export type Poses = z.infer<typeof posesSchema>;
export type Weapons = z.infer<typeof weaponsSchema>;
export type WeaponProfile = Weapons['profiles'][string];
export type Materials = z.infer<typeof materialsSchema>;
