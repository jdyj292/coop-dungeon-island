// HTTP 수준: 쿠키 속성, 상태 코드, 형식 검사, 로그인 필요한 경로
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDb } from '../db/client';
import { createHttpApp } from './app';
import { SESSION_COOKIE } from './routes';

let server: Server, base: string, stop: () => void;

beforeAll(async () => {
  const { db } = openDb(':memory:');
  const h = createHttpApp(db);
  stop = h.stop;
  server = h.app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
afterAll(() => {
  stop();
  server.close();
});

const post = (path: string, body?: unknown, cookie?: string) => fetch(`${base}${path}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
  body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
});
const sid = (res: Response) => res.headers.get('set-cookie')?.split(';')[0] ?? '';

describe('/api', () => {
  it('가입 → httpOnly·Secure·SameSite=Lax 쿠키, /me, 로그아웃 뒤 401', async () => {
    const res = await post('/signup', { nickname: '모리', password: 'password1' });
    expect(res.status).toBe(200);
    const raw = res.headers.get('set-cookie')!;
    expect(raw).toMatch(new RegExp(`^${SESSION_COOKIE}=`));
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/Secure/i);
    expect(raw).toMatch(/SameSite=Lax/i);
    const body = await res.json() as { me: { nickname: string }; recoveryCode: string };
    expect(body.me.nickname).toBe('모리');
    expect(body.recoveryCode).toBeTruthy();
    expect(res.headers.get('cache-control')).toBe('no-store');

    const me = await fetch(`${base}/me`, { headers: { cookie: sid(res) } });
    expect(me.status).toBe(200);
    await post('/logout', undefined, sid(res));
    expect((await fetch(`${base}/me`, { headers: { cookie: sid(res) } })).status).toBe(401);
  });

  it('형식 오류·잘못된 JSON·너무 큰 본문은 400, 로그인 실패는 401, 중복은 409', async () => {
    expect((await post('/signup', { nickname: 'x', password: 'password1' })).status).toBe(400);
    expect((await post('/login', '{not json')).status).toBe(400);
    expect((await post('/login', { nickname: 'a', password: 'b'.repeat(5000) })).status).toBe(400);
    expect((await post('/login', { nickname: 'Nobody', password: 'password1' })).status).toBe(401);
    await post('/signup', { nickname: 'Kai', password: 'password1' });
    expect((await post('/signup', { nickname: 'kai', password: 'password1' })).status).toBe(409);
  });

  it('로그인 없이 /me·초대 코드 재발급·비밀번호 변경은 401', async () => {
    expect((await fetch(`${base}/me`)).status).toBe(401);
    expect((await post('/island/invite')).status).toBe(401);
    expect((await post('/password', { current: 'a', password: 'password2' }, `${SESSION_COOKIE}=forged`)).status).toBe(401);
  });

  it('로그인 → 초대 코드 재발급', async () => {
    const l = await post('/login', { nickname: 'Kai', password: 'password1' });
    expect(l.status).toBe(200);
    const r = await post('/island/invite', undefined, sid(l));
    expect(((await r.json()) as { inviteCode: string }).inviteCode).toHaveLength(8);
  });
});
