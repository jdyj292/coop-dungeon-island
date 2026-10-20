// shared/data JSON 스키마 (형식 docs/data.md, 값의 의미 docs/combat.md). 로드 시 한 번 검사한다
import { z } from 'zod';

export const FLAGS = ['launch', 'knockback', 'down', 'downhit', 'pull', 'hold', 'grab', 'multi', 'projectile'] as const;
export const STRENGTHS = ['light', 'medium', 'heavy'] as const;
export const GRADES = ['light', 'medium', 'heavy', 'ultimate'] as const;
export const WEIGHTS = ['light', 'medium', 'heavy', 'fixed', 'boss'] as const;
const PHASES = ['windup', 'active', 'recovery'] as const;

const sec = z.number().nonnegative();
const pos = z.number().positive();
const range = z.tuple([z.number(), z.number()]).refine(([a, b]) => a <= b, '범위는 [최소, 최대]');
const point = z.tuple([z.number(), z.number()]);
const zCond = z.enum(['ground', 'air', 'both']);
const phase = z.enum(PHASES);

const hitbox = z.object({
  forward: z.number(), width: pos, depth: pos, z: zCond, back: z.number().nonnegative().optional(),
}).strict();

const area = z.object({
  shape: z.enum(['circle', 'rect', 'fan']), at: point, z: zCond,
  radius: pos.optional(), width: pos.optional(), depth: pos.optional(), angle: pos.optional(),
}).strict().superRefine((a, ctx) => {
  if (a.shape !== 'rect' && a.radius === undefined) ctx.addIssue({ code: 'custom', message: `${a.shape}에는 radius 필요` });
  if (a.shape === 'rect' && (a.width === undefined || a.depth === undefined)) ctx.addIssue({ code: 'custom', message: 'rect에는 width·depth 필요' });
  if (a.shape === 'fan' && a.angle === undefined) ctx.addIssue({ code: 'custom', message: 'fan에는 angle 필요' });
});

const projectile = z.object({
  speed: pos, range: pos, radius: pos, pierce: z.boolean(), reflectable: z.boolean().optional(),
}).strict();

const statusType = z.enum(['freeze', 'slow', 'stun']);
const zone = z.object({
  shape: z.enum(['circle', 'rect']), at: point, radius: pos.optional(), width: pos.optional(), depth: pos.optional(),
  duration: pos,
  effect: z.object({ type: statusType, amount: z.number().optional(), time: sec.optional() }).strict(),
}).strict();

const move = z.union([
  z.object({ distance: z.number(), during: phase }).strict(),
  z.object({ speed: pos, maxDistance: pos, during: phase, stopOnWall: z.boolean().optional() }).strict(),
]);

/** 행동 공통 필드 (data.md 1장). 판정은 hitbox / area / projectile / zone 중 하나 */
export const actionFields = {
  id: z.string().min(1),
  phases: z.object({ windup: sec, active: sec, recovery: sec }).strict(),
  coef: z.number().nonnegative().optional(),
  damage: z.number().nonnegative().optional(),
  hitbox: hitbox.optional(),
  area: area.optional(),
  projectile: projectile.optional(),
  zone: zone.optional(),
  strength: z.enum(STRENGTHS).optional(),
  flags: z.array(z.enum(FLAGS)).optional(),
  launchVz: pos.optional(),
  hits: z.object({ count: z.number().int().positive(), interval: pos }).strict().optional(),
  move: move.optional(),
  status: z.object({ type: statusType, time: pos, amount: z.number().optional() }).strict().optional(),
  poses: z.object({ windup: z.string(), active: z.string(), recovery: z.string() }).partial().strict().optional(),
  fx: z.object({ grade: z.enum(GRADES), shake: z.enum(['vertical', 'horizontal']).optional() }).strict().optional(),
  sfx: z.object({ windup: z.string(), active: z.string(), hit: z.string() }).partial().strict().optional(),
  telegraph: z.object({
    type: z.enum(['shake', 'area', 'line', 'glow', 'shake+line']), length: pos.optional(),
  }).strict().optional(),
  cooldown: sec.optional(),
};

type Shape = { hitbox?: unknown; area?: unknown; projectile?: unknown; zone?: unknown; damage?: number };
const SHAPES = ['hitbox', 'area', 'projectile', 'zone'] as const;
function oneShape(a: Shape, ctx: z.RefinementCtx): void {
  const n = SHAPES.filter((k) => a[k] !== undefined).length;
  if (n > 1) ctx.addIssue({ code: 'custom', message: `판정은 ${SHAPES.join(' / ')} 중 하나만` });
  if (n === 0 && a.damage !== 0) ctx.addIssue({ code: 'custom', message: '판정이 없음 (damage 0일 때만 생략 가능)' });
}

const playerActionObj = z.object({ ...actionFields, coef: z.number().nonnegative(), poses: actionFields.poses.unwrap() }).strict();
export const playerAction = playerActionObj.superRefine(oneShape);

/** 스킬 변형의 특수 필드 (data.md 3장). 나머지 필드는 기본 스킬에 덮어써서 검사 */
export const variantExtra = z.object({
  name: z.string(),
  reinput: z.number().int().positive().optional(),
  repeat: z.object({ count: z.number().int().positive(), interval: pos }).strict().optional(),
  after: z.object({ delay: pos, coef: z.number().nonnegative() }).strict().optional(),
  onStatusEnd: z.object({ coef: z.number().nonnegative() }).strict().optional(),
});

export const skill = playerActionObj.extend({
  weapon: z.string(),
  name: z.string(),
  branch: z.enum(['base', 'A', 'B']),
  tier: z.number().int().min(1).max(4).optional(),
  cooldown: pos,
  mp: z.number().int().nonnegative(),
  variants: z.record(z.object({ name: z.string() }).passthrough()).optional(),
  note: z.string().optional(),
}).strict().superRefine(oneShape);

export const monsterAttack = z.object({
  ...actionFields,
  damage: z.number().nonnegative(),
  onWallHit: z.union([
    z.object({ selfStun: pos }).strict(), z.object({ groggy: z.literal(true) }).strict(),
  ]).optional(),
}).strict().superRefine(oneShape);

export const weapon = z.object({
  name: z.string(),
  moveMul: pos,
  visual: z.string(),
  poseSet: z.string(),
  backstepStyle: z.literal('teleport').optional(),
  trait: z.discriminatedUnion('type', [
    z.object({ type: z.literal('charge'), maxTime: pos, bonusMax: pos, superArmorWhileCharging: z.boolean() }).strict(),
    z.object({ type: z.literal('cast'), note: z.string().optional() }).strict(),
    z.object({ type: z.literal('backAttack'), mul: pos }).strict(),
  ]).nullable(),
  comboWindow: sec,
  basic: z.array(playerAction).min(1),
  dash: playerAction,
  baseSkills: z.array(z.string()),
}).strict();

const pattern = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('choose'),
    rules: z.array(z.object({
      attack: z.string(), range, alignDepth: pos.optional(), hp: z.string().optional(),
    }).strict()).min(1),
  }).strict(),
  z.object({
    type: z.literal('loop'),
    phases: z.array(z.object({ until: z.string().optional(), sequence: z.array(z.string()).min(1) }).strict()).min(1),
  }).strict(),
]);

export const monster = z.object({
  name: z.string(),
  floor: z.number().int().positive(),
  rank: z.enum(['normal', 'elite', 'boss']),
  sprite: z.string(),
  hp: pos,
  weight: z.enum(WEIGHTS),
  hurtbox: z.object({ width: pos, height: pos, depth: pos }).strict(),
  move: z.object({ x: sec, y: sec, style: z.enum(['hop', 'walk']) }).strict().nullable(),
  detectRange: pos,
  usesToken: z.boolean(),
  superArmor: z.enum(['none', 'attack', 'always']),
  ai: z.object({
    type: z.enum(['melee', 'charger', 'turret', 'boss']), preferRange: range.optional(), idleBetween: range.optional(),
  }).strict(),
  attacks: z.array(monsterAttack).min(1),
  pattern,
  groggy: z.object({ duration: pos, superArmor: z.boolean(), extend: z.record(z.unknown()).optional() }).strict().optional(),
  reward: z.object({
    coins: range, exp: z.number().nonnegative(), material: z.number().nonnegative(),
    trophy: z.string().optional(), firstClear: z.record(z.unknown()).optional(),
    skinDrop: z.object({ skin: z.string(), chance: z.number().min(0).max(1), pity: z.number().int().positive(), perPlayer: z.boolean() }).strict().optional(),
  }).strict(),
}).strict();

const speed = z.object({ x: pos, y: pos }).strict();
export const player = z.object({
  _note: z.string().optional(), move: z.object({ walk: speed, run: speed }).strict(), runDoubleTap: pos,
  hp: z.object({ base: pos, perLevel: sec }).strict(),
  mp: z.object({ max: pos, regen: sec, onHit: sec }).strict(),
  hurt: z.object({ stunSec: sec, downSec: sec, getupInvuln: sec }).strict(),
  potions: z.object({
    hp: z.object({ heal: z.number().min(0).max(1), cooldown: sec, carry: z.number().int().nonnegative() }).strict(),
    mp: z.object({ amount: pos, cooldown: sec, carry: z.number().int().nonnegative() }).strict(),
  }).strict(),
  ultimate: z.object({ max: pos, onHit: sec, onHurt: sec }).strict(),
  revive: z.object({ feathers: z.number().int().nonnegative(), hpRatio: z.number().min(0).max(1), invuln: sec }).strict(),
  hurtbox: z.object({ width: pos, height: pos, depth: pos }).strict(),
  backstep: z.object({ distance: pos, sec: pos, invuln: sec, cooldown: sec }).strict(),
}).strict();

const stun = z.object({ time: sec, push: sec }).strict();
export const combat = z.object({
  _note: z.string().optional(),
  baseAtk: pos, gravity: pos, launchVz: pos, airHitVz: sec, airGravityMul: pos, maxAirHits: z.number().int().positive(),
  bounceVz: sec, downSec: sec, downSlide: sec, getupSec: sec, wallStunSec: sec, pushRate: pos, turnWindow: sec, cooldownScale: pos, stunExitSec: sec,
  stun: z.object({ light: stun, medium: stun, heavy: stun }).strict(),
  weightMul: z.object({ light: sec, medium: sec, heavy: sec, fixed: sec, boss: sec }).strict(),
  grades: z.object(Object.fromEntries(GRADES.map((g) => [g, z.object({ hitstop: sec, shake: sec }).strict()])) as
    Record<(typeof GRADES)[number], z.ZodObject<{ hitstop: typeof sec; shake: typeof sec }>>).strict(),
  shakeAfterHitstop: sec,
  tokens: z.array(z.number().int().positive()).min(1),
  combo: z.object({ windowSec: pos }).strict(),
  ai: z.object({
    hopSec: pos, hopMove: z.number().min(0).max(1), orbitDistance: pos, orbitDepth: sec, chargerDistance: pos, separation: sec,
  }).strict(),
}).strict();

export const rooms = z.record(z.object({
  returnAfterRoom: z.number().int().positive(),
  rooms: z.array(z.object({
    id: z.string(), name: z.string(), size: z.tuple([z.number().int().positive(), z.number().int().positive()]),
    boss: z.string().optional(),
    waves: z.array(z.object({ monsters: z.record(z.number().int().positive()) }).strict()).min(1),
    onClear: z.array(z.string()).optional(),
  }).strict()).min(1),
}).strict());

export type PlayerAction = z.infer<typeof playerAction>;
export type Hitbox = z.infer<typeof hitbox>;
export type Area = z.infer<typeof area>;
export type Zone = z.infer<typeof zone>;
export type ActionMove = z.infer<typeof move>;
export type Skill = z.infer<typeof skill>;
export type MonsterAttack = z.infer<typeof monsterAttack>;
export type Weapon = z.infer<typeof weapon>;
export type MonsterDef = z.infer<typeof monster>;
export type Combat = z.infer<typeof combat>;
export type Rooms = z.infer<typeof rooms>;

/** 파일 → 스키마. notes = 바깥에 _note 등 '_' 키가 섞인 레코드 파일 (검사 전에 뺀다) */
export const FILE_SCHEMAS = {
  'weapons.json': { schema: z.record(weapon), notes: true },
  'skills.json': { schema: z.record(skill), notes: true },
  'monsters.json': { schema: z.record(monster), notes: true },
  'rooms.json': { schema: rooms, notes: true },
  'player.json': { schema: player, notes: false },
  'combat.json': { schema: combat, notes: false },
} as const;

/** '_'로 시작하는 키(_note 등)를 뺀 바깥 객체. 안쪽 객체는 원본 그대로 */
export function withoutNotes(json: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(json).filter(([k]) => !k.startsWith('_')));
}

/** 형식 검사 결과를 '경로: 메시지' 줄로 */
export function formatIssues(value: unknown, schema: z.ZodTypeAny): { path: string; message: string }[] {
  const r = schema.safeParse(value);
  return r.success ? [] : r.error.issues.map((i) => ({ path: i.path.join('.') || '(전체)', message: i.message }));
}
