// 계열 선택·노드 바꾸기·계열별 장착·던전용 빌드 (docs/skills.md 1장): 클라이언트·서버 공용
// 무기마다 계열(A·B) 하나를 고른다. 고른 계열의 계열 스킬·보조와 기본 스킬·공용 패시브만 쓴다 (다른 계열에 찍은 포인트는 남지만 효과 없음).
// 장착(U I O P)은 계열마다 따로 기억한다. 저장한 장착이 없으면 기본 배치 = 기본 스킬 U I, 그 계열에서 열린 액티브를 열리는 순서로 O P.
// 던전에는 effectiveBuild(고른 계열·열린 것만, 장착한 칸이 slot)를 보내고, 던전 판정은 그 빌드의 slot만 본다 (slotSkills)
import type { ActionDef, WeaponDef } from './actions';
import { SKILLS } from './data/load';
import { perksOf, withPerks } from './passives';
import {
  inBranch, isOpen, maxPointsOf, nodeOf, pointsAt, resolveSkill, SLOT_COUNT, spSpent, treeNodes, treeSkills,
  type Branch, type SkillBuild, type SkillNode,
} from './skillTree';

/** 무기 하나의 장착 상태: 숙련도 레벨, 고른 계열, 그 계열에 저장한 장착 (없으면 기본 배치) */
export interface Loadout {
  level: number;
  branch: Branch;
  slots?: readonly (string | null)[];
}

/** 지금 쓰는 노드: 레벨로 열렸고 고른 계열(또는 기본·공용) */
export const usable = (id: string, lo: Loadout): boolean => isOpen(id, lo.level) && inBranch(id, lo.branch);

const learned = (b: SkillBuild, id: string): boolean => nodeOf(b, id).points > 0;
const pad = (ids: (string | null)[]): (string | null)[] => [...ids, ...Array<null>(Math.max(0, SLOT_COUNT - ids.length)).fill(null)].slice(0, SLOT_COUNT);

/** 섬 장착 (U I O P 순서, 빈칸 null): 저장한 장착에서 지금 못 쓰는 스킬은 빈칸, 저장이 없으면 기본 배치 */
export function loadoutSlots(weapon: WeaponDef, lo: Loadout): (string | null)[] {
  const tree = treeSkills(weapon);
  if (lo.slots) return pad(lo.slots.map((id) => (id && tree.includes(id) && usable(id, lo) ? id : null)));
  return pad(tree.filter((id) => usable(id, lo)));
}

export type NodeFail = 'skill' | 'points' | 'variant' | 'sp' | 'locked' | 'branch' | 'slot';

/** 노드 하나를 바꾼 빌드 (기본값이 되면 지움: 액티브 1포인트·패시브 0포인트이고 변형 없음) */
export function applyNode(b: SkillBuild, id: string, node: SkillNode): SkillBuild {
  const out: SkillBuild = { ...b };
  if (node.points <= (SKILLS[id] ? 1 : 0) && !node.variant) delete out[id];
  else out[id] = node.variant ? { points: node.points, variant: node.variant } : { points: node.points };
  return out;
}

/** 이 노드로 바꿔도 되나 (sp = 받은 SP). 열린 노드·고른 계열만, 액티브 1~최대·패시브 0~최대, 변형은 액티브만. SP는 늘어날 때만 본다 */
export function checkNode(weapon: WeaponDef, b: SkillBuild, id: string, node: SkillNode, sp: number, lo: Loadout): NodeFail | null {
  if (!treeNodes(weapon).includes(id)) return 'skill';
  if (!Number.isInteger(node.points) || node.points < (SKILLS[id] ? 1 : 0) || node.points > maxPointsOf(id)) return 'points';
  if (node.variant !== undefined && !SKILLS[id]?.variants?.[node.variant]) return 'variant';
  if (!isOpen(id, lo.level)) return 'locked';
  if (!inBranch(id, lo.branch)) return 'branch';
  const after = spSpent(weapon, applyNode(b, id, node));
  if (after > sp && after > spSpent(weapon, b)) return 'sp';
  return null;
}

/** 이 스킬을 슬롯에 장착해도 되나 (열린 액티브·고른 계열만) */
export function checkEquip(weapon: WeaponDef, lo: Loadout, id: string, slot: number): NodeFail | null {
  if (!treeSkills(weapon).includes(id)) return 'skill';
  if (!isOpen(id, lo.level)) return 'locked';
  if (!inBranch(id, lo.branch)) return 'branch';
  if (!Number.isInteger(slot) || slot < 0 || slot >= SLOT_COUNT) return 'slot';
  return null;
}

/** 장착한 슬롯: 그 칸에 있던 스킬은 이 스킬이 있던 칸으로 (없었으면 빠짐) */
export function equipSlots(slots: readonly (string | null)[], id: string, slot: number): (string | null)[] {
  const out = pad(slots.slice()), from = out.indexOf(id);
  if (from >= 0) out[from] = out[slot] ?? null;
  out[slot] = id;
  return out;
}

/** 던전용 빌드: 고른 계열에서 쓰는 열린 노드만 (액티브는 1포인트부터, 패시브는 배운 것), 장착한 칸이 slot */
export function effectiveBuild(weapon: WeaponDef, b: SkillBuild, lo: Loadout): SkillBuild {
  const out: SkillBuild = {}, slots = loadoutSlots(weapon, lo);
  for (const id of treeNodes(weapon)) {
    const points = usable(id, lo) ? pointsAt(b, id, lo.level) : 0;
    if (!points) continue;
    const variant = SKILLS[id] ? nodeOf(b, id).variant : undefined, slot = slots.indexOf(id);
    out[id] = { points, ...(variant ? { variant } : {}), ...(slot >= 0 ? { slot } : {}) };
  }
  return out;
}

/** 던전 슬롯 (U I O P 순서, 빈칸 null): 빌드의 slot. slot이 하나도 없으면(개발 ?skills=) 기본 스킬 U I, 배운 계열 스킬을 트리 순서로 남은 칸에 */
export function slotSkills(weapon: WeaponDef, b: SkillBuild): (string | null)[] {
  const tree = treeSkills(weapon), placed = tree.filter((id) => b[id]?.slot !== undefined && learned(b, id));
  if (!placed.length) return pad(tree.filter((id) => learned(b, id)));
  const out: (string | null)[] = Array<string | null>(SLOT_COUNT).fill(null);
  for (const id of placed) out[b[id]!.slot!] ??= id;
  return out;
}

/** 무기 스킬을 슬롯 순서대로 (노드·패시브 적용, 빈 슬롯 null) */
export const weaponSkills = (weapon: WeaponDef, b: SkillBuild): (ActionDef | null)[] =>
  slotSkills(weapon, b).map((id) => (id ? withPerks(resolveSkill(id, nodeOf(b, id)), perksOf(weapon, b)) : null));

/** 장착한 스킬이면 노드·패시브를 적용한 정의 (던전에서 쓸 수 있는 것만) */
export function buildSkill(weapon: WeaponDef, b: SkillBuild, id: string): ActionDef | undefined {
  return slotSkills(weapon, b).includes(id) ? withPerks(resolveSkill(id, nodeOf(b, id)), perksOf(weapon, b)) : undefined;
}
