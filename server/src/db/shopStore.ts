// 잡화점 구매·게시판 DB 처리 (docs/island.md 5·8장, network.md 11장 "구매는 즉시 트랜잭션")
// 장식·물약 = 개인 지갑 → 가방, 공용 장식(source treasury) = 공동 금고 → 공용 창고
import { ITEMS } from '@game/shared';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import type { Db } from './client';
import { activityLog, inventory, islandStorage, islands, memos, users } from './schema';

export type BuyFail = 'unknown' | 'money' | 'treasury';
export interface BuyResult { ok: boolean; reason?: BuyFail; wallet: number; treasury: number }

const LOG_SHOW = 100, MEMO_SHOW = 20;

export class ShopStore {
  constructor(private db: Db, readonly islandId: number) {}

  wallet(userId: number): number {
    return this.db.select({ w: users.wallet }).from(users).where(eq(users.id, userId)).get()?.w ?? 0;
  }

  treasury(): number {
    return this.db.select({ t: islands.treasury }).from(islands).where(eq(islands.id, this.islandId)).get()?.t ?? 0;
  }

  /** 가격 (없는 품목이면 null) */
  static price(itemId: string): { price: number; communal: boolean } | null {
    const d = ITEMS.decorations[itemId];
    if (d) return { price: d.price, communal: d.source === 'treasury' };
    const c = ITEMS.consumables[itemId];
    return c ? { price: c.price, communal: false } : null;
  }

  buy(userId: number, itemId: string, count: number, now: number): BuyResult {
    const p = ShopStore.price(itemId);
    return this.db.transaction((tx) => {
      const state = () => ({ wallet: this.wallet(userId), treasury: this.treasury() });
      if (!p) return { ok: false, reason: 'unknown' as const, ...state() };
      const cost = p.price * count;
      if (p.communal) {
        // 조건부 차감: 잔액이 모자라면 바뀐 줄이 0
        const r = tx.update(islands).set({ treasury: sql`${islands.treasury} - ${cost}` })
          .where(and(eq(islands.id, this.islandId), gte(islands.treasury, cost))).run();
        if (!r.changes) return { ok: false, reason: 'treasury' as const, ...state() };
        tx.insert(islandStorage).values({ islandId: this.islandId, itemId, count })
          .onConflictDoUpdate({ target: [islandStorage.islandId, islandStorage.itemId], set: { count: sql`${islandStorage.count} + ${count}` } }).run();
        tx.insert(activityLog).values({ islandId: this.islandId, userId, action: 'treasury', itemId, createdAt: now }).run();
      } else {
        const r = tx.update(users).set({ wallet: sql`${users.wallet} - ${cost}` }).where(and(eq(users.id, userId), gte(users.wallet, cost))).run();
        if (!r.changes) return { ok: false, reason: 'money' as const, ...state() };
        tx.insert(inventory).values({ userId, itemId, count })
          .onConflictDoUpdate({ target: [inventory.userId, inventory.itemId], set: { count: sql`${inventory.count} + ${count}` } }).run();
        tx.insert(activityLog).values({ islandId: this.islandId, userId, action: 'buy', itemId, createdAt: now }).run();
      }
      return { ok: true, ...state() };
    });
  }

  /** 개발 명령: 지갑·금고에 코인 */
  giveCoins(userId: number, to: 'wallet' | 'treasury', amount: number): void {
    if (to === 'wallet') this.db.update(users).set({ wallet: sql`${users.wallet} + ${amount}` }).where(eq(users.id, userId)).run();
    else this.db.update(islands).set({ treasury: sql`${islands.treasury} + ${amount}` }).where(eq(islands.id, this.islandId)).run();
  }

  addMemo(userId: number, text: string, now: number): void {
    this.db.insert(memos).values({ islandId: this.islandId, userId, text, createdAt: now }).run();
  }

  /** 게시판: 활동 기록 최근 100건 + 메모 최근 20개 (최신이 앞, 이름은 지금 닉네임) */
  board(): { log: { who: string; action: string; itemId: string | null; at: number }[]; memos: { who: string; text: string; at: number }[] } {
    const log = this.db.select({ who: users.nickname, action: activityLog.action, itemId: activityLog.itemId, at: activityLog.createdAt })
      .from(activityLog).leftJoin(users, eq(activityLog.userId, users.id))
      .where(eq(activityLog.islandId, this.islandId)).orderBy(desc(activityLog.createdAt), desc(activityLog.id)).limit(LOG_SHOW).all();
    const ms = this.db.select({ who: users.nickname, text: memos.text, at: memos.createdAt })
      .from(memos).leftJoin(users, eq(memos.userId, users.id))
      .where(eq(memos.islandId, this.islandId)).orderBy(desc(memos.createdAt), desc(memos.id)).limit(MEMO_SHOW).all();
    return { log: log.map((r) => ({ ...r, who: r.who ?? '?' })), memos: ms.map((r) => ({ ...r, who: r.who ?? '?' })) };
  }
}
