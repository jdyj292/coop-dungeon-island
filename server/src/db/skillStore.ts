// 카드 저장 임시 연결 (CD-3 전까지, shared cards/interim.ts): skill_nodes = 카드 단계(액티브 1·2, 패시브 0·1·2)·변형, skill_slots = 액티브 칸 A S D F.
// 보유 검사 없이 그 무기 카드를 모두 가진 것으로 본다. 검사는 shared(클라이언트 신고값은 믿지 않는다), 던전 출발 때 interimBuild로 판정 빌드를 만든다.
// CD-3에서 cards·card_slots·card_pity와 마이그레이션으로 바꾼다 (skill_nodes·skill_slots·sp·branch 지움)
import {
  ACTIVE_SLOTS, checkInterimEquip, checkInterimNode, decodeBuild, defaultLoadout, encodeBuild, equipCard, interimBuild, interimPassiveUsed,
  MVP_WEAPONS, passiveCap, weaponCards, type InterimFail, type InterimNodes,
} from '@game/shared';
import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from './client';
import { skillNodes, skillSlots, weaponMastery } from './schema';

/** skill_slots.branch 자리 (계열 없음, CD-3에서 열이 사라짐) */
const SLOT_BRANCH = 'A';

/** 그 사람의 그 무기 노드 (데이터에서 사라진 카드·변형, 범위 밖 단계는 버림) */
export function cardNodes(db: Db, userId: number, weapon: string): Record<string, { points: number; variant?: string }> {
  const out: Record<string, { points: number; variant?: string }> = {}, mine = weaponCards(weapon);
  for (const r of db.select().from(skillNodes).where(eq(skillNodes.userId, userId)).all()) {
    if (!mine.includes(r.nodeId)) continue;
    const n = decodeBuild(`${r.nodeId}:${r.points}${r.variant ? `:${r.variant}` : ''}`)[r.nodeId];
    if (n) out[r.nodeId] = { points: n.level, ...(n.variant ? { variant: n.variant } : {}) };
  }
  return out;
}

const levelOf = (db: Db, userId: number, weapon: string): number =>
  db.select({ level: weaponMastery.level }).from(weaponMastery).where(and(eq(weaponMastery.userId, userId), eq(weaponMastery.weapon, weapon))).get()?.level ?? 1;

/** 액티브 칸 (A S D F, 빈칸 null). 저장이 없으면 기본 배치 = A S 처음 카드 */
export function activeSlots(db: Db, userId: number, weapon: string): (string | null)[] {
  const rows = db.select().from(skillSlots)
    .where(and(eq(skillSlots.userId, userId), eq(skillSlots.weapon, weapon), eq(skillSlots.branch, SLOT_BRANCH))).all();
  if (!rows.length) return [...defaultLoadout(weapon).active];
  const out: (string | null)[] = Array<string | null>(ACTIVE_SLOTS).fill(null), mine = weaponCards(weapon, 'active');
  for (const s of rows) if (s.slot >= 0 && s.slot < ACTIVE_SLOTS && mine.includes(s.nodeId)) out[s.slot] = s.nodeId;
  return out;
}

const nodesText = (nodes: InterimNodes): string =>
  encodeBuild(Object.fromEntries(Object.entries(nodes).map(([id, n]) => [id, { level: n.points, ...(n.variant ? { variant: n.variant } : {}) }])));

/** 스킬 창(K)에 보낼 값: 무기마다 레벨·패시브 한도·쓴 비용·노드 문자열·액티브 칸(빈칸 '') */
export function skillsView(db: Db, userId: number): { weapon: string; level: number; cap: number; used: number; build: string; slots: string[] }[] {
  return MVP_WEAPONS.map((weapon) => {
    const nodes = cardNodes(db, userId, weapon), level = levelOf(db, userId, weapon);
    return {
      weapon, level, cap: passiveCap(level), used: interimPassiveUsed(weapon, nodes), build: nodesText(nodes),
      slots: activeSlots(db, userId, weapon).map((id) => id ?? ''),
    };
  });
}

/** 던전 출발 때 파티 정보에 실을 빌드 문자열 (장착 카드만, 액티브는 칸) */
export function dungeonBuild(db: Db, userId: number, weapon: string): string {
  return encodeBuild(interimBuild(weapon, levelOf(db, userId, weapon), cardNodes(db, userId, weapon), activeSlots(db, userId, weapon)));
}

/** 카드 하나의 단계·변형 바꾸기 (그 행만 고쳐 씀, 액티브 1·변형 없음 / 패시브 0이면 행을 지움). 안 되면 사유 */
export function setSkillNode(db: Db, userId: number, weapon: string, id: string, node: { points: number; variant?: string }): InterimFail | null {
  const fail = checkInterimNode(weapon, levelOf(db, userId, weapon), cardNodes(db, userId, weapon), id, node);
  if (fail) return fail;
  const plain = node.points <= (weaponCards(weapon, 'active').includes(id) ? 1 : 0) && !node.variant;
  if (plain) db.delete(skillNodes).where(and(eq(skillNodes.userId, userId), eq(skillNodes.nodeId, id))).run();
  else {
    const row = { points: node.points, variant: node.variant ?? null };
    db.insert(skillNodes).values({ userId, nodeId: id, ...row }).onConflictDoUpdate({ target: [skillNodes.userId, skillNodes.nodeId], set: row }).run();
  }
  return null;
}

/** 액티브 칸(0~3 = A S D F)에 장착 (그 칸 카드와 자리 바꿈, 4칸을 다시 적음). 안 되면 사유 */
export function equipSkillSlot(db: Db, userId: number, weapon: string, id: string, slot: number): InterimFail | null {
  const nodes = cardNodes(db, userId, weapon), now = activeSlots(db, userId, weapon);
  const fail = checkInterimEquip(weapon, levelOf(db, userId, weapon), nodes, now, id, slot);
  if (fail) return fail;
  const slots = equipCard({ active: now, passive: [] }, 'active', slot, id).active;
  db.transaction((tx) => {
    tx.delete(skillSlots).where(and(eq(skillSlots.userId, userId), eq(skillSlots.weapon, weapon), eq(skillSlots.branch, SLOT_BRANCH))).run();
    slots.forEach((nodeId, i) => {
      if (nodeId) tx.insert(skillSlots).values({ userId, weapon, branch: SLOT_BRANCH, slot: i, nodeId }).run();
    });
  });
  return null;
}

/** 무기 카드 단계·변형·패시브 장착 초기화 (액티브 칸은 그대로) */
export function resetSkills(db: Db, userId: number, weapon: string): void {
  db.delete(skillNodes).where(and(eq(skillNodes.userId, userId), inArray(skillNodes.nodeId, weaponCards(weapon)))).run();
}
