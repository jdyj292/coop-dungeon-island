import { ITEMS, recoverReq, signupReq } from '@game/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from '../db/client';
import { authLog, inventory, islands, sessions, users } from '../db/schema';
import { Accounts } from './accounts';
import { LOCKS } from './limiter';

const IP = '1.2.3.4';
const MIN = 60_000;
let db: Db, acc: Accounts, now: number, ipN = 0;
/** 시도 제한에 걸리지 않게 요청마다 다른 IP */
const ip = () => `10.0.0.${ipN++}`;
const signup = (nickname: string) => acc.signup(signupReq.parse({ nickname, password: 'password1' }), ip(), now);

beforeEach(() => {
  db = openDb(':memory:').db;
  acc = new Accounts(db);
  now = 1_000_000;
});

describe('가입', () => {
  it('섬 없이 시작하고 세션·복구 코드를 준다. 비밀번호·복구 코드는 해시만 저장', async () => {
    const r = await signup('모리');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.recoveryCode).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
    const me = acc.me(r.value.userId)!;
    expect(me.nickname).toBe('모리');
    expect([me.island, me.request]).toEqual([null, null]);
    expect(db.select().from(islands).all()).toEqual([]);
    expect(acc.sessions.user(r.value.token, now)).toBe(r.value.userId);
    const row = db.select().from(users).get()!;
    expect(row.passwordHash).toMatch(/^\$argon2id\$/);
    expect(row.passwordHash).not.toContain('password1');
    expect(row.recoveryHash).toMatch(/^\$argon2id\$/);
    // 가입 선물
    expect(Object.fromEntries(db.select().from(inventory).all().map((r) => [r.itemId, r.count]))).toEqual(ITEMS.starter);
    // 토큰 원문은 DB에 없음
    expect(db.select().from(sessions).get()!.tokenHash).not.toBe(r.value.token);
  });

  it('닉네임 중복은 대소문자 무시, 형식이 틀리면 스키마에서 거절', async () => {
    await signup('Mori');
    expect(await signup('MORI')).toEqual({ ok: false, error: 'nicknameTaken' });
    for (const bad of ['a', 'abcdefghijklm', 'mo ri', '<b>x</b>', 'ㅁㅁ']) expect(signupReq.safeParse({ nickname: bad, password: 'password1' }).success).toBe(false);
    expect(signupReq.safeParse({ nickname: 'mori2', password: 'short' }).success).toBe(false);
  });

  it('IP당 시간당 3회', async () => {
    for (let i = 0; i < 3; i++) expect((await acc.signup(signupReq.parse({ nickname: `user${i}`, password: 'password1' }), IP, now)).ok).toBe(true);
    expect(await acc.signup(signupReq.parse({ nickname: 'user9', password: 'password1' }), IP, now)).toEqual({ ok: false, error: 'rateLimited' });
  });
});

describe('로그인', () => {
  it('맞으면 세션, 틀리거나 없는 닉네임은 같은 오류', async () => {
    await signup('Mori');
    expect((await acc.login({ nickname: 'mori', password: 'password1' }, ip(), now)).ok).toBe(true);
    expect(await acc.login({ nickname: 'Mori', password: 'wrong-pass' }, ip(), now)).toEqual({ ok: false, error: 'badLogin' });
    expect(await acc.login({ nickname: 'Nobody', password: 'password1' }, ip(), now)).toEqual({ ok: false, error: 'badLogin' });
  });

  it('연속 10회 실패 → 15분 잠금 (맞는 비밀번호도 거절), 지나면 풀림', async () => {
    await signup('Mori');
    const [max, lockMs] = LOCKS.login;
    // 계정당 분당 5회 제한을 피하려고 시간을 넘기며
    for (let i = 0; i < max; i++, now += 13_000) await acc.login({ nickname: 'Mori', password: 'wrong-pass' }, ip(), now);
    expect(await acc.login({ nickname: 'Mori', password: 'password1' }, ip(), now)).toEqual({ ok: false, error: 'badLogin' });
    expect(db.select().from(authLog).all().some((l) => l.event === 'lock')).toBe(true);
    now += lockMs;
    expect((await acc.login({ nickname: 'Mori', password: 'password1' }, ip(), now)).ok).toBe(true);
  });

  it('IP당·계정당 분당 5회', async () => {
    await signup('Mori');
    for (let i = 0; i < 5; i++) await acc.login({ nickname: 'Mori', password: 'wrong-pass' }, IP, now);
    expect(await acc.login({ nickname: 'Mori', password: 'password1' }, IP, now)).toEqual({ ok: false, error: 'rateLimited' });
    expect(await acc.login({ nickname: 'Mori', password: 'password1' }, ip(), now)).toEqual({ ok: false, error: 'rateLimited' });
    now += MIN;
    expect((await acc.login({ nickname: 'Mori', password: 'password1' }, IP, now)).ok).toBe(true);
  });
});

describe('세션', () => {
  it('30일 만료, 접속하면 연장, 로그아웃 즉시 삭제', async () => {
    const r = await signup('Mori');
    if (!r.ok) throw new Error();
    const day = 86_400_000;
    now += 20 * day;
    expect(acc.sessions.user(r.value.token, now)).toBe(r.value.userId);
    now += 20 * day; // 처음부터 40일, 마지막 접속부터 20일
    expect(acc.sessions.user(r.value.token, now)).toBe(r.value.userId);
    now += 31 * day;
    expect(acc.sessions.user(r.value.token, now)).toBeNull();
    const l = await acc.login({ nickname: 'Mori', password: 'password1' }, ip(), now);
    if (!l.ok) throw new Error();
    acc.logout(l.value.token, IP, now);
    expect(acc.sessions.user(l.value.token, now)).toBeNull();
  });
});

describe('복구·비밀번호 변경', () => {
  it('복구 코드로 재설정 → 새 복구 코드, 다른 세션 모두 끊김, 옛 코드 무효', async () => {
    const r = await signup('Mori');
    if (!r.ok) throw new Error();
    const res = await acc.recover(recoverReq.parse({ nickname: 'mori', recoveryCode: r.value.recoveryCode.toLowerCase(), password: 'newpassword' }), ip(), now);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.recoveryCode).not.toBe(r.value.recoveryCode);
    expect(acc.sessions.user(r.value.token, now)).toBeNull();
    expect(acc.sessions.user(res.value.token, now)).toBe(r.value.userId);
    expect((await acc.login({ nickname: 'Mori', password: 'newpassword' }, ip(), now)).ok).toBe(true);
    expect((await acc.recover(recoverReq.parse({ nickname: 'Mori', recoveryCode: r.value.recoveryCode, password: 'other-pass' }), ip(), now)).ok).toBe(false);
  });

  it('복구 코드 연속 5회 실패 → 1시간 잠금', async () => {
    const r = await signup('Mori');
    if (!r.ok) throw new Error();
    const wrong = recoverReq.parse({ nickname: 'Mori', recoveryCode: 'AAAA-AAAA-AAAA-AAAA', password: 'newpassword' });
    for (let i = 0; i < LOCKS.recover[0]; i++) await acc.recover(wrong, ip(), now);
    const right = recoverReq.parse({ nickname: 'Mori', recoveryCode: r.value.recoveryCode, password: 'newpassword' });
    expect((await acc.recover(right, ip(), now)).ok).toBe(false);
    now += LOCKS.recover[1];
    expect((await acc.recover(right, ip(), now)).ok).toBe(true);
  });

  it('비밀번호 변경: 지금 비밀번호 확인, 다른 세션 모두 끊고 새 세션', async () => {
    const r = await signup('Mori');
    if (!r.ok) throw new Error();
    expect(await acc.changePassword(r.value.userId, { current: 'nope-nope', password: 'newpassword' }, IP, now)).toEqual({ ok: false, error: 'badLogin' });
    const c = await acc.changePassword(r.value.userId, { current: 'password1', password: 'newpassword' }, IP, now);
    expect(c.ok && acc.sessions.user(c.value.token, now)).toBe(r.value.userId);
    expect(acc.sessions.user(r.value.token, now)).toBeNull();
  });
});

it('인증 기록에 비밀번호·토큰·복구 코드가 없다', async () => {
  const r = await signup('Mori');
  if (!r.ok) throw new Error();
  await acc.login({ nickname: 'Mori', password: 'wrong-pass' }, ip(), now);
  const dump = JSON.stringify(db.select().from(authLog).all());
  for (const secret of ['password1', 'wrong-pass', r.value.token, r.value.recoveryCode]) expect(dump).not.toContain(secret);
});
