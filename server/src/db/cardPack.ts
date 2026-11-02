// 카드팩 사서 열기 (docs/skills.md 1장 얻기, balance.md 7장 카드 경제, island.md 5장 카드 상점)
// 코인(개인 지갑)·조각·환영 선물 빼기 + 굴림 + 카드 넣기(3장이 모이면 바로 강화, 이미 강화한 카드는 바로 갈아 조각) + 천장을 한 트랜잭션으로. 굴림은 서버 (난수는 넣어 줄 수 있음: 테스트)
import { giftItemOf, MVP_WEAPONS, owns, packDef, packOpen, receiveCards, rollPack, tierOf, WELCOME_PACKS, type Rng, type S2C } from '@game/shared';
import { and, eq, gte, sql } from 'drizzle-orm';
import type { Db } from './client';
import { addDust, collectionOf, writeCards, type Q } from './cardStore';
import { mastery } from './runStore';
import { activityLog, cardPity, inventory, users } from './schema';

export type PackPay = 'coin' | 'dust' | 'gift';
export type PackFail = 'card' | 'locked' | 'coin' | 'dust' | 'gift';
/** 게시판에 한 줄 남기는 티어 (이 티어 이상이 나오면, island.md 5장) */
export const BOAST_TIER = 3;

const pityOf = (q: Q, userId: number, weapon: string, pack: number): number =>
  q.select({ o: cardPity.opened }).from(cardPity)
    .where(and(eq(cardPity.userId, userId), eq(cardPity.weapon, weapon), eq(cardPity.pack, pack))).get()?.o ?? 0;

/** 값 치르기 (조건부 차감, 모자라면 사유) */
function pay(q: Q, userId: number, pack: number, how: PackPay, price: number): PackFail | null {
  if (how === 'dust') return addDust(q, userId, -price) ? null : 'dust';
  if (how === 'coin') {
    const r = q.update(users).set({ wallet: sql`${users.wallet} - ${price}` }).where(and(eq(users.id, userId), gte(users.wallet, price))).run();
    return r.changes ? null : 'coin';
  }
  if (pack !== WELCOME_PACKS.pack) return 'gift';
  const r = q.update(inventory).set({ count: sql`${inventory.count} - 1` })
    .where(and(eq(inventory.userId, userId), eq(inventory.itemId, giftItemOf(pack)), gte(inventory.count, 1))).run();
  return r.changes ? null : 'gift';
}

/** 팩 하나 사서 열기. islandId = 게시판 기록할 섬 (티어 3 이상) */
export function openPack(db: Db, userId: number, islandId: number, weapon: string, pack: number, how: PackPay, now: number, rng: Rng = Math.random): { fail: PackFail } | { pack: S2C['pack'] } {
  const p = packDef(pack);
  if (!p || !(MVP_WEAPONS as readonly string[]).includes(weapon)) return { fail: 'card' };
  return db.transaction((tx) => {
    if (!packOpen(pack, mastery(tx, userId, weapon).level)) return { fail: 'locked' as const };
    const fail = pay(tx, userId, pack, how, p.price);
    if (fail) return { fail };
    const roll = rollPack(weapon, pack, pityOf(tx, userId, weapon, pack), rng);
    const before = collectionOf(tx, userId), seen = new Set<string>(), got = receiveCards(before, roll.cards);
    const cards = roll.cards.map((id, i) => {
      const isNew = !owns(before, id) && !seen.has(id);
      seen.add(id);
      return { id, tier: roll.tiers[i] ?? tierOf(id), isNew, merged: !!got.merged[i], ground: got.ground[i] ?? 0 };
    });
    writeCards(tx, userId, got.cards, roll.cards);
    const dust = got.ground.reduce((s, n) => s + n, 0);
    if (dust) addDust(tx, userId, dust);
    if (p.pity) {
      tx.insert(cardPity).values({ userId, weapon, pack, opened: roll.opened })
        .onConflictDoUpdate({ target: [cardPity.userId, cardPity.weapon, cardPity.pack], set: { opened: roll.opened } }).run();
    }
    for (const c of cards) {
      if (c.tier >= BOAST_TIER) tx.insert(activityLog).values({ islandId, userId, action: 'card', itemId: c.id, createdAt: now }).run();
    }
    return { pack: { weapon, pack, cards, pity: roll.opened } };
  });
}
