// 보유 카드 (docs/skills.md 1장 얻기·강화, DB cards): 강화(3장 합치기), 갈기, 지정 구매, 변형 고르기 검사 (클라이언트·서버 공용, 순수 함수)
// 보유 = 강화했거나 보관 장수(count) ≥ 1. 강화는 저절로 되지 않고 플레이어가 직접 (mergeCount장 소모)
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
export type CardFail = 'card' | 'owned' | 'locked' | 'cap' | 'slot' | 'variant' | 'dust' | 'equipped' | 'merge';

export const owns = (c: Collection, id: string): boolean => !!c[id] && (c[id]!.enhanced || c[id]!.count > 0);
export const isEnhanced = (c: Collection, id: string): boolean => !!c[id]?.enhanced;
/** 강화한 뒤 남은 같은 카드 (쓰임 없음 → 카드 창 "갈기 추천") */
export const spareCount = (c: Collection, id: string): number => (c[id]?.enhanced ? c[id]!.count : 0);

/** 강화할 수 있나 (강화 안 된 카드를 mergeCount장 이상 보관) */
export const canEnhance = (c: Collection, id: string): boolean => !!c[id] && !c[id]!.enhanced && c[id]!.count >= CARD.mergeCount;

/** 카드를 더한다 (강화는 하지 않음) */
export function addCards(c: Collection, ids: readonly string[]): Record<string, OwnedCard> {
  const out: Record<string, OwnedCard> = { ...c };
  for (const id of ids) {
    if (!CARDS[id]) continue;
    const was = out[id] ?? { count: 0, enhanced: false };
    out[id] = { ...was, count: was.count + 1 };
  }
  return out;
}

/** 강화 검사 (패시브를 끼운 채 비용 한도를 넘는지는 equip.ts checkEnhanceCap) */
export function checkEnhance(c: Collection, id: string): CardFail | null {
  if (!CARDS[id]) return 'card';
  if (!owns(c, id)) return 'owned';
  return canEnhance(c, id) ? null : 'merge';
}

/** 강화: mergeCount장 소모 → 강화 카드 (검사는 checkEnhance) */
export function enhanceCard(c: Collection, id: string): Record<string, OwnedCard> {
  const was = c[id]!;
  return { ...c, [id]: { ...was, count: was.count - CARD.mergeCount, enhanced: true } };
}

/** 새 계정·기록 초기화: 무기별 처음 카드 1장씩 */
export const starterCollection = (weapons: readonly string[]): Record<string, OwnedCard> =>
  addCards({}, weapons.flatMap((w) => starterCards(w)));

/** 갈기 검사: n장 보관 중이어야 하고, 강화 안 된 장착 카드의 마지막 장은 못 갊 */
export function checkGrind(c: Collection, id: string, n: number, equipped: boolean): CardFail | null {
  if (!CARDS[id]) return 'card';
  if (!Number.isInteger(n) || n < 1 || (c[id]?.count ?? 0) < n) return 'owned';
  if (equipped && !c[id]!.enhanced && c[id]!.count - n < 1) return 'equipped';
  return null;
}

/** n장 갈기 (검사는 checkGrind): 남은 보유와 받는 조각 */
export function grindCards(c: Collection, id: string, n: number): { cards: Record<string, OwnedCard>; dust: number } {
  const was = c[id] ?? { count: 0, enhanced: false }, out: Record<string, OwnedCard> = { ...c };
  const left: OwnedCard = { ...was, count: was.count - n };
  if (left.count <= 0 && !left.enhanced) delete out[id];
  else out[id] = left;
  return { cards: out, dust: dustOf(id) * n };
}

/** 지정 구매 검사 (조각 dust 보유). 장착 숙련도는 보지 않음 (장착 때 검사) */
export function checkCraft(id: string, dust: number): CardFail | null {
  if (!CARDS[id]) return 'card';
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
