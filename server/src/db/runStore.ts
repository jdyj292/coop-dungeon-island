// 던전 한 판 저장 (docs/network.md 11장 "던전 정산: 지갑·금고·인벤토리(재료·물약 차감)·숙련도·활동 기록을 한 트랜잭션으로")
// 물약은 출발 때 빼지 않고 정산 때 쓴 만큼만 뺀다 → 서버 재시작으로 판이 무효가 되면 저절로 돌려준 셈 (network.md 10장)
import { ITEMS, PLAYER, type S2C } from '@game/shared';
import { and, eq, sql } from 'drizzle-orm';
import type { Db } from './client';
import { activityLog, inventory, islands, users, weaponMastery } from './schema';

export type ResultLine = S2C['result']['lines'][number];
export interface Potions { hp: number; mp: number }

const POTION_ITEM: Record<keyof Potions, string> = { hp: 'hpPotion', mp: 'mpPotion' };

/** 층 재료 id (items.json materials의 floor) */
export const materialOf = (floor: number): string | undefined => Object.entries(ITEMS.materials).find(([, m]) => m.floor === floor)?.[0];

/** 무기 숙련도 (없으면 Lv1). weapon 생략 = 그 사람이 고른 무기 (users.weapon) */
export function mastery(db: Db, userId: number, weapon = weaponOf(db, userId)): { level: number; exp: number } {
  const r = db.select().from(weaponMastery).where(and(eq(weaponMastery.userId, userId), eq(weaponMastery.weapon, weapon))).get();
  return { level: r?.level ?? 1, exp: r?.exp ?? 0 };
}

/** 고른 무기 (users.weapon) */
export const weaponOf = (db: Db, userId: number): string =>
  db.select({ w: users.weapon }).from(users).where(eq(users.id, userId)).get()?.w ?? 'greatsword';

/** 가방의 물약 중 던전에 가져갈 개수 (한도 player.json potions.*.carry) */
export function carryPotions(db: Db, userId: number): Potions {
  const have = (k: keyof Potions) => db.select({ c: inventory.count }).from(inventory)
    .where(and(eq(inventory.userId, userId), eq(inventory.itemId, POTION_ITEM[k]))).get()?.c ?? 0;
  return { hp: Math.min(have('hp'), PLAYER.potions.hp.carry), mp: Math.min(have('mp'), PLAYER.potions.mp.carry) };
}

/** 한 사람의 정산 저장. used = 이번 판에 쓴 물약, weapon = 이번 판 무기 (그 무기 숙련도로) */
export function saveRun(db: Db, islandId: number, userId: number, kind: S2C['result']['kind'], line: ResultLine, used: Potions, floor: number, now: number, weapon = 'greatsword'): void {
  db.transaction((tx) => {
    tx.update(users).set({ wallet: sql`${users.wallet} + ${line.wallet}` }).where(eq(users.id, userId)).run();
    tx.update(islands).set({ treasury: sql`${islands.treasury} + ${line.treasury}` }).where(eq(islands.id, islandId)).run();
    const add = (itemId: string, n: number) => {
      if (!n) return;
      tx.insert(inventory).values({ userId, itemId, count: Math.max(0, n) })
        .onConflictDoUpdate({ target: [inventory.userId, inventory.itemId], set: { count: sql`max(0, ${inventory.count} + ${n})` } }).run();
    };
    const mat = materialOf(floor);
    if (mat) add(mat, line.materials);
    add(POTION_ITEM.hp, -used.hp);
    add(POTION_ITEM.mp, -used.mp);
    tx.insert(weaponMastery).values({ userId, weapon, level: line.levelAfter, exp: line.levelExp })
      .onConflictDoUpdate({ target: [weaponMastery.userId, weaponMastery.weapon], set: { level: line.levelAfter, exp: line.levelExp } }).run();
    tx.insert(activityLog).values({ islandId, userId, action: `dungeon:${kind}`, itemId: null, createdAt: now }).run();
  });
}
