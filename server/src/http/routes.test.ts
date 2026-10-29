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

  it('로그인 없이 /me·섬 목록·섬 만들기·신청·비밀번호 변경은 401', async () => {
    expect((await fetch(`${base}/me`)).status).toBe(401);
    expect((await fetch(`${base}/islands`)).status).toBe(401);
    expect((await post('/island/create')).status).toBe(401);
    expect((await post('/island/request', { islandId: 1 })).status).toBe(401);
    expect((await post('/password', { current: 'a', password: 'password2' }, `${SESSION_COOKIE}=forged`)).status).toBe(401);
  });

  it('섬 만들기 → 목록 → 신청 → 주인이 허용 → 신청자 /me에 섬', async () => {
    const kai = sid(await post('/login', { nickname: 'Kai', password: 'password1' }));
    const mori = sid(await post('/login', { nickname: '모리', password: 'password1' }));
    const made = (await (await post('/island/create', undefined, kai)).json()) as { me: { id: number; island: { id: number } } };
    expect((await post('/island/create', undefined, kai)).status).toBe(409);
    const list = (await (await fetch(`${base}/islands`, { headers: { cookie: mori } })).json()) as { islands: { id: number; owner: string; residents: number }[] };
    expect(list.islands).toEqual([{ id: made.me.island.id, name: 'Kai의 섬', owner: 'Kai', residents: 1 }]);
    expect((await post('/island/request', { islandId: 'x' }, mori)).status).toBe(400);
    const req = (await (await post('/island/request', { islandId: made.me.island.id }, mori)).json()) as { me: { id: number; request: { islandName: string } } };
    expect(req.me.request.islandName).toBe('Kai의 섬');
    // 주인 아니면 403
    expect((await fetch(`${base}/island/requests`, { headers: { cookie: mori } })).status).toBe(403);
    const pending = (await (await fetch(`${base}/island/requests`, { headers: { cookie: kai } })).json()) as { requests: { userId: number }[] };
    expect(pending.requests.map((r) => r.userId)).toEqual([req.me.id]);
    expect((await post('/island/decide', { userId: req.me.id, accept: true }, kai)).status).toBe(200);
    const me = (await (await fetch(`${base}/me`, { headers: { cookie: mori } })).json()) as { me: { island: { id: number; ownerId: number } } };
    expect(me.me.island).toMatchObject({ id: made.me.island.id, ownerId: made.me.id });
  });
});
