// 스킬 카드 저장 (docs/skills.md 1장, db.md cards·card_slots): 보유·장착 읽기, 카드 창 값, 지정 구매(3장째면 강화)·남은 장수 조각으로·변형·장착, 던전 빌드, 처음 카드.
// 검사는 shared cards/ (클라이언트 신고값은 믿지 않는다), 돈·조각·카드 변경은 트랜잭션 한 번. 팩 열기는 cardPack.ts
import {
  ACTIVE_SLOTS, CARDS, checkCraft, checkEquip, checkVariant, craftPriceOf, defaultLoadout, dungeonBuild,
  encodeBuild, equipCard, giftItemOf, grindSpares, MVP_WEAPONS, passiveCap, receiveCards, starterCollection, WELCOME_PACKS,
  type CardFail, type CardKind, type CardLoadout, type Collection, type OwnedCard, type S2C,
} from '@game/shared';
import { and, eq, gte, sql } from 'drizzle-orm';
import type { Db } from './client';
import { mastery } from './runStore';
import { cards, cardSlots, inventory, users } from './schema';

/** db 또는 트랜잭션 */
export type Q = Pick<Db, 'select' | 'insert' | 'update' | 'delete'>;
export type CardsView = Omit<S2C['cards'], 'fail'>;

/** 보유 카드 (데이터에서 사라진 카드·변형은 버림). weapon을 주면 그 무기 카드만 */
export function collectionOf(q: Q, userId: number, weapon?: string): Record<string, OwnedCard> {
  const out: Record<string, OwnedCard> = {};
  for (const r of q.select().from(cards).where(eq(cards.userId, userId)).all()) {
    const c = CARDS[r.cardId];
    if (!c || (weapon && c.weapon !== weapon) || (r.count <= 0 && !r.enhanced)) continue;
    out[r.cardId] = { count: r.count, enhanced: r.enhanced, ...(r.enhanced && r.variant ? { variant: r.variant } : {}) };
  }
  return out;
}

/** 보유를 바꿔 씀: ids의 카드만 (after에 없으면 행을 지움) */
export function writeCards(q: Q, userId: number, after: Collection, ids: Iterable<string>): void {
  for (const cardId of new Set(ids)) {
    const o = after[cardId];
    if (!o) {
      q.delete(cards).where(and(eq(cards.userId, userId), eq(cards.cardId, cardId))).run();
      continue;
    }
    const row = { count: o.count, enhanced: o.enhanced, variant: o.variant ?? null };
    q.insert(cards).values({ userId, cardId, ...row }).onConflictDoUpdate({ target: [cards.userId, cards.cardId], set: row }).run();
  }
}

/** 장착 (그 무기 행이 없으면 기본 배치 = A S 처음 카드) */
export function loadoutOf(q: Q, userId: number, weapon: string): CardLoadout {
  const rows = q.select().from(cardSlots).where(and(eq(cardSlots.userId, userId), eq(cardSlots.weapon, weapon))).all();
  if (!rows.length) return defaultLoadout(weapon);
  const active: (string | null)[] = Array<string | null>(ACTIVE_SLOTS).fill(null);
  for (const r of rows) if (r.kind === 'active' && r.slot >= 0 && r.slot < ACTIVE_SLOTS) active[r.slot] = r.cardId;
  const passive = rows.filter((r) => r.kind === 'passive').sort((a, b) => a.slot - b.slot).map((r) => r.cardId);
  return { active, passive };
}

/** 장착 다시 적기 (액티브·패시브 모두: 한쪽만 적으면 다른 쪽이 기본 배치로 돌아가지 않게) */
function writeLoadout(q: Q, userId: number, weapon: string, lo: CardLoadout): void {
  q.delete(cardSlots).where(and(eq(cardSlots.userId, userId), eq(cardSlots.weapon, weapon))).run();
  const put = (kind: CardKind, slot: number, cardId: string | null) => {
    if (cardId) q.insert(cardSlots).values({ userId, weapon, kind, slot, cardId }).run();
  };
  lo.active.forEach((id, i) => put('active', i, id));
  lo.passive.forEach((id, i) => put('passive', i, id));
}

export const dustOfUser = (q: Q, userId: number): number =>
  q.select({ d: users.dust }).from(users).where(eq(users.id, userId)).get()?.d ?? 0;

/** 남은 환영 선물 팩 */
export const giftsOf = (q: Q, userId: number): number =>
  q.select({ c: inventory.count }).from(inventory)
    .where(and(eq(inventory.userId, userId), eq(inventory.itemId, giftItemOf(WELCOME_PACKS.pack)))).get()?.c ?? 0;

/** 조각 더하기 (음수면 빼기, 모자라면 false: 조건부 차감) */
export function addDust(q: Q, userId: number, n: number): boolean {
  const r = q.update(users).set({ dust: sql`${users.dust} + ${n}` }).where(and(eq(users.id, userId), gte(users.dust, Math.max(0, -n)))).run();
  return r.changes > 0;
}

/** 카드 창 값 (무기마다 숙련도·패시브 한도·보유·장착) */
export function cardsView(db: Db, userId: number): CardsView {
  return {
    dust: dustOfUser(db, userId), gifts: giftsOf(db, userId),
    weapons: MVP_WEAPONS.map((weapon) => {
      const level = mastery(db, userId, weapon).level, lo = loadoutOf(db, userId, weapon);
      return { weapon, level, cap: passiveCap(level), owned: collectionOf(db, userId, weapon), active: lo.active.map((id) => id ?? ''), passive: [...lo.passive] };
    }),
  };
}

/** 던전 출발 때 파티 정보에 실을 빌드 문자열 (장착 카드만, 액티브는 칸) */
export function buildOf(db: Db, userId: number, weapon: string): string {
  return encodeBuild(dungeonBuild(weapon, mastery(db, userId, weapon).level, collectionOf(db, userId, weapon), loadoutOf(db, userId, weapon)));
}

/** 새 계정·기록 초기화: 무기별 처음 카드 1장씩 + 환영 선물 팩 */
export function grantStarter(q: Q, userId: number): void {
  const start = starterCollection(MVP_WEAPONS);
  writeCards(q, userId, { ...collectionOf(q, userId), ...start }, Object.keys(start));
  q.insert(inventory).values({ userId, itemId: giftItemOf(WELCOME_PACKS.pack), count: WELCOME_PACKS.count })
    .onConflictDoUpdate({ target: [inventory.userId, inventory.itemId], set: { count: sql`${inventory.count} + ${WELCOME_PACKS.count}` } }).run();
}

/** 지정 구매: 조각으로 1장 (3장째면 바로 강화) */
export function craftCard(db: Db, userId: number, cardId: string): CardFail | null {
  return db.transaction((tx) => {
    const c = collectionOf(tx, userId), fail = checkCraft(c, cardId, dustOfUser(tx, userId));
    if (fail || !addDust(tx, userId, -craftPriceOf(cardId))) return fail ?? 'dust';
    writeCards(tx, userId, receiveCards(c, [cardId]).cards, [cardId]);
    return null;
  });
}

/** 강화한 카드에 남은 보관 장수(예전 규칙으로 쌓인 것)를 조각으로 (섬 입장 때, 직접 갈기는 없음). 받은 조각 */
export function grindSparesOf(db: Db, userId: number): number {
  return db.transaction((tx) => {
    const r = grindSpares(collectionOf(tx, userId));
    if (!r.dust) return 0;
    writeCards(tx, userId, r.cards, r.ids);
    addDust(tx, userId, r.dust);
    return r.dust;
  });
}

/** 강화 액티브 변형 (null = 기본 동작) */
export function setVariant(db: Db, userId: number, cardId: string, variant: string | null): CardFail | null {
  const fail = checkVariant(collectionOf(db, userId), cardId, variant);
  if (fail) return fail;
  db.update(cards).set({ variant }).where(and(eq(cards.userId, userId), eq(cards.cardId, cardId))).run();
  return null;
}

/** 장착·빼기 (액티브는 그 칸 카드와 자리 바꿈, 패시브는 그 자리 바꾸기·끝에 더하기, null = 빼기) */
export function equipSlot(db: Db, userId: number, weapon: string, kind: CardKind, slot: number, cardId: string | null): CardFail | null {
  return db.transaction((tx) => {
    const c = collectionOf(tx, userId, weapon), lo = loadoutOf(tx, userId, weapon);
    const fail = checkEquip(weapon, mastery(tx, userId, weapon).level, c, lo, kind, slot, cardId);
    if (fail) return fail;
    writeLoadout(tx, userId, weapon, equipCard(lo, kind, slot, cardId));
    return null;
  });
}
