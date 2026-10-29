// 스킬 포인트·변형 (docs/skills.md 1장, balance.md 1장): 노드 규칙 검사, 변형·레벨 배율을 적용한 스킬 정의 (클라이언트·서버 공용)
// MVP 보충 범위는 기본 스킬 2개만: 처음부터 1포인트, 최대 maxPoints, variantAt 포인트에서 변형 택1. 계열·슬롯은 MVP 이후
import { skillDef, type ActionDef, type WeaponDef } from './actions';
import { applyVariant } from './data/crossCheck';
import { COMBAT, SKILLS } from './data/load';

export interface SkillNode {
  points: number;
  variant?: string;
}

/** 스킬 id → 노드. 없는 기본 스킬은 1포인트 */
export type SkillBuild = Record<string, SkillNode>;

const TREE = COMBAT.skillTree;

export const nodeOf = (b: SkillBuild, id: string): SkillNode => b[id] ?? { points: 1 };

/** 받은 SP: 숙련도 레벨업마다 1 + 보너스 (보스 첫 처치, MVP 이후) */
export const spTotal = (level: number, bonus = 0): number => Math.max(0, level - 1) + bonus;

/** 쓴 SP: 기본 스킬은 1포인트가 공짜 */
export const spSpent = (weapon: WeaponDef, b: SkillBuild): number =>
  weapon.baseSkills.reduce((s, id) => s + nodeOf(b, id).points - 1, 0);

export type NodeFail = 'skill' | 'points' | 'variant' | 'sp';

/** 이 노드로 바꿔도 되나 (sp = 받은 SP). 변형은 variantAt 포인트 이상일 때만 */
export function checkNode(weapon: WeaponDef, b: SkillBuild, id: string, node: SkillNode, sp: number): NodeFail | null {
  if (!weapon.baseSkills.includes(id)) return 'skill';
  if (!Number.isInteger(node.points) || node.points < 1 || node.points > TREE.maxPoints) return 'points';
  if (node.variant !== undefined && (node.points < TREE.variantAt || !SKILLS[id]?.variants?.[node.variant])) return 'variant';
  if (spSpent(weapon, { ...b, [id]: node }) > sp) return 'sp';
  return null;
}

export const levelMul = (points: number): number => TREE.levelMul[Math.min(points, TREE.levelMul.length) - 1] ?? 1;

const EXTRAS = ['reinput', 'repeat', 'after', 'onStatusEnd'] as const;
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
    for (const k of EXTRAS) if (v[k] !== undefined) Object.assign(def, { [k]: v[k] });
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

/** 무기 스킬을 키 순서대로 (노드 적용) */
export const weaponSkills = (weapon: WeaponDef, b: SkillBuild): ActionDef[] => weapon.baseSkills.map((id) => resolveSkill(id, nodeOf(b, id)));

/** 이 무기로 쓸 수 있는 스킬이면 노드를 적용한 정의 */
export const buildSkill = (weapon: WeaponDef, b: SkillBuild, id: string): ActionDef | undefined =>
  weapon.baseSkills.includes(id) ? resolveSkill(id, nodeOf(b, id)) : undefined;

/** 저장·전송용 문자열 "id:포인트[:변형],..." (1포인트·변형 없음은 생략) */
export function encodeBuild(b: SkillBuild): string {
  return Object.entries(b)
    .filter(([, n]) => n.points > 1 || n.variant)
    .map(([id, n]) => (n.variant ? `${id}:${n.points}:${n.variant}` : `${id}:${n.points}`))
    .join(',');
}

const decoded = new Map<string, SkillBuild>();

/** decodeBuild를 기억해 둔다 (그리기·입력에서 매 프레임 부름). 돌려준 객체는 고치지 않는다 */
export function buildFrom(s: string): SkillBuild {
  let b = decoded.get(s);
  if (!b) decoded.set(s, (b = decodeBuild(s)));
  return b;
}

/** encodeBuild의 반대. 모르는 스킬·변형, 잘못된 포인트는 버린다 */
export function decodeBuild(s: string): SkillBuild {
  const out: SkillBuild = {};
  for (const part of s.split(',')) {
    const [id = '', pts = '', variant] = part.split(':');
    const points = Number(pts);
    if (!SKILLS[id] || !Number.isInteger(points) || points < 1 || points > TREE.maxPoints) continue;
    out[id] = variant && points >= TREE.variantAt && SKILLS[id]!.variants?.[variant] ? { points, variant } : { points };
  }
  return out;
}
