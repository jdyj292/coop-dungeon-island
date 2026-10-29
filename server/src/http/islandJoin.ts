// 섬 고르기·입장 신청 (docs/island.md 7장, security.md 4장): 섬 목록, 새 섬 만들기, 신청·취소, 주인의 허용·거절. HTTP와 무관 (routes.ts가 감쌈)
// 섬 주인 = 섬을 만든 사람 (islands.owner_id). 자리 확인과 주민 넣기는 한 트랜잭션 (먼저 허용된 사람만 들어감)
import { AUTH, ISLAND, type IslandListItem, type JoinRequestItem } from '@game/shared';
import { and, asc, count, eq, isNull } from 'drizzle-orm';
import type { Db } from '../db/client';
import { activityLog, islands, joinRequests, placements, users } from '../db/schema';
import type { Result } from './accounts';
import { islandBus } from '../systems/islandBus';
import type { Limiter } from './limiter';

export class IslandJoin {
  constructor(private db: Db, private limiter: Limiter) {}

  /** 섬 주인 id */
  ownerOf(islandId: number): number | null {
    return this.db.select({ id: islands.ownerId }).from(islands).where(eq(islands.id, islandId)).get()?.id ?? null;
  }

  /** 모든 섬 (주민 있는 섬만, 만든 순서) */
  list(): IslandListItem[] {
    const rows = this.db.select({ id: islands.id, name: islands.name, residents: count(users.id), ownerId: islands.ownerId })
      .from(islands).innerJoin(users, eq(users.islandId, islands.id)).groupBy(islands.id).orderBy(asc(islands.id)).all();
    const names = new Map(this.db.select({ id: users.id, nickname: users.nickname }).from(users).all().map((u) => [u.id, u.nickname]));
    return rows.map((r) => ({ id: r.id, name: r.name, owner: names.get(r.ownerId ?? 0) ?? '?', residents: r.residents }));
  }

  private user(userId: number) {
    return this.db.select().from(users).where(eq(users.id, userId)).get();
  }

  /** 새 섬 ("닉네임의 섬", 기본 장식). 넣어 둔 신청은 지움 */
  create(userId: number, now: number): Result<number> {
    return this.db.transaction((tx): Result<number> => {
      const u = tx.select().from(users).where(eq(users.id, userId)).get();
      if (!u) return { ok: false, error: 'unauthorized' };
      if (u.islandId !== null) return { ok: false, error: 'hasIsland' };
      const islandId = tx.insert(islands).values({ name: `${u.nickname}의 섬`, ownerId: userId }).returning({ id: islands.id }).get().id;
      // 섬 기본 장식 (island.json starterDecor): 공용, 놓은 사람 없음
      for (const d of ISLAND.starterDecor) tx.insert(placements).values({ islandId, itemId: d.itemId, x: d.x, y: d.y, rotation: d.rot, communal: true, placedAt: now }).run();
      tx.update(users).set({ islandId }).where(eq(users.id, userId)).run();
      tx.delete(joinRequests).where(eq(joinRequests.userId, userId)).run();
      tx.insert(activityLog).values({ islandId, userId, action: 'found', createdAt: now }).run();
      return { ok: true, value: islandId };
    });
  }

  /** 입장 신청 (이전 신청은 바뀜). 꽉 찬 섬은 거절 */
  request(userId: number, islandId: number, now: number): Result<true> {
    if (!this.limiter.take('joinUser', String(userId), now)) return { ok: false, error: 'rateLimited' };
    const u = this.user(userId);
    if (!u) return { ok: false, error: 'unauthorized' };
    if (u.islandId !== null) return { ok: false, error: 'hasIsland' };
    const n = this.db.select({ n: count() }).from(users).where(eq(users.islandId, islandId)).get()!.n;
    if (n === 0) return { ok: false, error: 'invalid' };
    if (n >= AUTH.islandResidents) return { ok: false, error: 'islandFull' };
    this.db.insert(joinRequests).values({ userId, islandId, createdAt: now })
      .onConflictDoUpdate({ target: joinRequests.userId, set: { islandId, rejected: false, createdAt: now } }).run();
    // 섬 방이 주인에게 알림 (주인이 접속해 있으면)
    islandBus.requested(islandId, u.nickname);
    return { ok: true, value: true };
  }

  /** 신청 취소 (거절 알림을 본 뒤 지우기도 이것) */
  cancel(userId: number): void {
    this.db.delete(joinRequests).where(eq(joinRequests.userId, userId)).run();
  }

  /** 주인이 보는 기다리는 신청 (먼저 온 순서) */
  pending(ownerId: number): Result<JoinRequestItem[]> {
    const islandId = this.ownedIsland(ownerId);
    if (islandId === null) return { ok: false, error: 'notOwner' };
    const rows = this.db.select({ userId: joinRequests.userId, nickname: users.nickname, createdAt: joinRequests.createdAt })
      .from(joinRequests).innerJoin(users, eq(users.id, joinRequests.userId))
      .where(and(eq(joinRequests.islandId, islandId), eq(joinRequests.rejected, false), isNull(users.islandId)))
      .orderBy(asc(joinRequests.createdAt), asc(joinRequests.userId)).all();
    return { ok: true, value: rows };
  }

  private ownedIsland(userId: number): number | null {
    const u = this.user(userId);
    return u?.islandId != null && this.ownerOf(u.islandId) === userId ? u.islandId : null;
  }

  /** 허용(그 섬 주민이 됨) 또는 거절 */
  decide(ownerId: number, applicantId: number, accept: boolean, now: number): Result<true> {
    const islandId = this.ownedIsland(ownerId);
    if (islandId === null) return { ok: false, error: 'notOwner' };
    const r = this.db.transaction((tx): Result<true> => {
      const req = tx.select().from(joinRequests).where(eq(joinRequests.userId, applicantId)).get();
      const applicant = tx.select().from(users).where(eq(users.id, applicantId)).get();
      if (!req || req.islandId !== islandId || req.rejected || !applicant || applicant.islandId !== null) return { ok: false, error: 'noRequest' };
      if (!accept) {
        tx.update(joinRequests).set({ rejected: true }).where(eq(joinRequests.userId, applicantId)).run();
        return { ok: true, value: true };
      }
      const n = tx.select({ n: count() }).from(users).where(eq(users.islandId, islandId)).get()!.n;
      if (n >= AUTH.islandResidents) return { ok: false, error: 'islandFull' };
      tx.update(users).set({ islandId }).where(eq(users.id, applicantId)).run();
      tx.delete(joinRequests).where(eq(joinRequests.userId, applicantId)).run();
      tx.insert(activityLog).values({ islandId, userId: applicantId, action: 'join', createdAt: now }).run();
      return { ok: true, value: true };
    });
    if (r.ok && accept) islandBus.joined(islandId, applicantId);
    return r;
  }
}
