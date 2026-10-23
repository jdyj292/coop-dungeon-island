// 세션 (docs/security.md 2장): 32바이트 토큰, DB엔 SHA-256만, 30일 + 접속할 때마다 연장, 로그아웃 즉시 삭제
import { AUTH } from '@game/shared';
import { eq, lt } from 'drizzle-orm';
import type { Db } from '../db/client';
import { authLog, sessions, users } from '../db/schema';
import { newToken, tokenHash } from './secrets';

const DAY = 86_400_000;
const TTL = AUTH.sessionDays * DAY;
/** 연장 쓰기는 이 간격보다 자주 하지 않음 (요청마다 DB 쓰기 방지) */
const TOUCH_MS = 60_000;
const AUTH_LOG_KEEP = 30 * DAY;

export class Sessions {
  constructor(private db: Db) {}

  /** 새 세션 → 쿠키에 넣을 토큰 (원문은 여기서만 존재) */
  create(userId: number, now: number): string {
    const token = newToken();
    this.db.insert(sessions).values({ tokenHash: tokenHash(token), userId, createdAt: now, expiresAt: now + TTL, lastSeenAt: now }).run();
    return token;
  }

  /** 토큰 → userId. 만료면 지우고 null, 정지된 계정이면 null, 살아 있으면 연장 */
  user(token: string | undefined, now: number): number | null {
    if (!token || token.length > 128) return null;
    const h = tokenHash(token);
    const row = this.db.select({ s: sessions, suspendedUntil: users.suspendedUntil }).from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id)).where(eq(sessions.tokenHash, h)).get();
    if (!row) return null;
    const s = row.s;
    // 관리자 정지 중이면 세션이 있어도 들어오지 못함
    if (row.suspendedUntil > now) return null;
    if (s.expiresAt <= now) {
      this.db.delete(sessions).where(eq(sessions.tokenHash, h)).run();
      return null;
    }
    if (now - s.lastSeenAt >= TOUCH_MS) this.db.update(sessions).set({ lastSeenAt: now, expiresAt: now + TTL }).where(eq(sessions.tokenHash, h)).run();
    return s.userId;
  }

  delete(token: string): void {
    this.db.delete(sessions).where(eq(sessions.tokenHash, tokenHash(token))).run();
  }

  /** 비밀번호 변경·재설정 시 그 계정의 모든 세션 무효화 */
  deleteAll(userId: number): void {
    this.db.delete(sessions).where(eq(sessions.userId, userId)).run();
  }

  /** 만료 세션과 30일 지난 인증 기록 지우기 (시작할 때 + 하루마다) */
  prune(now: number): void {
    this.db.delete(sessions).where(lt(sessions.expiresAt, now)).run();
    this.db.delete(authLog).where(lt(authLog.createdAt, now - AUTH_LOG_KEEP)).run();
  }
}
