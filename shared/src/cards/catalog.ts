// 카드 목록·티어 (docs/skills.md 1장, 데이터 shared/data/cards.json·packs.json, 값 balance.md 7장 카드 경제)
// 카드 id = 스킬 id(액티브) 또는 패시브 id (공용 패시브는 '<무기>.<id>'). 무기 id는 문자열 (cards.json weapon)
import type { WeaponDef } from '../actions';
import { CARD_DATA, COMBAT, PACKS, WEAPONS } from '../data/load';
import type { CardDef, PackDef, TierDef } from '../data/schema';

export const CARD = COMBAT.card;
/** 액티브 칸 수 (A S D F) */
export const ACTIVE_SLOTS = CARD.activeSlots;
export const CARDS: Readonly<Record<string, CardDef>> = CARD_DATA.cards;
export type CardKind = CardDef['kind'];
export type CardBranch = CardDef['branch'];
/** 계열 (계열 보너스를 세는 계열) */
export const BRANCHES = ['A', 'B'] as const;
export type Branch = (typeof BRANCHES)[number];

/** 티어 번호 (오름차순) */
export const TIERS: readonly number[] = Object.keys(CARD_DATA.tiers).map(Number).sort((a, b) => a - b);

export const isCard = (id: string): boolean => !!CARDS[id];
export const isActiveCard = (id: string): boolean => CARDS[id]?.kind === 'active';
export const isPassiveCard = (id: string): boolean => CARDS[id]?.kind === 'passive';
export const cardBranch = (id: string): CardBranch => CARDS[id]?.branch ?? 'base';
export const tierOf = (id: string): number => CARDS[id]?.tier ?? 1;
export const tierDef = (tier: number): TierDef | undefined => CARD_DATA.tiers[String(tier)];
/** 장착 숙련도 (카드 티어의 equipLevel) */
export const equipLevelOf = (id: string): number => tierDef(tierOf(id))?.equipLevel ?? 1;
/** 갈면 받는 조각 (한 장) */
export const dustOf = (id: string): number => tierDef(tierOf(id))?.dust ?? 0;
/** 지정 구매 가격 (조각) */
export const craftPriceOf = (id: string): number => tierDef(tierOf(id))?.craft ?? 0;
/** 패시브 비용: cost(없으면 티어), 강화 +1 */
export const passiveCost = (id: string, enhanced: boolean): number => (CARDS[id]?.cost ?? tierOf(id)) + (enhanced ? 1 : 0);
/** 패시브 비용 한도: base + floor((숙련도 − 1) / every) */
export const passiveCap = (level: number): number => CARD.passiveCap.base + Math.floor((Math.max(1, level) - 1) / CARD.passiveCap.every);
/** 처음 카드 (기본 스킬 2장) */
export const starterCards = (weapon: string): readonly string[] => CARD_DATA.starter[weapon] ?? [];

const byWeapon = new Map<string, string[]>();
/** 무기 카드 (cards.json 순서). kind를 주면 그 종류만 */
export function weaponCards(weapon: string, kind?: CardKind): string[] {
  const key = `${weapon}:${kind ?? ''}`;
  let ids = byWeapon.get(key);
  if (!ids) byWeapon.set(key, (ids = Object.keys(CARDS).filter((id) => CARDS[id]!.weapon === weapon && (!kind || CARDS[id]!.kind === kind))));
  return ids;
}

/** 무기 정의 → 무기 id */
export const weaponIdOf = (w: WeaponDef): string => Object.keys(WEAPONS).find((k) => WEAPONS[k] === w) ?? '';

export const packDef = (pack: number): PackDef | undefined => PACKS[String(pack)];
/** 팩 번호 (오름차순) */
export const PACK_NUMBERS: readonly number[] = Object.keys(PACKS).map(Number).sort((a, b) => a - b);
/** 이 숙련도에 열린 팩인가 */
export const packOpen = (pack: number, level: number): boolean => level >= (packDef(pack)?.unlockLevel ?? Infinity);
