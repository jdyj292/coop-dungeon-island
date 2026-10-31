// shared/data JSON 스키마 (형식 docs/data.md, 값의 의미 docs/combat.md). 로드 시 한 번 검사한다
import { z } from 'zod';
import { island, items } from './islandSchema';

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
  // 플레이어: 한 번에 여러 줄 (깊이 오프셋 목록), 연발 (첫 발 뒤 count−1발을 interval마다)
  lanes: z.array(z.number()).min(1).optional(),
  burst: z.object({ count: z.number().int().min(2), interval: pos }).strict().optional(),
  // 플레이어 (SK-4 1차b, data.md 3장): back = 사거리 끝에서 던진 사람에게 돌아오는 왕복 횟수, rehit = 관통하며 같은 적을 이 초마다 다시,
  // blast = 끝나는 자리(처음 닿은 적·사거리 끝·벽) 원형 판정 (관통이 아니면 닿은 적에게 직접 피해 없이 폭발만)
  back: z.number().int().positive().optional(),
  rehit: pos.optional(),
  blast: z.object({
    radius: pos, coef: z.number().nonnegative().optional(),
    // 같은 자리에 여러 번 (꽂기 장판), 폭발 뒤 작은 투사체 (분열: 각 깊이 줄에서 앞뒤로 한 발씩)
    repeat: z.object({ count: z.number().int().positive(), interval: pos }).strict().optional(),
    shards: z.object({ coef: z.number().nonnegative(), speed: pos, range: pos, radius: pos, lanes: z.array(z.number()).min(1) }).strict().optional(),
  }).strict().optional(),
}).strict();

// hold = 공중 대상 체공 유지 (time 동안 중력 없음, combat.md 3장)
const statusType = z.enum(['freeze', 'slow', 'stun', 'hold']);
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

type Shape = { hitbox?: unknown; area?: unknown; projectile?: unknown; zone?: unknown; chain?: unknown; damage?: number };
const SHAPES = ['hitbox', 'area', 'projectile', 'zone', 'chain'] as const;
function oneShape(a: Shape, ctx: z.RefinementCtx): void {
  const n = SHAPES.filter((k) => a[k] !== undefined).length;
  if (n > 1) ctx.addIssue({ code: 'custom', message: `판정은 ${SHAPES.join(' / ')} 중 하나만` });
  if (n === 0 && a.damage !== 0) ctx.addIssue({ code: 'custom', message: '판정이 없음 (damage 0일 때만 생략 가능)' });
}

const playerActionObj = z.object({ ...actionFields, coef: z.number().nonnegative(), poses: actionFields.poses.unwrap() }).strict();
export const playerAction = playerActionObj.superRefine(oneShape);

/**
 * 반복 판정 (data.md 3장): 시전한 자리에 count번 (첫 판정 포함). step = 판정마다 바라보는 쪽으로 옮기는 거리(px),
 * seek = 판정마다 가장 가까운 맞을 수 있는 몬스터 쪽으로 옮기는 거리(px), copies = 같은 반복을 이 오프셋([앞, 깊이])에 하나씩 더
 */
export const repeat = z.object({
  count: z.number().int().positive(), interval: pos, step: z.number().optional(), seek: pos.optional(), copies: z.array(point).optional(),
}).strict();
/** 이 행동의 knockback으로 벽에 부딪힌 몬스터: 다운 + 추가 판정 coef (변형 벽꿍) */
const onWall = z.object({ coef: z.number().nonnegative() }).strict();

/** 스킬 변형의 특수 필드 (data.md 3장). 나머지 필드는 기본 스킬에 덮어써서 검사 */
export const variantExtra = z.object({
  name: z.string(),
  /** 스킬 창(K) 설명 (기본 스킬과 무엇이 다른지) */
  desc: z.string().min(1),
  reinput: z.number().int().positive().optional(),
  // 기본 스킬에 repeat가 있으면 일부만 덮어써도 된다 (합친 결과는 crossCheck가 검사)
  repeat: repeat.partial().optional(),
  after: z.object({ delay: pos, coef: z.number().nonnegative() }).strict().optional(),
  onStatusEnd: z.object({ coef: z.number().nonnegative() }).strict().optional(),
  onWall: onWall.optional(),
});

export const skill = playerActionObj.extend({
  weapon: z.string(),
  name: z.string(),
  /** 스킬 창(K) 설명 (hud.md 8장) */
  desc: z.string().min(1),
  branch: z.enum(['base', 'A', 'B']),
  /** 열리는 숙련도 레벨 (계열 스킬, skills.md 1장). 없으면 1 (기본 스킬) */
  unlockLevel: z.number().int().min(1).max(99).optional(),
  cooldown: pos,
  mp: z.number().int().nonnegative(),
  variants: z.record(z.object({ name: z.string(), desc: z.string() }).passthrough()).optional(),
  note: z.string().optional(),
  // 스킬 시전 중 슈퍼아머: 맞아도 피해만 받고 행동이 끊기지 않음 (combat.md 3장)
  superArmor: z.boolean().optional(),
  repeat: repeat.optional(),
  onWall: onWall.optional(),
  // 원소 (보조 노드 연소 등이 본다). lasting = 장판·지속 스킬 (원소 친화가 지속시간·반복 횟수를 늘림)
  element: z.enum(['fire', 'ice']).optional(),
  lasting: z.boolean().optional(),
  // 연쇄 (번개 연쇄): 앞쪽 range 안 가장 가까운 적부터, jump 안의 아직 안 맞은 가장 가까운 적으로 interval마다 최대 count마리
  chain: z.object({ range: pos, jump: pos, count: z.number().int().positive(), interval: sec }).strict().optional(),
  // 검흔 (검흔 베기): 맞은 적에 time초 표식, 그 적을 내 투사체가 맞히면 터지며 coef. hop = 터지면 range 안 가장 가까운 적에게 옮겨감 (최대 count번)
  mark: z.object({
    time: pos, coef: z.number().nonnegative(),
    hop: z.object({ range: pos, count: z.number().int().positive() }).strict().optional(),
  }).strict().optional(),
  // 아군 버프 (가속장): 시전할 때 나와 판정 범위 안 동료의 스킬 쿨이 time초 동안 cooldownMul배 빨리 돈다
  allyBuff: z.object({ cooldownMul: pos, time: pos }).strict().optional(),
}).strict().superRefine(oneShape);

/** 숫자 하나 또는 포인트별 값 배열 (길이 = combat.json skillTree.maxPoints, crossCheck) */
const perPoint = <T extends z.ZodTypeAny>(t: T) => z.union([t, z.array(t).min(1)]);

/** 패시브 (data.md 3장 passives.json): 계열 보조 + 공용 패시브(weapon '*'·branch common, 무기마다 펼쳐짐).
 * unlockLevel에 열리고 SP로 0~maxPoints 포인트 (skills.md 1장). 값이 배열이면 포인트별 */
export const passive = z.object({
  id: z.string(),
  weapon: z.string(),
  branch: z.enum(['A', 'B', 'common']),
  unlockLevel: z.number().int().min(1).max(99),
  name: z.string(),
  desc: z.string().min(1),
  /** 스킬 창 포인트별 효과 줄 (길이 = maxPoints) */
  pointDesc: z.array(z.string().min(1)).min(1),
  effect: z.object({
    chargeSpeedMul: perPoint(pos).optional(),
    chargeTakenMul: perPoint(pos).optional(),
    skillArmor: z.literal(true).optional(),
    /** 스킬 시전 중 받는 피해 배율 (굳건함 2·3포인트) */
    skillTakenMul: perPoint(pos).optional(),
    /** 떨어진 적 피해 (날 선 칼날): 나와 적의 거리 minDist(px) 넘으면 × mul */
    far: z.object({ minDist: pos, mul: perPoint(pos) }).strict().optional(),
    projectileRangeMul: perPoint(pos).optional(),
    lastingMul: perPoint(pos).optional(),
    burn: z.object({ element: z.enum(['fire', 'ice']), time: perPoint(sec), takenMul: perPoint(pos) }).strict().optional(),
    /** 중압: 내가 감속시킨 적은 감속 동안 받는 피해 × takenMul */
    press: z.object({ takenMul: perPoint(pos) }).strict().optional(),
    dodge: z.object({ distanceMul: perPoint(pos), cooldownAdd: perPoint(z.number()) }).strict().optional(),
    cancel: z.object({ windupMul: z.array(pos).min(1) }).strict().optional(),
    quickRise: z.literal(true).optional(),
    /** 기상 회피로 시작한 회피의 쿨 더하기 (기상 회피 2·3포인트) */
    quickRiseCooldownAdd: perPoint(z.number()).optional(),
    // 계열 2단계 보조 (SK-4 3차, skills.md 2·3장)
    /** 여진: 내 down 판정이 맞힌 적 자리에 반경 radius 충격파 coef */
    aftershock: z.object({ coef: perPoint(z.number().nonnegative()), radius: pos }).strict().optional(),
    /** 짓밟기: 다운 대상 피해 배율 (기본 combat.json downDamageMul 대신) */
    downDamage: perPoint(pos).optional(),
    /** 올려 검기: skill이 active일 때 앞으로 검기 투사체 (coef, 관통) */
    launchWave: z.object({ skill: z.string(), coef: perPoint(z.number().nonnegative()), speed: pos, range: pos, radius: pos }).strict().optional(),
    /** 검기 순환: 스킬 투사체가 적중하면 다른 스킬 쿨 −sec초 (스킬 한 번에 한 번) */
    cycle: z.object({ sec: perPoint(pos) }).strict().optional(),
    /** 냉기 강화: 빙결(status freeze) 시간 더하기 */
    freezeAdd: perPoint(sec).optional(),
    /** 과열: 스킬 적중 뒤 time초 동안 평타 투사체가 delay초 뒤 한 발 더 */
    overheat: z.object({ time: perPoint(pos), delay: pos }).strict().optional(),
    /** 구슬 확장: skill의 판정 반지름 × radiusMul, 반복이 끝날 때 그 자리에서 한 번 더 coef */
    repeatEnd: z.object({ skill: z.string(), radiusMul: perPoint(pos), coef: perPoint(z.number().nonnegative()) }).strict().optional(),
    /** 역장: 스킬을 쓰면 나와 radius 안 동료에게 피해 1회 무효 보호막 time초 (내부 쿨 cooldown초) */
    aegis: z.object({ radius: pos, time: pos, cooldown: perPoint(pos) }).strict().optional(),
  }).strict(),
}).strict();

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
  // 근접 역경직: 내 공격이 맞으면 나만 히트스톱 × 이 값 (없으면 1, 원거리 무기는 생략)
  recoilMul: pos.optional(),
  // 평타 중 바라보는 방향 키를 누르고 있으면 전진하는 속도 px/s, 각 타 끝 stopBefore초 전부터는 전진 안 함 (없으면 전진 없음)
  basicAdvance: z.object({ speed: pos, stopBefore: sec }).strict().optional(),
  // false면 평타 콤보 중 방향 전환 불가 (없으면 평타 단계 사이 turnWindow 동안 가능, 대검 false)
  basicTurn: z.boolean().optional(),
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
  /** 계열 이름·특징 (스킬 창 계열 버튼, skills.md 1장). 계열 스킬이 있는 무기만 */
  branches: z.object(Object.fromEntries(['A', 'B'].map((k) => [k, z.object({ name: z.string(), desc: z.string() }).strict()])) as
    Record<'A' | 'B', z.ZodObject<{ name: z.ZodString; desc: z.ZodString }>>).strict().optional(),
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
  hurt: z.object({
    stunSec: sec, downSec: sec, getupInvuln: sec,
    push: z.object({ light: sec, medium: sec, heavy: sec }).strict(), pushSec: pos,
  }).strict(),
  potions: z.object({
    hp: z.object({ heal: z.number().min(0).max(1), cooldown: sec, carry: z.number().int().nonnegative() }).strict(),
    mp: z.object({ amount: pos, cooldown: sec, carry: z.number().int().nonnegative() }).strict(),
  }).strict(),
  ultimate: z.object({ max: pos, onHit: sec, onHurt: sec, onTeamMilestone: sec }).strict(),
  revive: z.object({
    feathers: z.number().int().nonnegative(), hpRatio: z.number().min(0).max(1), invuln: sec,
    partyHpRatio: z.number().min(0).max(1), holdSec: pos,
  }).strict(),
  level: z.object({ expBase: pos, expPow: pos }).strict(),
  hurtbox: z.object({ width: pos, height: pos, depth: pos }).strict(),
  backstep: z.object({ distance: pos, sec: pos, invuln: sec, cooldown: sec, depthDistance: pos }).strict(),
  stamina: z.object({ max: pos, dodge: sec, runPerSec: sec, regen: sec, regenDelay: sec }).strict(),
}).strict();

const stun = z.object({ time: sec, push: sec }).strict();
export const combat = z.object({
  _note: z.string().optional(),
  baseAtk: pos, atkPerLevel: sec, gravity: pos, launchVz: pos, airHitVz: sec, airGravityMul: pos, maxAirHits: z.number().int().positive(),
  bounceVz: sec, downSec: sec, downSlide: sec, getupSec: sec,
  /** 다운 상태 대상 피해 배율 (balance.md 1장 상황 보정, 보조 짓밟기가 올림) */
  downDamageMul: pos,
  wallStunSec: sec, pushRate: pos, turnWindow: sec, cooldownScale: pos, stunExitSec: sec,
  /** 스킬 포인트 (skills.md 1장, balance.md 1장): 노드 최대 포인트(액티브·패시브), 액티브 포인트별 레벨 배율, 재입력 받는 시간 (스킬이 끝난 뒤) */
  skillTree: z.object({ maxPoints: z.number().int().positive(), levelMul: z.array(pos).min(1), reinputWindow: pos }).strict(),
  stun: z.object({ light: stun, medium: stun, heavy: stun }).strict(),
  weightMul: z.object({ light: sec, medium: sec, heavy: sec, fixed: sec, boss: sec }).strict(),
  grades: z.object(Object.fromEntries(GRADES.map((g) => [g, z.object({ hitstop: sec, shake: sec }).strict()])) as
    Record<(typeof GRADES)[number], z.ZodObject<{ hitstop: typeof sec; shake: typeof sec }>>).strict(),
  shakeAfterHitstop: sec,
  tokens: z.array(z.number().int().positive()).min(1),
  tokenGap: z.array(z.number().min(0)).min(1),
  combo: z.object({
    windowSec: pos, teamMilestones: z.array(z.number().int().positive()), soloMilestones: z.array(z.number().int().positive()),
    coinBonus: z.array(pos),
  }).strict(),
  partyHpMul: z.array(pos).length(4),
  exit: z.object({ halfWidth: pos, depth: pos }).strict(),
  /** 우물에서 떨어지는 시간: 그동안 조작 불가·맞지 않음 (rooms.json wellDrop, combat.md 4장) */
  arriveSec: pos,
  interactRange: pos,
  returnSec: pos,
  resultDelaySec: pos,
  settle: z.object({ treasury: z.number().min(0).max(1), wipeCoinLoss: z.number().min(0).max(1) }).strict(),
  ai: z.object({
    hopSec: pos, hopMove: z.number().min(0).max(1), orbitDistance: pos, orbitDepth: sec, chargerDistance: pos, separation: sec,
    aimDepth: sec, spread: z.object({ x: pos, y: pos, lane: pos }).strict(),
  }).strict(),
}).strict();

export const rooms = z.record(z.object({
  returnAfterRoom: z.number().int().positive(),
  /** 보물상자 (onClear chest): 파티원 모두에게 */
  chest: z.object({ coins: z.number().int().nonnegative(), material: z.number().int().nonnegative() }).strict().optional(),
  /** 층 BGM (client/data/bgm.json 곡 id): 방 1~5 / 보스 방 (audio.md 5장) */
  bgm: z.object({ room: z.string(), boss: z.string() }).strict(),
  rooms: z.array(z.object({
    id: z.string(), name: z.string(), size: z.tuple([z.number().int().positive(), z.number().int().positive()]),
    /** Tiled 맵 경로 (maps/ 아래, 확장자 없이) */
    map: z.string(),
    boss: z.string().optional(),
    /** 우물에서 떨어져 들어오는 방 (층 첫 방): 들어온 플레이어는 combat.json arriveSec 동안 떨어짐 (dungeon.md 2장) */
    wellDrop: z.boolean().optional(),
    /** 몬스터가 잠든 채 시작: 누군가 착지한 뒤 이 초가 지나거나 맞으면 깨어남 (dungeon.md 5장) */
    wakeSec: pos.optional(),
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
export type Passive = z.infer<typeof passive>;
export type PassiveEffect = Passive['effect'];
export type VariantExtra = z.infer<typeof variantExtra>;
export type MonsterAttack = z.infer<typeof monsterAttack>;
export type Weapon = z.infer<typeof weapon>;
export type MonsterDef = z.infer<typeof monster>;
export type Combat = z.infer<typeof combat>;
export type Rooms = z.infer<typeof rooms>;
export type { DecorationDef, IslandDef, ItemsDef } from './islandSchema';

/** 파일 → 스키마. notes = 바깥에 _note 등 '_' 키가 섞인 레코드 파일 (검사 전에 뺀다) */
export const FILE_SCHEMAS = {
  'weapons.json': { schema: z.record(weapon), notes: true },
  'skills.json': { schema: z.record(skill), notes: true },
  'passives.json': { schema: z.record(passive), notes: true },
  'monsters.json': { schema: z.record(monster), notes: true },
  'rooms.json': { schema: rooms, notes: true },
  'player.json': { schema: player, notes: false },
  'combat.json': { schema: combat, notes: false },
  'island.json': { schema: island, notes: true },
  'items.json': { schema: items, notes: true },
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
