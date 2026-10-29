// 계정 (docs/security.md 1·3장, island.md 7장): 가입·로그인·복구·비밀번호 변경. HTTP와 무관 (routes.ts가 감쌈)
// 가입하면 섬 없이 시작 → 섬 고르기 화면에서 새 섬을 만들거나 입장 신청 (islandJoin.ts). 가입 선물 장식은 가방에. 돈·재고 변경은 트랜잭션 (db.md)
import { ITEMS, nicknameKey, type AuthError, type LoginReq, type MeRes, type PasswordReq, type RecoverReq, type SignupReq } from '@game/shared';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { authLog, inventory, islands, joinRequests, users } from '../db/schema';
import { IslandJoin } from './islandJoin';
import { Limiter, LOCKS } from './limiter';
import { burnVerify, hashSecret, newRecoveryCode, verifySecret } from './secrets';
import { Sessions } from './sessions';

export type Result<T> = { ok: true; value: T } | { ok: false; error: AuthError };
const fail = (error: AuthError): { ok: false; error: AuthError } => ({ ok: false, error });

/** 로그인 결과: 쿠키에 넣을 토큰. 가입·복구는 한 번만 보여줄 복구 코드도 */
export interface Login { token: string; userId: number }
export interface WithRecovery extends Login { recoveryCode: string }

export class Accounts {
  readonly sessions: Sessions;
  readonly islands: IslandJoin;
  /** 복구 코드 연속 실패 (메모리, 재시작하면 비워짐) */
  private recoverFails = new Map<number, { n: number; until: number }>();

  constructor(private db: Db, private limiter = new Limiter()) {
    this.sessions = new Sessions(db);
    this.islands = new IslandJoin(db, limiter);
  }

  /** 만료 세션·오래된 기록·시도 기록 정리 (주기적으로) */
  sweep(now: number): void {
    this.sessions.prune(now);
    this.limiter.sweep(now);
    for (const [id, f] of this.recoverFails) if (f.until && f.until <= now) this.recoverFails.delete(id);
  }

  private log(userId: number | null, ip: string, event: string, now: number): void {
    this.db.insert(authLog).values({ userId, ip, event, createdAt: now }).run();
  }

  private byNickname(nickname: string) {
    return this.db.select().from(users).where(eq(users.nicknameKey, nicknameKey(nickname))).get();
  }

  async signup(req: SignupReq, ip: string, now: number): Promise<Result<WithRecovery>> {
    if (!this.limiter.take('signupIp', ip, now)) return fail('rateLimited');
    if (this.byNickname(req.nickname)) return fail('nicknameTaken');
    const recovery = newRecoveryCode();
    const [passwordHash, recoveryHash] = await Promise.all([hashSecret(req.password), hashSecret(recovery.plain)]);
    // 해시하는 동안 바뀌었을 수 있으니 트랜잭션 안에서 다시 확인
    const r = this.db.transaction((tx): Result<number> => {
      if (tx.select({ id: users.id }).from(users).where(eq(users.nicknameKey, nicknameKey(req.nickname))).get()) return fail('nicknameTaken');
      const u = tx.insert(users).values({
        nickname: req.nickname, nicknameKey: nicknameKey(req.nickname), passwordHash, recoveryHash, createdAt: now,
      }).returning({ id: users.id }).get();
      // 가입 선물 (items.json starter)
      for (const [itemId, count] of Object.entries(ITEMS.starter)) tx.insert(inventory).values({ userId: u.id, itemId, count }).run();
      return { ok: true, value: u.id };
    });
    if (!r.ok) return r;
    this.log(r.value, ip, 'signup', now);
    return { ok: true, value: { token: this.sessions.create(r.value, now), userId: r.value, recoveryCode: recovery.shown } };
  }

  /** 실패는 모두 badLogin (없는 닉네임·잠김·틀린 비밀번호를 구분하지 않음, security.md 3장) */
  async login(req: LoginReq, ip: string, now: number): Promise<Result<Login>> {
    if (!this.limiter.take('loginIp', ip, now) || !this.limiter.take('loginUser', nicknameKey(req.nickname), now)) return fail('rateLimited');
    const u = this.byNickname(req.nickname);
    if (!u || u.lockedUntil > now) {
      await burnVerify(req.password);
      this.log(u?.id ?? null, ip, u ? 'login_locked' : 'login_fail', now);
      return fail('badLogin');
    }
    if (!(await verifySecret(u.passwordHash, req.password))) {
      const [max, lockMs] = LOCKS.login;
      const n = u.failedLogins + 1;
      const lock = n >= max;
      this.db.update(users).set(lock ? { failedLogins: 0, lockedUntil: now + lockMs } : { failedLogins: n }).where(eq(users.id, u.id)).run();
      this.log(u.id, ip, lock ? 'lock' : 'login_fail', now);
      return fail('badLogin');
    }
    if (u.failedLogins) this.db.update(users).set({ failedLogins: 0 }).where(eq(users.id, u.id)).run();
    // 관리자 정지: 비밀번호가 맞을 때만 알림 (닉네임 존재 여부는 숨긴 채)
    if (u.suspendedUntil > now) {
      this.log(u.id, ip, 'login_suspended', now);
      return fail('suspended');
    }
    this.log(u.id, ip, 'login', now);
    return { ok: true, value: { token: this.sessions.create(u.id, now), userId: u.id } };
  }

  logout(token: string, ip: string, now: number): void {
    const id = this.sessions.user(token, now);
    this.sessions.delete(token);
    if (id !== null) this.log(id, ip, 'logout', now);
  }

  /** 닉네임 + 복구 코드 → 새 비밀번호, 새 복구 코드, 다른 세션 모두 끊고 새로 로그인 */
  async recover(req: RecoverReq, ip: string, now: number): Promise<Result<WithRecovery>> {
    if (!this.limiter.take('recoverIp', ip, now)) return fail('rateLimited');
    const u = this.byNickname(req.nickname);
    const lock = u ? this.recoverFails.get(u.id) : undefined;
    if (!u || (lock && lock.until > now)) {
      await burnVerify(req.recoveryCode);
      this.log(u?.id ?? null, ip, 'recover_fail', now);
      return fail('badLogin');
    }
    if (!(await verifySecret(u.recoveryHash, req.recoveryCode))) {
      const [max, lockMs] = LOCKS.recover;
      const n = (lock?.n ?? 0) + 1;
      this.recoverFails.set(u.id, n >= max ? { n: 0, until: now + lockMs } : { n, until: 0 });
      this.log(u.id, ip, n >= max ? 'recover_lock' : 'recover_fail', now);
      return fail('badLogin');
    }
    this.recoverFails.delete(u.id);
    const recovery = newRecoveryCode();
    const [passwordHash, recoveryHash] = await Promise.all([hashSecret(req.password), hashSecret(recovery.plain)]);
    this.db.update(users).set({ passwordHash, recoveryHash, failedLogins: 0, lockedUntil: 0 }).where(eq(users.id, u.id)).run();
    this.sessions.deleteAll(u.id);
    this.log(u.id, ip, 'recover', now);
    return { ok: true, value: { token: this.sessions.create(u.id, now), userId: u.id, recoveryCode: recovery.shown } };
  }

  /** 비밀번호 변경: 모든 세션을 끊고 이 기기는 새 세션 */
  async changePassword(userId: number, req: PasswordReq, ip: string, now: number): Promise<Result<Login>> {
    const u = this.db.select().from(users).where(eq(users.id, userId)).get();
    if (!u || !(await verifySecret(u.passwordHash, req.current))) {
      this.log(userId, ip, 'password_fail', now);
      return fail('badLogin');
    }
    this.db.update(users).set({ passwordHash: await hashSecret(req.password) }).where(eq(users.id, userId)).run();
    this.sessions.deleteAll(userId);
    this.log(userId, ip, 'password', now);
    return { ok: true, value: { token: this.sessions.create(userId, now), userId } };
  }

  me(userId: number): MeRes | null {
    const row = this.db.select().from(users).leftJoin(islands, eq(users.islandId, islands.id)).where(eq(users.id, userId)).get();
    if (!row) return null;
    const { users: u, islands: i } = row;
    const req = i ? undefined : this.db.select({ islandId: joinRequests.islandId, islandName: islands.name, rejected: joinRequests.rejected })
      .from(joinRequests).innerJoin(islands, eq(islands.id, joinRequests.islandId)).where(eq(joinRequests.userId, u.id)).get();
    return {
      id: u.id, nickname: u.nickname, wallet: u.wallet, hairStyle: u.hairStyle, hairColor: u.hairColor, weapon: u.weapon,
      island: i ? { id: i.id, name: i.name, treasury: i.treasury, ownerId: this.islands.ownerOf(i.id) ?? u.id } : null,
      request: req ?? null,
    };
  }
}
