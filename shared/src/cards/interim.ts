// 임시 연결 (CD-3·CD-4 전까지): 지금 섬 스킬 창·서버 저장(skill_nodes·skill_slots)을 카드 규칙에 맞춰 쓴다.
// 보유 검사 없이 그 무기 카드를 모두 가진 것으로 보고, 노드 points = 액티브 1(기본)·2(강화), 패시브 0(안 낌)·1·2.
// 액티브 4칸·패시브 비용 한도·장착 숙련도·변형은 강화만 = 카드 규칙 그대로. CD-3에서 DB 보유·장착(cards·card_slots)으로 바꾸며 지운다
import { CARDS, equipLevelOf, isActiveCard, passiveCap, weaponCards } from './catalog';
import type { Collection, OwnedCard } from './collection';
import { checkEquip, passiveUsed, type CardLoadout } from './equip';
import { dungeonBuild, MAX_CARD_LEVEL, type SkillBuild } from './build';
import { SKILLS } from '../data/load';

/** 저장한 노드 (카드 id → 단계·변형) */
export type InterimNodes = Readonly<Record<string, { points: number; variant?: string }>>;
export type InterimFail = 'skill' | 'points' | 'variant' | 'locked' | 'cap' | 'slot';

/** 그 무기 카드를 모두 1장씩 가진 보유 (강화 = points 2) */
export function interimCollection(weapon: string, nodes: InterimNodes): Collection {
  const out: Record<string, OwnedCard> = {};
  for (const id of weaponCards(weapon)) {
    const n = nodes[id], enhanced = (n?.points ?? 0) >= MAX_CARD_LEVEL;
    out[id] = { count: enhanced ? 0 : 1, enhanced, ...(enhanced && n?.variant ? { variant: n.variant } : {}) };
  }
  return out;
}

/** 장착: 액티브 칸 + points ≥ 1인 패시브 (카드 순서) */
export const interimLoadout = (weapon: string, nodes: InterimNodes, active: readonly (string | null)[]): CardLoadout => ({
  active,
  passive: weaponCards(weapon, 'passive').filter((id) => (nodes[id]?.points ?? 0) > 0),
});

/** 노드 하나를 바꿔도 되나 (액티브 1~2·패시브 0~2, 변형은 강화 액티브만, 장착 숙련도, 패시브 비용 한도는 늘어날 때만) */
export function checkInterimNode(weapon: string, level: number, nodes: InterimNodes, id: string, node: { points: number; variant?: string }): InterimFail | null {
  const card = CARDS[id];
  if (!card || card.weapon !== weapon) return 'skill';
  const active = isActiveCard(id), min = active ? 1 : 0;
  if (!Number.isInteger(node.points) || node.points < min || node.points > MAX_CARD_LEVEL) return 'points';
  if (node.variant !== undefined && (!active || node.points < MAX_CARD_LEVEL || !SKILLS[id]?.variants?.[node.variant])) return 'variant';
  if (node.points > 0 && level < equipLevelOf(id)) return 'locked';
  if (!active) {
    const used = interimPassiveUsed(weapon, { ...nodes, [id]: node });
    if (used > interimPassiveUsed(weapon, nodes) && used > passiveCap(level)) return 'cap';
  }
  return null;
}

/** 액티브 칸에 장착해도 되나 */
export const checkInterimEquip = (weapon: string, level: number, nodes: InterimNodes, active: readonly (string | null)[], id: string, slot: number): InterimFail | null => {
  const f = checkEquip(weapon, level, interimCollection(weapon, nodes), interimLoadout(weapon, nodes, active), 'active', slot, id);
  return f === 'card' || f === 'owned' ? 'skill' : (f as InterimFail | null);
};

/** 던전용 빌드 */
export const interimBuild = (weapon: string, level: number, nodes: InterimNodes, active: readonly (string | null)[]): SkillBuild =>
  dungeonBuild(weapon, level, interimCollection(weapon, nodes), interimLoadout(weapon, nodes, active));

/** 섬 창 머리: 패시브 비용 쓴 것 */
export const interimPassiveUsed = (weapon: string, nodes: InterimNodes): number =>
  passiveUsed(interimCollection(weapon, nodes), interimLoadout(weapon, nodes, []).passive);
