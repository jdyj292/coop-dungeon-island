// 카드 장착 (docs/skills.md 1장 장착, DB card_slots): 액티브 4칸(A S D F), 패시브 = 비용 합계 한도, 장착 숙련도 (클라이언트·서버 공용)
// 무기마다 따로. 저장이 없으면 기본 배치 = A S에 처음 카드
import { ACTIVE_SLOTS, CARDS, equipLevelOf, passiveCap, passiveCost, starterCards, type CardKind } from './catalog';
import { isEnhanced, owns, type CardFail, type Collection } from './collection';

/** 무기 하나의 장착: 액티브 칸(길이 ACTIVE_SLOTS, 빈칸 null), 패시브(순서) */
export interface CardLoadout {
  active: readonly (string | null)[];
  passive: readonly string[];
}

const pad = (ids: readonly (string | null)[]): (string | null)[] =>
  [...ids, ...Array<null>(Math.max(0, ACTIVE_SLOTS - ids.length)).fill(null)].slice(0, ACTIVE_SLOTS);

export const defaultLoadout = (weapon: string): CardLoadout => ({ active: pad(starterCards(weapon)), passive: [] });

/** 장착 패시브 비용 합 */
export const passiveUsed = (c: Collection, passive: readonly string[]): number =>
  passive.reduce((s, id) => s + passiveCost(id, isEnhanced(c, id)), 0);

/** 장착한 카드 (액티브 + 패시브) */
export const equippedIds = (lo: CardLoadout): string[] => [...lo.active.filter((x): x is string => !!x), ...lo.passive];

/** 칸 하나를 바꾼 장착. 액티브: 그 칸에 있던 카드는 이 카드가 있던 칸으로 (없었으면 빠짐), null = 비우기.
 * 패시브: slot 자리의 카드를 바꾸거나 끝에 더함 (이미 끼운 카드면 그 자리에서 옮김), null = 빼기 */
export function equipCard(lo: CardLoadout, kind: CardKind, slot: number, id: string | null): CardLoadout {
  if (kind === 'active') {
    const out = pad(lo.active), from = id ? out.indexOf(id) : -1;
    if (from >= 0) out[from] = out[slot] ?? null;
    out[slot] = id;
    return { active: out, passive: lo.passive };
  }
  const out = lo.passive.slice();
  if (!id) out.splice(slot, 1);
  else {
    const from = out.indexOf(id);
    if (from >= 0) out.splice(from, 1);
    out.splice(Math.min(slot, out.length), from < 0 && slot < out.length ? 1 : 0, id);
  }
  return { active: lo.active, passive: out };
}

/** 장착해도 되나: 그 무기·종류 카드, 보유, 장착 숙련도, 칸 범위, 패시브 비용 한도 */
export function checkEquip(weapon: string, level: number, c: Collection, lo: CardLoadout, kind: CardKind, slot: number, id: string | null): CardFail | null {
  const max = kind === 'active' ? ACTIVE_SLOTS - 1 : lo.passive.length - (id ? 0 : 1);
  if (!Number.isInteger(slot) || slot < 0 || slot > max) return 'slot';
  if (!id) return null;
  const card = CARDS[id];
  if (!card || card.weapon !== weapon || card.kind !== kind) return 'card';
  if (!owns(c, id)) return 'owned';
  if (level < equipLevelOf(id)) return 'locked';
  if (kind === 'passive' && passiveUsed(c, equipCard(lo, kind, slot, id).passive) > passiveCap(level)) return 'cap';
  return null;
}

/** 강화하면 끼운 패시브 비용이 +1: 한도를 넘으면 'cap' (after = 강화한 보유) */
export const checkEnhanceCap = (level: number, after: Collection, lo: CardLoadout): CardFail | null =>
  (passiveUsed(after, lo.passive) > passiveCap(level) ? 'cap' : null);

/** 지금 쓸 수 있는 장착: 없는 카드·다른 무기·숙련도가 모자란 카드는 빼고, 패시브는 한도를 넘는 뒤쪽부터 뺌 (던전 빌드, 숙련도가 내려가진 않지만 데이터가 바뀔 때) */
export function usableLoadout(weapon: string, level: number, c: Collection, lo: CardLoadout): CardLoadout {
  const ok = (id: string, kind: CardKind) => CARDS[id]?.weapon === weapon && CARDS[id]!.kind === kind && owns(c, id) && level >= equipLevelOf(id);
  const active = pad(lo.active).map((id) => (id && ok(id, 'active') ? id : null));
  const passive: string[] = [];
  for (const id of lo.passive) {
    if (!ok(id, 'passive') || passive.includes(id)) continue;
    if (passiveUsed(c, [...passive, id]) <= passiveCap(level)) passive.push(id);
  }
  return { active, passive };
}
