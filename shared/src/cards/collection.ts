// 보유 카드 (docs/skills.md 1장 얻기·강화, DB cards): 카드 받기(3장이면 바로 강화, 강화한 카드는 바로 갈림), 남은 장수 조각으로, 지정 구매, 변형 고르기 검사 (클라이언트·서버 공용, 순수 함수)
// 보유 = 강화했거나 보관 장수(count) ≥ 1. 같은 카드가 mergeCount장 모이는 순간 저절로 강화 (mergeCount장 소모)
import { SKILLS } from '../data/load';
import { CARD, CARDS, craftPriceOf, dustOf, isActiveCard, starterCards } from './catalog';

export interface OwnedCard {
  /** 보관 중인 기본 카드 장수 */
  count: number;
  enhanced: boolean;
  /** 강화 액티브의 변형 (없으면 기본 동작) */
  variant?: string;
}
export type Collection = Readonly<Record<string, OwnedCard>>;

/** 카드 요청이 안 되는 사유 (network.md 4장 card fail) */
export type CardFail = 'card' | 'owned' | 'locked' | 'cap' | 'slot' | 'variant' | 'dust' | 'done';

export const owns = (c: Collection, id: string): boolean => !!c[id] && (c[id]!.enhanced || c[id]!.count > 0);
export const isEnhanced = (c: Collection, id: string): boolean => !!c[id]?.enhanced;

/** 카드를 더한다 (강화·갈기 없이, 처음 카드) */
export function addCards(c: Collection, ids: readonly string[]): Record<string, OwnedCard> {
  const out: Record<string, OwnedCard> = { ...c };
  for (const id of ids) {
    if (!CARDS[id]) continue;
    const was = out[id] ?? { count: 0, enhanced: false };
    out[id] = { ...was, count: was.count + 1 };
  }
  return out;
}

/** 카드 받기 (팩·지정 구매, 차례대로): 강화 안 된 카드는 보관하다 mergeCount장이 되면 바로 강화(소모),
 * 이미 강화한 카드는 보관하지 않고 바로 갈림. merged = 이 장으로 강화됨, ground = 갈려 받은 조각 (0 = 보관·강화) */
export function receiveCards(c: Collection, ids: readonly string[]): { cards: Record<string, OwnedCard>; merged: boolean[]; ground: number[] } {
  const out: Record<string, OwnedCard> = { ...c }, merged: boolean[] = [], ground: number[] = [];
  for (const id of ids) {
    const was = out[id] ?? { count: 0, enhanced: false }, known = !!CARDS[id];
    const grind = known && was.enhanced, n = was.count + 1, merge = known && !was.enhanced && n >= CARD.mergeCount;
    merged.push(merge);
    ground.push(grind ? dustOf(id) : 0);
    if (!known || grind) continue;
    out[id] = merge ? { ...was, count: n - CARD.mergeCount, enhanced: true } : { ...was, count: n };
  }
  return { cards: out, merged, ground };
}

/** 새 계정·기록 초기화: 무기별 처음 카드 1장씩 */
export const starterCollection = (weapons: readonly string[]): Record<string, OwnedCard> =>
  addCards({}, weapons.flatMap((w) => starterCards(w)));

/** 강화한 카드에 남아 있는 보관 장수 (예전 규칙으로 쌓인 것)를 조각으로: 바뀐 카드 id와 받는 조각. 직접 갈기는 없음 */
export function grindSpares(c: Collection): { cards: Record<string, OwnedCard>; ids: string[]; dust: number } {
  const out: Record<string, OwnedCard> = { ...c }, ids: string[] = [];
  let dust = 0;
  for (const [id, o] of Object.entries(c)) {
    if (!o.enhanced || o.count <= 0 || !CARDS[id]) continue;
    dust += dustOf(id) * o.count;
    out[id] = { ...o, count: 0 };
    ids.push(id);
  }
  return { cards: out, ids, dust };
}

/** 지정 구매 검사 (조각 dust 보유, 이미 강화한 카드는 못 삼). 장착 숙련도는 보지 않음 (장착 때 검사) */
export function checkCraft(c: Collection, id: string, dust: number): CardFail | null {
  if (!CARDS[id]) return 'card';
  if (c[id]?.enhanced) return 'done';
  return dust < craftPriceOf(id) ? 'dust' : null;
}

/** 변형 고르기 검사: 강화한 액티브만, variant = null이면 기본 동작 */
export function checkVariant(c: Collection, id: string, variant: string | null): CardFail | null {
  if (!isActiveCard(id)) return 'card';
  if (!owns(c, id)) return 'owned';
  if (!c[id]!.enhanced) return 'variant';
  if (variant !== null && !SKILLS[id]?.variants?.[variant]) return 'variant';
  return null;
}
