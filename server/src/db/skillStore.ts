// 스킬 노드 저장 (docs/skills.md 1장, db.md skill_nodes): 받은 SP = 숙련도 레벨 − 1 + weapon_mastery.sp(보너스), 쓴 SP = 노드 포인트에서 계산
// 검사는 shared/skillLoadout.checkNode·checkEquip (클라이언트 신고값은 믿지 않는다), 던전 입장 때 이 값으로 판정 (skillBuild)
import {
  applyNode, checkEquip, checkNode, decodeBuild, encodeBuild, equipSkill, MVP_WEAPONS, spSpent, spTotal, treeNodes, weaponDef,
  type NodeFail, type SkillBuild, type SkillNode, type WeaponDef,
} from '@game/shared';
import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from './client';
import { skillNodes, weaponMastery } from './schema';

/** 그 사람의 모든 노드 (무기 구분 없이 스킬 id → 노드) */
export function skillBuild(db: Db, userId: number): SkillBuild {
  const out: SkillBuild = {};
  for (const r of db.select().from(skillNodes).where(eq(skillNodes.userId, userId)).all()) {
    out[r.nodeId] = { points: r.points, ...(r.variant ? { variant: r.variant } : {}), ...(r.slot !== null ? { slot: r.slot } : {}) };
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
    for (const id of treeNodes(w)) if (b[id]) mine[id] = b[id];
    return { weapon, sp: spOf(db, userId, weapon), spent: spSpent(w, mine), build: encodeBuild(mine) };
  });
}

const same = (a: SkillNode | undefined, b: SkillNode | undefined): boolean =>
  a?.points === b?.points && a?.variant === b?.variant && a?.slot === b?.slot;

/** 이 무기 노드에서 바뀐 행만 고쳐 쓴다 (택1 상대·지워진 위 단계·슬롯이 함께 바뀜) */
function saveWeapon(db: Db, userId: number, w: WeaponDef, before: SkillBuild, after: SkillBuild): void {
  db.transaction((tx) => {
    for (const k of treeNodes(w)) {
      const n = after[k];
      if (same(before[k], n)) continue;
      if (!n) {
        tx.delete(skillNodes).where(and(eq(skillNodes.userId, userId), eq(skillNodes.nodeId, k))).run();
        continue;
      }
      const row = { points: n.points, variant: n.variant ?? null, slot: n.slot ?? null };
      tx.insert(skillNodes).values({ userId, nodeId: k, ...row }).onConflictDoUpdate({ target: [skillNodes.userId, skillNodes.nodeId], set: row }).run();
    }
  });
}

/** 노드 하나 바꾸기 (택1 상대·열림 조건이 깨진 위 단계는 지우고 슬롯을 다시 적음). 안 되면 사유 */
export function setSkillNode(db: Db, userId: number, weapon: string, id: string, node: SkillNode): NodeFail | null {
  const w = weaponDef(weapon), before = skillBuild(db, userId);
  const fail = checkNode(w, before, id, node, spOf(db, userId, weapon));
  if (fail) return fail;
  saveWeapon(db, userId, w, before, applyNode(w, before, id, node));
  return null;
}

/** 배운 액티브를 슬롯(0~3 = U I O P)에 장착 (그 칸 스킬과 자리 바꿈). 안 되면 사유 */
export function equipSkillSlot(db: Db, userId: number, weapon: string, id: string, slot: number): NodeFail | null {
  const w = weaponDef(weapon), before = skillBuild(db, userId);
  const fail = checkEquip(w, before, id, slot);
  if (fail) return fail;
  saveWeapon(db, userId, w, before, equipSkill(w, before, id, slot));
  return null;
}

/** 무기 스킬 전체 초기화 (섬에서 무료, skills.md 1장). 슬롯도 기본 배치로 */
export function resetSkills(db: Db, userId: number, weapon: string): void {
  db.delete(skillNodes).where(and(eq(skillNodes.userId, userId), inArray(skillNodes.nodeId, treeNodes(weaponDef(weapon))))).run();
}
