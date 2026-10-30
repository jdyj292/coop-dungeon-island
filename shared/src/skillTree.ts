// 스킬 포인트·변형 (docs/skills.md 1장, balance.md 1장): 노드 규칙 검사, 변형·레벨 배율을 적용한 스킬 정의 (클라이언트·서버 공용)
// 기본 스킬은 처음부터 1포인트, 계열 스킬(A·B)은 0포인트(안 배움)에서 시작. 같은 계열·단계의 액티브는 하나만 (바꾸면 포인트가 옮겨감).
// 최대 maxPoints, variantAt 포인트에서 변형 택1. 슬롯 = 기본 스킬 순서 + A·B 계열에서 배운 스킬 (U I O P). 2단계 이상·보조·슬롯 장착은 MVP 이후
import { skillDef, type ActionDef, type WeaponDef } from './actions';
import { applyVariant } from './data/crossCheck';
import { COMBAT, SKILLS, WEAPONS } from './data/load';

export interface SkillNode {
  points: number;
  variant?: string;
}

/** 스킬 id → 노드. 없는 기본 스킬은 1포인트, 없는 계열 스킬은 0포인트 */
export type SkillBuild = Record<string, SkillNode>;

const TREE = COMBAT.skillTree;
/** 계열 슬롯 순서 (기본 스킬 뒤 O·P) */
export const BRANCHES = ['A', 'B'] as const;

export const isBaseSkill = (id: string): boolean => SKILLS[id]?.branch === 'base';
/** 노드 최소 포인트: 기본 스킬 1(공짜), 계열 스킬 0(안 배움) */
export const minPoints = (id: string): number => (isBaseSkill(id) ? 1 : 0);

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

/** 같은 계열·같은 단계의 다른 액티브 (택1 상대) */
export function rivalsOf(weapon: WeaponDef, id: string): string[] {
  const s = SKILLS[id];
  if (!s || s.branch === 'base') return [];
  return treeSkills(weapon).filter((o) => o !== id && SKILLS[o]!.branch === s.branch && SKILLS[o]!.tier === s.tier);
}

/** 받은 SP: 숙련도 레벨업마다 1 + 보너스 (보스 첫 처치, MVP 이후) */
export const spTotal = (level: number, bonus = 0): number => Math.max(0, level - 1) + bonus;

/** 쓴 SP: 기본 스킬은 1포인트가 공짜 */
export const spSpent = (weapon: WeaponDef, b: SkillBuild): number =>
  treeSkills(weapon).reduce((s, id) => s + nodeOf(b, id).points - minPoints(id), 0);

/** 노드 하나를 바꾼 빌드: 계열 스킬을 배우면 같은 단계 상대는 지운다 (포인트가 옮겨감). 기본값 노드는 지운다 */
export function applyNode(weapon: WeaponDef, b: SkillBuild, id: string, node: SkillNode): SkillBuild {
  const out: SkillBuild = { ...b };
  if (node.points > 0) for (const r of rivalsOf(weapon, id)) delete out[r];
  if (node.points === minPoints(id) && !node.variant) delete out[id];
  else out[id] = node;
  return out;
}

export type NodeFail = 'skill' | 'points' | 'variant' | 'sp';

/** 이 노드로 바꿔도 되나 (sp = 받은 SP). 변형은 variantAt 포인트 이상일 때만. 택1 상대를 지운 뒤의 SP로 센다 */
export function checkNode(weapon: WeaponDef, b: SkillBuild, id: string, node: SkillNode, sp: number): NodeFail | null {
  if (!treeSkills(weapon).includes(id)) return 'skill';
  if (!Number.isInteger(node.points) || node.points < minPoints(id) || node.points > TREE.maxPoints) return 'points';
  if (node.variant !== undefined && (node.points < TREE.variantAt || !SKILLS[id]?.variants?.[node.variant])) return 'variant';
  if (spSpent(weapon, applyNode(weapon, b, id, node)) > sp) return 'sp';
  return null;
}

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

/** 슬롯(U I O P) 순서의 스킬 id: 기본 스킬, 그다음 계열마다 배운 1단계 액티브 (없으면 null) */
export function slotSkills(weapon: WeaponDef, b: SkillBuild): (string | null)[] {
  const tree = treeSkills(weapon);
  return [
    ...weapon.baseSkills,
    ...BRANCHES.map((br) => tree.find((id) => SKILLS[id]!.branch === br && SKILLS[id]!.tier === 1 && nodeOf(b, id).points > 0) ?? null),
  ];
}

/** 무기 스킬을 슬롯 순서대로 (노드 적용, 빈 슬롯 null) */
export const weaponSkills = (weapon: WeaponDef, b: SkillBuild): (ActionDef | null)[] =>
  slotSkills(weapon, b).map((id) => (id ? resolveSkill(id, nodeOf(b, id)) : null));

/** 이 무기로 쓸 수 있는(배운) 스킬이면 노드를 적용한 정의 */
export function buildSkill(weapon: WeaponDef, b: SkillBuild, id: string): ActionDef | undefined {
  const n = nodeOf(b, id);
  return treeSkills(weapon).includes(id) && n.points > 0 ? resolveSkill(id, n) : undefined;
}

/** 저장·전송용 문자열 "id:포인트[:변형],..." (기본값 노드 = 기본 스킬 1포인트·계열 스킬 0포인트는 생략) */
export function encodeBuild(b: SkillBuild): string {
  return Object.entries(b)
    .filter(([id, n]) => n.points !== minPoints(id) || n.variant)
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
