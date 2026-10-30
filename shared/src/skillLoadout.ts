// 노드 바꾸기·단계 열림·슬롯 장착 (docs/skills.md 1장): 클라이언트·서버 공용
// 단계 열림: 계열 2단계 이상은 같은 계열 아래 단계에 쓴 포인트(액티브 + 보조) 합이 tierPoints 이상일 때만 배울 수 있다.
// 아래 단계를 내려 조건이 깨지면 위 단계 노드는 지워지고 SP가 돌아온다 (prune).
// 슬롯 장착: 배운 액티브 중 4개를 U I O P에. 빌드에 slot이 하나도 없으면(예전 빌드·개발 ?skills=) 기본 배치 = 기본 스킬 U I,
// 계열 1단계 O P, 남은 칸에 배운 다른 액티브. 노드를 바꾸면 배치를 노드의 slot에 적는다 (새로 배운 액티브는 택1 상대 자리 또는 첫 빈칸)
import type { ActionDef, WeaponDef } from './actions';
import { COMBAT, PASSIVES, SKILLS } from './data/load';
import { perksOf, withPerks } from './passives';
import {
  BRANCHES, maxPointsOf, minPoints, nodeOf, resolveSkill, rivalsOf, SLOT_COUNT, spSpent, treeNodes, treeSkills, type SkillBuild, type SkillNode,
} from './skillTree';

const TREE = COMBAT.skillTree;

const metaOf = (id: string): { branch: string; tier?: number } | undefined => SKILLS[id] ?? PASSIVES[id];
/** 노드 단계 (기본 스킬은 1로 친다) */
export const tierOf = (id: string): number => metaOf(id)?.tier ?? 1;

/** 같은 계열에서 이 단계보다 아래 단계에 쓴 포인트 (액티브 + 보조) */
export function branchPoints(weapon: WeaponDef, b: SkillBuild, branch: string, belowTier: number): number {
  return treeNodes(weapon).reduce((s, id) => (metaOf(id)?.branch === branch && tierOf(id) < belowTier ? s + nodeOf(b, id).points : s), 0);
}

/** 이 노드의 단계가 열렸나 (기본 스킬·1단계는 처음부터) */
export function isUnlocked(weapon: WeaponDef, b: SkillBuild, id: string): boolean {
  const m = metaOf(id);
  if (!m || m.branch === 'base' || m.branch === 'common') return true;
  return branchPoints(weapon, b, m.branch, tierOf(id)) >= (TREE.tierPoints[tierOf(id) - 1] ?? Infinity);
}

/** 단계 조건이 깨진 노드를 지운다 (고친 b를 돌려줌, 위 단계가 지워지면 그 위도 다시 본다) */
function prune(weapon: WeaponDef, b: SkillBuild): SkillBuild {
  for (let changed = true; changed;) {
    changed = false;
    for (const id of treeNodes(weapon)) {
      if (nodeOf(b, id).points > 0 && !isUnlocked(weapon, b, id)) {
        delete b[id];
        changed = true;
      }
    }
  }
  return b;
}

const learned = (b: SkillBuild, id: string): boolean => nodeOf(b, id).points > 0;

/** 장착 정보가 없을 때: 기본 스킬 U I, 계열마다 배운 1단계 액티브 O P, 남은 빈칸에 배운 다른 액티브 (트리 순서) */
function defaultSlots(weapon: WeaponDef, b: SkillBuild): (string | null)[] {
  const tree = treeSkills(weapon);
  const out: (string | null)[] = [
    ...weapon.baseSkills,
    ...BRANCHES.map((br) => tree.find((id) => SKILLS[id]!.branch === br && SKILLS[id]!.tier === 1 && learned(b, id)) ?? null),
  ];
  for (const id of tree) {
    const free = out.indexOf(null);
    if (free < 0) break;
    if (learned(b, id) && !out.includes(id)) out[free] = id;
  }
  return out;
}

/** 슬롯(U I O P) 순서의 스킬 id (빈칸 null) */
export function slotSkills(weapon: WeaponDef, b: SkillBuild): (string | null)[] {
  const placed = treeSkills(weapon).filter((id) => b[id]?.slot !== undefined && learned(b, id));
  if (!placed.length) return defaultSlots(weapon, b);
  const out: (string | null)[] = Array<string | null>(SLOT_COUNT).fill(null);
  for (const id of placed) out[b[id]!.slot!] ??= id;
  return out;
}

/** 슬롯 배치를 이 무기 노드의 slot에 적는다 (다른 무기 노드는 그대로). 기본 배치와 같으면 slot을 적지 않는다. 기본값 노드는 지운다 */
function writeSlots(weapon: WeaponDef, b: SkillBuild, slots: (string | null)[]): SkillBuild {
  const out: SkillBuild = { ...b };
  for (const id of treeSkills(weapon)) {
    const n = out[id];
    if (!n) continue;
    const { slot: _, ...rest } = n;
    out[id] = rest;
  }
  const plain = defaultSlots(weapon, out);
  if (slots.some((id, i) => id !== plain[i])) {
    slots.forEach((id, i) => {
      if (id) out[id] = { ...nodeOf(out, id), slot: i };
    });
  }
  for (const id of treeSkills(weapon)) {
    const n = out[id];
    if (n && n.points === minPoints(id) && !n.variant && n.slot === undefined) delete out[id];
  }
  return out;
}

/** 노드 하나를 바꾼 빌드: 같은 단계 택1 상대는 지우고(포인트가 옮겨감), 단계 조건이 깨진 위 단계를 지우고, 슬롯을 다시 적는다 */
export function applyNode(weapon: WeaponDef, b: SkillBuild, id: string, node: SkillNode): SkillBuild {
  const before = slotSkills(weapon, b);
  const out: SkillBuild = { ...b };
  const rivals = node.points > 0 ? rivalsOf(weapon, id).filter((r) => learned(b, r)) : [];
  for (const r of rivals) delete out[r];
  out[id] = node.variant ? { points: node.points, variant: node.variant } : { points: node.points };
  if (node.points === 0) delete out[id];
  prune(weapon, out);
  // 지워진 스킬은 빼고, 새로 배운 액티브는 택1 상대가 있던 칸 → 기본 배치 자리(계열 1단계 O P)가 비었으면 그 칸 → 첫 빈칸
  const slots = before.map((k) => (k && learned(out, k) ? k : null));
  if (SKILLS[id] && learned(out, id) && !slots.includes(id)) {
    const home = defaultSlots(weapon, out).indexOf(id);
    const at = rivals.map((r) => before.indexOf(r)).find((i) => i >= 0) ?? (home >= 0 && slots[home] === null ? home : slots.indexOf(null));
    if (at >= 0 && slots[at] === null) slots[at] = id;
  }
  return writeSlots(weapon, out, slots);
}

/** 이 노드를 바꾸면 함께 지워지는 위 단계 노드 (스킬 창 경고) */
export function prunedBy(weapon: WeaponDef, b: SkillBuild, id: string, node: SkillNode): string[] {
  const after = applyNode(weapon, b, id, node), rivals = rivalsOf(weapon, id);
  return treeNodes(weapon).filter((k) => k !== id && !rivals.includes(k) && learned(b, k) && !learned(after, k));
}

export type NodeFail = 'skill' | 'points' | 'variant' | 'sp' | 'locked' | 'slot';

/** 이 노드로 바꿔도 되나 (sp = 받은 SP). 변형은 variantAt 포인트 이상일 때만, 위 단계는 열렸을 때만. 택1 상대·지워질 위 단계를 뺀 SP로 센다 */
export function checkNode(weapon: WeaponDef, b: SkillBuild, id: string, node: SkillNode, sp: number): NodeFail | null {
  if (!treeNodes(weapon).includes(id)) return 'skill';
  if (!Number.isInteger(node.points) || node.points < minPoints(id) || node.points > maxPointsOf(id)) return 'points';
  if (node.variant !== undefined && (node.points < TREE.variantAt || !SKILLS[id]?.variants?.[node.variant])) return 'variant';
  if (node.points > 0 && !isUnlocked(weapon, b, id)) return 'locked';
  if (spSpent(weapon, applyNode(weapon, b, id, node)) > sp) return 'sp';
  return null;
}

/** 배운 액티브를 슬롯에 장착해도 되나 */
export function checkEquip(weapon: WeaponDef, b: SkillBuild, id: string, slot: number): NodeFail | null {
  if (!treeSkills(weapon).includes(id) || !learned(b, id)) return 'skill';
  if (!Number.isInteger(slot) || slot < 0 || slot >= SLOT_COUNT) return 'slot';
  return null;
}

/** 슬롯에 장착한 빌드: 그 칸에 있던 스킬은 이 스킬이 있던 칸으로 (없었으면 장착 해제) */
export function equipSkill(weapon: WeaponDef, b: SkillBuild, id: string, slot: number): SkillBuild {
  const slots = slotSkills(weapon, b).slice(), from = slots.indexOf(id);
  if (from >= 0) slots[from] = slots[slot] ?? null;
  slots[slot] = id;
  return writeSlots(weapon, b, slots);
}

/** 무기 스킬을 슬롯 순서대로 (노드·보조 노드 적용, 빈 슬롯 null) */
export const weaponSkills = (weapon: WeaponDef, b: SkillBuild): (ActionDef | null)[] =>
  slotSkills(weapon, b).map((id) => (id ? withPerks(resolveSkill(id, nodeOf(b, id)), perksOf(weapon, b)) : null));

/** 장착한 스킬이면 노드·보조 노드를 적용한 정의 (던전에서 쓸 수 있는 것만) */
export function buildSkill(weapon: WeaponDef, b: SkillBuild, id: string): ActionDef | undefined {
  return slotSkills(weapon, b).includes(id) ? withPerks(resolveSkill(id, nodeOf(b, id)), perksOf(weapon, b)) : undefined;
}
