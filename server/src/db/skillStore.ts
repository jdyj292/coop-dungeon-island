// 스킬 저장 (docs/skills.md 1장, db.md skill_nodes·skill_slots): 받은 SP = 숙련도 레벨 − 1 + weapon_mastery.sp(보너스), 쓴 SP = 노드 포인트에서 계산.
// 무기마다 고른 계열(weapon_mastery.branch)과 계열마다 장착(skill_slots, 없으면 기본 배치)
// 검사는 shared/skillLoadout.checkNode·checkEquip (클라이언트 신고값은 믿지 않는다), 던전 출발 때 effectiveBuild로 판정 빌드를 만든다
import {
  applyNode, BRANCHES, checkEquip, checkNode, decodeBuild, effectiveBuild, encodeBuild, equipSlots, loadoutSlots, MVP_WEAPONS, spSpent, spTotal,
  treeNodes, weaponDef, type Branch, type Loadout, type NodeFail, type SkillBuild, type SkillNode,
} from '@game/shared';
import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from './client';
import { skillNodes, skillSlots, weaponMastery } from './schema';

/** 그 사람의 모든 노드 (무기 구분 없이 스킬 id → 노드) */
export function skillBuild(db: Db, userId: number): SkillBuild {
  const out: SkillBuild = {};
  for (const r of db.select().from(skillNodes).where(eq(skillNodes.userId, userId)).all()) {
    out[r.nodeId] = { points: r.points, ...(r.variant ? { variant: r.variant } : {}) };
  }
  // 데이터에서 사라진 스킬·변형은 버린다
  return decodeBuild(encodeBuild(out));
}

const masteryRow = (db: Db, userId: number, weapon: string) =>
  db.select({ level: weaponMastery.level, sp: weaponMastery.sp, branch: weaponMastery.branch }).from(weaponMastery)
    .where(and(eq(weaponMastery.userId, userId), eq(weaponMastery.weapon, weapon))).get();

const asBranch = (s: string | undefined): Branch => (BRANCHES as readonly string[]).includes(s ?? '') ? (s as Branch) : 'A';

/** 받은 SP (무기별) */
export function spOf(db: Db, userId: number, weapon: string): number {
  const r = masteryRow(db, userId, weapon);
  return spTotal(r?.level ?? 1, r?.sp ?? 0);
}

/** 무기 하나의 레벨·고른 계열·그 계열에 저장한 장착 */
export function loadoutOf(db: Db, userId: number, weapon: string): Loadout {
  const r = masteryRow(db, userId, weapon), branch = asBranch(r?.branch);
  const rows = db.select().from(skillSlots)
    .where(and(eq(skillSlots.userId, userId), eq(skillSlots.weapon, weapon), eq(skillSlots.branch, branch))).all();
  if (!rows.length) return { level: r?.level ?? 1, branch };
  const slots: (string | null)[] = [null, null, null, null];
  for (const s of rows) if (s.slot >= 0 && s.slot < slots.length) slots[s.slot] = s.nodeId;
  return { level: r?.level ?? 1, branch, slots };
}

/** 스킬 창(K)에 보낼 값: 무기마다 레벨·받은 SP·쓴 SP·노드 문자열·고른 계열·그 계열 장착(빈칸 '') */
export function skillsView(db: Db, userId: number): { weapon: string; level: number; sp: number; spent: number; build: string; branch: Branch; slots: string[] }[] {
  const b = skillBuild(db, userId);
  return MVP_WEAPONS.map((weapon) => {
    const w = weaponDef(weapon), mine: SkillBuild = {}, lo = loadoutOf(db, userId, weapon);
    for (const id of treeNodes(w)) if (b[id]) mine[id] = b[id];
    return {
      weapon, level: lo.level, sp: spOf(db, userId, weapon), spent: spSpent(w, mine), build: encodeBuild(mine), branch: lo.branch,
      slots: loadoutSlots(w, lo).map((id) => id ?? ''),
    };
  });
}

/** 던전 출발 때 파티 정보에 실을 빌드 문자열 (고른 계열·열린 노드만, 장착한 칸이 slot) */
export function dungeonBuild(db: Db, userId: number, weapon: string): string {
  return encodeBuild(effectiveBuild(weaponDef(weapon), skillBuild(db, userId), loadoutOf(db, userId, weapon)));
}

/** 노드 하나 바꾸기 (그 행만 고쳐 씀). 안 되면 사유 */
export function setSkillNode(db: Db, userId: number, weapon: string, id: string, node: SkillNode): NodeFail | null {
  const w = weaponDef(weapon), before = skillBuild(db, userId);
  const fail = checkNode(w, before, id, node, spOf(db, userId, weapon), loadoutOf(db, userId, weapon));
  if (fail) return fail;
  const n = applyNode(before, id, node)[id];
  if (!n) db.delete(skillNodes).where(and(eq(skillNodes.userId, userId), eq(skillNodes.nodeId, id))).run();
  else {
    const row = { points: n.points, variant: n.variant ?? null };
    db.insert(skillNodes).values({ userId, nodeId: id, ...row }).onConflictDoUpdate({ target: [skillNodes.userId, skillNodes.nodeId], set: row }).run();
  }
  return null;
}

/** 고른 계열의 슬롯(0~3 = U I O P)에 장착 (그 칸 스킬과 자리 바꿈, 그 계열 장착 4칸을 다시 적음). 안 되면 사유 */
export function equipSkillSlot(db: Db, userId: number, weapon: string, id: string, slot: number): NodeFail | null {
  const w = weaponDef(weapon), lo = loadoutOf(db, userId, weapon);
  const fail = checkEquip(w, lo, id, slot);
  if (fail) return fail;
  const slots = equipSlots(loadoutSlots(w, lo), id, slot);
  db.transaction((tx) => {
    tx.delete(skillSlots).where(and(eq(skillSlots.userId, userId), eq(skillSlots.weapon, weapon), eq(skillSlots.branch, lo.branch))).run();
    slots.forEach((nodeId, i) => {
      if (nodeId) tx.insert(skillSlots).values({ userId, weapon, branch: lo.branch, slot: i, nodeId }).run();
    });
  });
  return null;
}

/** 계열 고르기 (섬에서 무료, 장착은 계열마다 따로 남음) */
export function setBranch(db: Db, userId: number, weapon: string, branch: Branch): void {
  db.insert(weaponMastery).values({ userId, weapon, branch }).onConflictDoUpdate({ target: [weaponMastery.userId, weaponMastery.weapon], set: { branch } }).run();
}

/** 무기 포인트·변형 초기화 (섬에서 무료, skills.md 1장). 계열·장착은 그대로 */
export function resetSkills(db: Db, userId: number, weapon: string): void {
  db.delete(skillNodes).where(and(eq(skillNodes.userId, userId), inArray(skillNodes.nodeId, treeNodes(weaponDef(weapon))))).run();
}
