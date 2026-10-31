// 스킬 포인트·변형 (docs/skills.md 1장, balance.md 1장): 노드 규칙, 변형·레벨 배율을 적용한 스킬 정의 (클라이언트·서버 공용)
// 스킬·패시브는 숙련도 레벨(skills.json·passives.json unlockLevel)에 열린다. 액티브는 열리면 1포인트(공짜), SP로 maxPoints까지 강화(레벨 배율).
// 패시브(계열 보조·공용)는 0포인트(안 배움)에서 SP로 maxPoints까지. 변형은 열린 스킬이면 포인트와 상관없이 택1.
// 무기마다 계열(A·B) 하나를 골라 그 계열 스킬만 쓴다 (계열 선택·계열별 장착·던전용 빌드는 skillLoadout.ts)
import { scaleExtraCoefs, skillDef, type ActionDef, type WeaponDef } from './actions';
import { applyVariant } from './data/crossCheck';
import { COMBAT, PASSIVES, SKILLS, WEAPONS } from './data/load';
import { isPassive, weaponPassives } from './passives';

export interface SkillNode {
  points: number;
  variant?: string;
  /** 장착한 슬롯 (0~3 = U I O P). 던전용 빌드(skillLoadout.effectiveBuild)·개발 ?skills=에만 (섬 장착은 계열마다 따로 저장) */
  slot?: number;
}

/** 스킬 id → 노드. 없는 기본 스킬은 1포인트, 없는 계열 스킬·패시브는 0 (섬에서는 열린 계열 스킬을 1로 센다, pointsAt) */
export type SkillBuild = Record<string, SkillNode>;

const TREE = COMBAT.skillTree;
/** 계열 */
export const BRANCHES = ['A', 'B'] as const;
export type Branch = (typeof BRANCHES)[number];
/** 스킬 슬롯 수 (U I O P) */
export const SLOT_COUNT = 4;

export const isBaseSkill = (id: string): boolean => SKILLS[id]?.branch === 'base';
/** 저장 문자열의 기본값: 기본 스킬 1, 계열 스킬·패시브 0 (적지 않음) */
export const minPoints = (id: string): number => (isBaseSkill(id) ? 1 : 0);
/** 노드 최대 포인트 (액티브·패시브 같음) */
export const maxPointsOf = (_id: string): number => TREE.maxPoints;

export const nodeOf = (b: SkillBuild, id: string): SkillNode => b[id] ?? { points: minPoints(id) };

/** 열리는 숙련도 레벨 (기본 스킬 1) */
export const unlockLevelOf = (id: string): number => SKILLS[id]?.unlockLevel ?? PASSIVES[id]?.unlockLevel ?? 1;
export const isOpen = (id: string, level: number): boolean => level >= unlockLevelOf(id);
/** 노드 계열: base(기본 스킬)·common(공용 패시브)·A·B */
export const branchOf = (id: string): string => SKILLS[id]?.branch ?? PASSIVES[id]?.branch ?? 'base';
/** 이 계열을 골랐을 때 쓰는 노드인가 (기본 스킬·공용 패시브는 어느 계열에서나) */
export const inBranch = (id: string, branch: string): boolean => {
  const b = branchOf(id);
  return b === 'base' || b === 'common' || b === branch;
};

/** 섬 스킬 창의 포인트: 안 열렸으면 0, 열린 액티브는 1부터, 패시브는 저장한 값 */
export function pointsAt(b: SkillBuild, id: string, level: number): number {
  if (!isOpen(id, level)) return 0;
  const p = nodeOf(b, id).points;
  return SKILLS[id] ? Math.max(1, p) : p;
}

const treeCache = new WeakMap<WeaponDef, string[]>();
/** 무기 스킬 트리: 기본 스킬(키 순서) 뒤에 계열 스킬 (열리는 레벨 순, 같으면 skills.json 순서) */
export function treeSkills(weapon: WeaponDef): string[] {
  let ids = treeCache.get(weapon);
  if (!ids) {
    const wid = Object.keys(WEAPONS).find((k) => WEAPONS[k] === weapon);
    const branch = Object.values(SKILLS).filter((s) => s.weapon === wid && s.branch !== 'base').map((s) => s.id)
      .sort((a, b) => unlockLevelOf(a) - unlockLevelOf(b));
    treeCache.set(weapon, (ids = [...weapon.baseSkills, ...branch]));
  }
  return ids;
}

/** 무기의 모든 노드: 액티브(treeSkills) 뒤에 패시브 */
export const treeNodes = (weapon: WeaponDef): string[] => [...treeSkills(weapon), ...weaponPassives(weapon)];

/** 받은 SP: 숙련도 레벨업마다 1 + 보너스 (보스 첫 처치, MVP 이후) */
export const spTotal = (level: number, bonus = 0): number => Math.max(0, level - 1) + bonus;

/** 쓴 SP: 액티브는 1포인트가 공짜, 패시브는 포인트마다 1. 다른 계열에 찍은 포인트도 센다 (초기화로 돌려받음) */
export const spSpent = (weapon: WeaponDef, b: SkillBuild): number =>
  treeNodes(weapon).reduce((s, id) => s + Math.max(0, nodeOf(b, id).points - (SKILLS[id] ? 1 : 0)), 0);

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
    scaleExtraCoefs(def, mul);
  }
  cache.set(key, def);
  return def;
}

/** 저장·전송용 문자열 "id:포인트[:변형][@슬롯],..." (기본값 노드 = 기본 스킬 1포인트·나머지 0포인트이고 변형·슬롯이 없으면 생략) */
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

/** encodeBuild의 반대. 모르는 스킬·변형, 잘못된 포인트·슬롯은 버린다 (패시브는 변형·슬롯 없음) */
export function decodeBuild(s: string): SkillBuild {
  const out: SkillBuild = {};
  for (const part of s.split(',')) {
    const [body = '', slotText] = part.split('@');
    const [id = '', pts = '', variant] = body.split(':');
    const points = Number(pts), slot = slotText === undefined ? NaN : Number(slotText);
    if (!(SKILLS[id] || isPassive(id)) || !Number.isInteger(points) || points < 1 || points > maxPointsOf(id)) continue;
    const n: SkillNode = variant && SKILLS[id]?.variants?.[variant] ? { points, variant } : { points };
    if (SKILLS[id] && Number.isInteger(slot) && slot >= 0 && slot < SLOT_COUNT) n.slot = slot;
    out[id] = n;
  }
  return out;
}
