// 스킬 포인트·변형 (docs/skills.md 1장, balance.md 1장): 노드 규칙 검사, 변형·레벨 배율을 적용한 스킬 정의 (클라이언트·서버 공용)
// 기본 스킬은 처음부터 1포인트, 계열 스킬(A·B)은 0포인트(안 배움)에서 시작. 같은 계열·단계의 액티브는 하나만 (바꾸면 포인트가 옮겨감).
// 최대 maxPoints, variantAt 포인트에서 변형 택1. 보조 노드(passives.json)는 1포인트, 같은 계열·단계 보조끼리 택1, 슬롯에 들어가지 않음 (효과는 passives.ts).
// 노드 바꾸기·단계 열림·슬롯 장착(U I O P)은 skillLoadout.ts. 3단계·필살기는 MVP 이후
import { skillDef, type ActionDef, type WeaponDef } from './actions';
import { applyVariant } from './data/crossCheck';
import { COMBAT, PASSIVES, SKILLS, WEAPONS } from './data/load';
import { isPassive, weaponPassives } from './passives';

export interface SkillNode {
  points: number;
  variant?: string;
  /** 장착한 슬롯 (0~3 = U I O P, skillLoadout.ts). 없으면 장착 안 함 (빌드 전체에 slot이 없으면 기본 배치) */
  slot?: number;
}

/** 스킬 id → 노드. 없는 기본 스킬은 1포인트, 없는 계열 스킬은 0포인트 */
export type SkillBuild = Record<string, SkillNode>;

const TREE = COMBAT.skillTree;
/** 계열 (기본 배치에서 기본 스킬 뒤 O·P) */
export const BRANCHES = ['A', 'B'] as const;
/** 스킬 슬롯 수 (U I O P) */
export const SLOT_COUNT = 4;

export const isBaseSkill = (id: string): boolean => SKILLS[id]?.branch === 'base';
/** 노드 최소 포인트: 기본 스킬 1(공짜), 계열 스킬·보조 노드 0(안 배움) */
export const minPoints = (id: string): number => (isBaseSkill(id) ? 1 : 0);
/** 노드 최대 포인트: 보조 노드 1, 액티브 maxPoints */
export const maxPointsOf = (id: string): number => (isPassive(id) ? 1 : TREE.maxPoints);

export const nodeOf = (b: SkillBuild, id: string): SkillNode => b[id] ?? { points: minPoints(id) };

const treeCache = new WeakMap<WeaponDef, string[]>();
/** 무기 스킬 트리: 기본 스킬(키 순서) 뒤에 skills.json 순서대로 계열 스킬 */
export function treeSkills(weapon: WeaponDef): string[] {
  let ids = treeCache.get(weapon);
  if (!ids) {
    const wid = Object.keys(WEAPONS).find((k) => WEAPONS[k] === weapon);
    const branch = Object.values(SKILLS).filter((s) => s.weapon === wid && s.branch !== 'base').map((s) => s.id);
    treeCache.set(weapon, (ids = [...weapon.baseSkills, ...branch]));
  }
  return ids;
}

/** 무기의 모든 노드: 액티브(treeSkills) 뒤에 보조 노드 */
export const treeNodes = (weapon: WeaponDef): string[] => [...treeSkills(weapon), ...weaponPassives(weapon)];

/** 같은 계열·같은 단계의 다른 액티브 (택1 상대). 보조 노드는 같은 계열·단계의 다른 보조 */
export function rivalsOf(weapon: WeaponDef, id: string): string[] {
  const pv = PASSIVES[id];
  if (pv) return weaponPassives(weapon).filter((o) => o !== id && PASSIVES[o]!.branch === pv.branch && PASSIVES[o]!.tier === pv.tier);
  const s = SKILLS[id];
  if (!s || s.branch === 'base') return [];
  return treeSkills(weapon).filter((o) => o !== id && SKILLS[o]!.branch === s.branch && SKILLS[o]!.tier === s.tier);
}

/** 받은 SP: 숙련도 레벨업마다 1 + 보너스 (보스 첫 처치, MVP 이후) */
export const spTotal = (level: number, bonus = 0): number => Math.max(0, level - 1) + bonus;

/** 쓴 SP: 기본 스킬은 1포인트가 공짜 */
export const spSpent = (weapon: WeaponDef, b: SkillBuild): number =>
  treeNodes(weapon).reduce((s, id) => s + nodeOf(b, id).points - minPoints(id), 0);

export const levelMul = (points: number): number => TREE.levelMul[Math.min(Math.max(points, 1), TREE.levelMul.length) - 1] ?? 1;

const EXTRAS = ['reinput', 'repeat', 'after', 'onStatusEnd', 'onWall'] as const;
const cache = new Map<string, ActionDef>();

/** 노드를 적용한 스킬: 변형 덮어쓰기 + 특수 필드, 계수(후속·해제 판정 포함)에 레벨 배율. 1포인트·변형 없음이면 원래 정의 그대로 */
export function resolveSkill(id: string, node: SkillNode = { points: 1 }): ActionDef {
  const key = `${id}:${node.points}:${node.variant ?? ''}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const base = skillDef(id);
  const v = node.variant ? SKILLS[id]?.variants?.[node.variant] : undefined;
  let def: ActionDef = base;
  if (v) {
    def = applyVariant(base as unknown as Record<string, unknown>, v) as unknown as ActionDef;
    // 특수 필드: 기본 스킬에도 있으면(반복 등) 얕게 합친다
    for (const k of EXTRAS) {
      const val = v[k], was = (base as Record<string, unknown>)[k];
      if (val !== undefined) Object.assign(def, { [k]: typeof val === 'object' && was && typeof was === 'object' ? { ...was, ...val } : val });
    }
  }
  const mul = levelMul(node.points);
  if (mul !== 1) {
    def = { ...def, coef: def.coef * mul };
    if (def.after) def.after = { ...def.after, coef: def.after.coef * mul };
    if (def.onStatusEnd) def.onStatusEnd = { coef: def.onStatusEnd.coef * mul };
  }
  cache.set(key, def);
  return def;
}

/** 저장·전송용 문자열 "id:포인트[:변형][@슬롯],..." (기본값 노드 = 기본 스킬 1포인트·계열 스킬 0포인트이고 슬롯이 없으면 생략) */
export function encodeBuild(b: SkillBuild): string {
  return Object.entries(b)
    .filter(([id, n]) => n.points !== minPoints(id) || n.variant || n.slot !== undefined)
    .map(([id, n]) => `${id}:${n.points}${n.variant ? `:${n.variant}` : ''}${n.slot !== undefined ? `@${n.slot}` : ''}`)
    .join(',');
}

const decoded = new Map<string, SkillBuild>();

/** decodeBuild를 기억해 둔다 (그리기·입력에서 매 프레임 부름). 돌려준 객체는 고치지 않는다 */
export function buildFrom(s: string): SkillBuild {
  let b = decoded.get(s);
  if (!b) decoded.set(s, (b = decodeBuild(s)));
  return b;
}

/** encodeBuild의 반대. 모르는 스킬·변형, 잘못된 포인트·슬롯은 버린다 (보조 노드는 슬롯 없음) */
export function decodeBuild(s: string): SkillBuild {
  const out: SkillBuild = {};
  for (const part of s.split(',')) {
    const [body = '', slotText] = part.split('@');
    const [id = '', pts = '', variant] = body.split(':');
    const points = Number(pts), slot = slotText === undefined ? NaN : Number(slotText);
    if (!(SKILLS[id] || isPassive(id)) || !Number.isInteger(points) || points < 1 || points > maxPointsOf(id)) continue;
    const n: SkillNode = variant && points >= TREE.variantAt && SKILLS[id]!.variants?.[variant] ? { points, variant } : { points };
    if (SKILLS[id] && Number.isInteger(slot) && slot >= 0 && slot < SLOT_COUNT) n.slot = slot;
    out[id] = n;
  }
  return out;
}
