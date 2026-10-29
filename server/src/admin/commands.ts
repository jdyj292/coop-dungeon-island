// 관리자 명령 (docs/security.md 6장 "관리자 도구: 명령줄 스크립트", docs/deploy.md): 정지·해제·세션 강제 종료·목록·백업
// 웹 관리자 페이지는 두지 않는다. 모든 관리 작업은 auth_log에 남긴다 (ip = 'admin'). 비밀 값은 출력하지 않음
import { chmodSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { nicknameKey } from '@game/shared';
import type Database from 'better-sqlite3';
import { desc, eq, max } from 'drizzle-orm';
import type { Db } from '../db/client';
import { authLog, islands, sessions, users } from '../db/schema';

const DAY = 86_400_000;
/** 기간 없는 정지 (9999-12-31) */
export const FOREVER = 253_402_300_799_000;

function userOf(db: Db, nickname: string) {
  const u = db.select().from(users).where(eq(users.nicknameKey, nicknameKey(nickname))).get();
  if (!u) throw new Error(`없는 닉네임: ${nickname}`);
  return u;
}

const log = (db: Db, userId: number, event: string, now: number) =>
  db.insert(authLog).values({ userId, ip: 'admin', event: `admin:${event}`, createdAt: now }).run();

/** 정지 (days 없으면 기간 없이). 그 계정의 세션도 모두 끊음. 반환 = 풀리는 시각 */
export function suspend(db: Db, nickname: string, days: number | null, now: number): number {
  const u = userOf(db, nickname), until = days ? now + days * DAY : FOREVER;
  db.transaction((tx) => {
    tx.update(users).set({ suspendedUntil: until }).where(eq(users.id, u.id)).run();
    tx.delete(sessions).where(eq(sessions.userId, u.id)).run();
  });
  log(db, u.id, 'suspend', now);
  return until;
}

export function unsuspend(db: Db, nickname: string, now: number): void {
  const u = userOf(db, nickname);
  db.update(users).set({ suspendedUntil: 0, failedLogins: 0, lockedUntil: 0 }).where(eq(users.id, u.id)).run();
  log(db, u.id, 'unsuspend', now);
}

/** 세션 강제 종료 (다음 요청·입장부터 다시 로그인). 반환 = 지운 세션 수 */
export function kick(db: Db, nickname: string, now: number): number {
  const u = userOf(db, nickname);
  const n = db.delete(sessions).where(eq(sessions.userId, u.id)).run().changes;
  log(db, u.id, 'kick', now);
  return n;
}

/** 계정 목록 (닉네임·섬·지갑·정지·마지막 접속) */
export function listUsers(db: Db): { nickname: string; island: string | null; wallet: number; suspendedUntil: number; lastSeen: number | null }[] {
  return db.select({
    nickname: users.nickname, island: islands.name, wallet: users.wallet, suspendedUntil: users.suspendedUntil, lastSeen: max(sessions.lastSeenAt),
  }).from(users).leftJoin(islands, eq(users.islandId, islands.id)).leftJoin(sessions, eq(sessions.userId, users.id))
    .groupBy(users.id).orderBy(desc(max(sessions.lastSeenAt)), users.id).all();
}

/** 백업 파일 이름 (날짜·시각, 사전순 = 시간순) */
export const backupName = (now: number) => `game-${new Date(now).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}.sqlite`;

/**
 * 온라인 백업 (서버가 돌고 있어도 됨, SQLite backup API) → dir/game-<시각>.sqlite, 권한 600.
 * 오래된 백업은 keep개만 남김 (security.md 6장 "매일 백업, 7일치"). 반환 = 만든 파일
 */
export async function backup(sqlite: Database.Database, dir: string, keep: number, now: number): Promise<string> {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = join(dir, backupName(now));
  await sqlite.backup(file);
  chmodSync(file, 0o600);
  const all = readdirSync(dir).filter((f) => /^game-\d{8}T\d{6}Z\.sqlite$/.test(f)).sort();
  for (const old of all.slice(0, Math.max(0, all.length - keep))) rmSync(join(dir, old));
  return file;
}
