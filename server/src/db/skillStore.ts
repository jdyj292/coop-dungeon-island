// 스킬 노드 저장 (docs/skills.md 1장, db.md skill_nodes): 받은 SP = 숙련도 레벨 − 1 + weapon_mastery.sp(보너스), 쓴 SP = 노드 포인트에서 계산
// 검사는 shared/skillTree.checkNode (클라이언트 신고값은 믿지 않는다), 던전 입장 때 이 값으로 판정 (skillBuild)
import { checkNode, decodeBuild, encodeBuild, MVP_WEAPONS, nodeOf, spSpent, spTotal, weaponDef, type NodeFail, type SkillBuild, type SkillNode } from '@game/shared';
import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from './client';
import { skillNodes, weaponMastery } from './schema';

/** 그 사람의 모든 노드 (무기 구분 없이 스킬 id → 노드) */
export function skillBuild(db: Db, userId: number): SkillBuild {
  const out: SkillBuild = {};
  for (const r of db.select().from(skillNodes).where(eq(skillNodes.userId, userId)).all()) {
    out[r.nodeId] = r.variant ? { points: r.points, variant: r.variant } : { points: r.points };
  }
  // 데이터에서 사라진 스킬·변형은 버린다
  return decodeBuild(encodeBuild(out));
}

/** 받은 SP (무기별) */
export function spOf(db: Db, userId: number, weapon: string): number {
  const r = db.select({ level: weaponMastery.level, sp: weaponMastery.sp }).from(weaponMastery)
    .where(and(eq(weaponMastery.userId, userId), eq(weaponMastery.weapon, weapon))).get();
  return spTotal(r?.level ?? 1, r?.sp ?? 0);
}

/** 스킬 창(K)에 보낼 값: 무기마다 받은 SP·쓴 SP·노드 문자열 */
export function skillsView(db: Db, userId: number): { weapon: string; sp: number; spent: number; build: string }[] {
  const b = skillBuild(db, userId);
  return MVP_WEAPONS.map((weapon) => {
    const w = weaponDef(weapon), mine: SkillBuild = {};
    for (const id of w.baseSkills) mine[id] = nodeOf(b, id);
    return { weapon, sp: spOf(db, userId, weapon), spent: spSpent(w, mine), build: encodeBuild(mine) };
  });
}

/** 노드 하나 바꾸기. 안 되면 사유 */
export function setSkillNode(db: Db, userId: number, weapon: string, id: string, node: SkillNode): NodeFail | null {
  const fail = checkNode(weaponDef(weapon), skillBuild(db, userId), id, node, spOf(db, userId, weapon));
  if (fail) return fail;
  if (node.points === 1 && !node.variant) {
    db.delete(skillNodes).where(and(eq(skillNodes.userId, userId), eq(skillNodes.nodeId, id))).run();
    return null;
  }
  const row = { points: node.points, variant: node.variant ?? null };
  db.insert(skillNodes).values({ userId, nodeId: id, ...row }).onConflictDoUpdate({ target: [skillNodes.userId, skillNodes.nodeId], set: row }).run();
  return null;
}

/** 무기 스킬 전체 초기화 (섬에서 무료, skills.md 1장) */
export function resetSkills(db: Db, userId: number, weapon: string): void {
  db.delete(skillNodes).where(and(eq(skillNodes.userId, userId), inArray(skillNodes.nodeId, weaponDef(weapon).baseSkills))).run();
}
