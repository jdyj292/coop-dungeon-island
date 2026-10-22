// 섬 방이 읽는 DB 값 (docs/db.md): 섬 이름·금고, 주민 목록 (가입 순서 = 플레이어 색 번호)
import { asc, eq } from 'drizzle-orm';
import type { Db } from './client';
import { islands, users } from './schema';

export interface IslandRow {
  name: string;
  treasury: number;
  /** 가입 순서대로 */
  residents: { id: number; nickname: string }[];
}

export function loadIsland(db: Db, islandId: number): IslandRow | null {
  const isl = db.select().from(islands).where(eq(islands.id, islandId)).get();
  if (!isl) return null;
  const residents = db.select({ id: users.id, nickname: users.nickname }).from(users).where(eq(users.islandId, islandId)).orderBy(asc(users.id)).all();
  return { name: isl.name, treasury: isl.treasury, residents };
}
