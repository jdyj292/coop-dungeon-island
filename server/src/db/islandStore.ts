// 섬 배치·가방·공용 창고 DB 처리 (docs/db.md, network.md 11장 "섬 배치·구매는 즉시 트랜잭션")
// 규칙 검사(칸·겹침)는 IslandGame이 먼저 하고, 여기서는 개수·소유만 확인하고 저장한다
import { and, eq, sql } from 'drizzle-orm';
import type { Db } from './client';
import { activityLog, inventory, islandStorage, placements } from './schema';

export interface PlacementRow {
  id: number;
  itemId: string;
  x: number;
  y: number;
  rot: number;
  placedBy: number | null;
  communal: boolean;
}

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

const toRecord = (rows: { itemId: string; count: number }[]) => Object.fromEntries(rows.filter((r) => r.count > 0).map((r) => [r.itemId, r.count]));

export class IslandStore {
  constructor(private db: Db, readonly islandId: number) {}

  placements(): PlacementRow[] {
    return this.db.select({
      id: placements.id, itemId: placements.itemId, x: placements.x, y: placements.y, rot: placements.rotation,
      placedBy: placements.placedBy, communal: placements.communal,
    }).from(placements).where(eq(placements.islandId, this.islandId)).all();
  }

  inventory(userId: number): Record<string, number> {
    return toRecord(this.db.select({ itemId: inventory.itemId, count: inventory.count }).from(inventory).where(eq(inventory.userId, userId)).all());
  }

  storage(): Record<string, number> {
    return toRecord(this.db.select({ itemId: islandStorage.itemId, count: islandStorage.count }).from(islandStorage).where(eq(islandStorage.islandId, this.islandId)).all());
  }

  /** 개수 더하기 (음수면 빼기). 모자라면 false */
  private add(tx: Tx, owner: { userId: number } | 'storage', itemId: string, n: number): boolean {
    if (owner === 'storage') {
      const row = tx.select().from(islandStorage).where(and(eq(islandStorage.islandId, this.islandId), eq(islandStorage.itemId, itemId))).get();
      if ((row?.count ?? 0) + n < 0) return false;
      tx.insert(islandStorage).values({ islandId: this.islandId, itemId, count: n })
        .onConflictDoUpdate({ target: [islandStorage.islandId, islandStorage.itemId], set: { count: sql`${islandStorage.count} + ${n}` } }).run();
      return true;
    }
    const row = tx.select().from(inventory).where(and(eq(inventory.userId, owner.userId), eq(inventory.itemId, itemId))).get();
    if ((row?.count ?? 0) + n < 0) return false;
    tx.insert(inventory).values({ userId: owner.userId, itemId, count: n })
      .onConflictDoUpdate({ target: [inventory.userId, inventory.itemId], set: { count: sql`${inventory.count} + ${n}` } }).run();
    return true;
  }

  private log(tx: Tx, userId: number, action: string, itemId: string, now: number): void {
    tx.insert(activityLog).values({ islandId: this.islandId, userId, action, itemId, createdAt: now }).run();
  }

  /** 가방(또는 공용 창고)에서 하나 꺼내 놓기. 없으면 null */
  place(userId: number, itemId: string, x: number, y: number, rot: number, from: 'mine' | 'storage', now: number): PlacementRow | null {
    return this.db.transaction((tx) => {
      if (!this.add(tx, from === 'storage' ? 'storage' : { userId }, itemId, -1)) return null;
      const communal = from === 'storage';
      const r = tx.insert(placements).values({ islandId: this.islandId, itemId, x, y, rotation: rot, placedBy: userId, communal, placedAt: now })
        .returning({ id: placements.id }).get();
      this.log(tx, userId, 'place', itemId, now);
      return { id: r.id, itemId, x, y, rot, placedBy: userId, communal };
    });
  }

  /** 옮기기·회전 (주민 누구나) */
  move(userId: number, id: number, x: number, y: number, rot: number, now: number): boolean {
    return this.db.transaction((tx) => {
      const p = tx.select().from(placements).where(and(eq(placements.id, id), eq(placements.islandId, this.islandId))).get();
      if (!p) return false;
      tx.update(placements).set({ x, y, rotation: rot }).where(eq(placements.id, id)).run();
      this.log(tx, userId, 'move', p.itemId, now);
      return true;
    });
  }

  /** 치우기 (주민 누구나): 놓은 사람 가방으로, 공용이면 공용 창고로. 치운 장식을 돌려준다 */
  remove(userId: number, id: number, now: number): PlacementRow | null {
    return this.db.transaction((tx) => {
      const p = tx.select().from(placements).where(and(eq(placements.id, id), eq(placements.islandId, this.islandId))).get();
      if (!p) return null;
      tx.delete(placements).where(eq(placements.id, id)).run();
      // 놓은 사람이 없으면(탈퇴 등) 공용 창고로
      this.add(tx, p.communal || p.placedBy === null ? 'storage' : { userId: p.placedBy }, p.itemId, 1);
      this.log(tx, userId, 'remove', p.itemId, now);
      return { id: p.id, itemId: p.itemId, x: p.x, y: p.y, rot: p.rotation, placedBy: p.placedBy, communal: p.communal };
    });
  }

  /** 개발 명령·가입 선물: 가방에 더하기 */
  give(userId: number, itemId: string, count: number): void {
    this.db.transaction((tx) => { this.add(tx, { userId }, itemId, count); });
  }
}
