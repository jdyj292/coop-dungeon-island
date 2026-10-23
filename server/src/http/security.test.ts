// 통신 보안: Origin 제한(/api·WebSocket·CORS), 보안 헤더 (security.md 5장)
import type { IncomingMessage, Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDb } from '../db/client';
import { createHttpApp } from './app';
import { corsHeadersFor, originAllowed, wsOriginOk } from './security';

const SITE = 'https://game.example.com';
const req = (origin?: string) => ({ headers: origin ? { origin } : {} }) as IncomingMessage;

describe('Origin 판정', () => {
  it('배포: 우리 Origin과 Origin 없음(봇·curl)만, 개발: 모두', () => {
    expect(originAllowed(SITE, SITE)).toBe(true);
    expect(originAllowed(undefined, SITE)).toBe(true);
    expect(originAllowed('https://evil.example', SITE)).toBe(false);
    expect(originAllowed('http://game.example.com', SITE)).toBe(false);
    expect(originAllowed('https://evil.example', '')).toBe(true);
    expect(wsOriginOk(req('https://evil.example'), SITE)).toBe(false);
    expect(wsOriginOk(req(SITE), SITE)).toBe(true);
  });

  it('매치메이킹 CORS: 배포는 우리 Origin 고정, 개발은 요청한 Origin', () => {
    expect(corsHeadersFor(req('https://evil.example'), SITE)['Access-Control-Allow-Origin']).toBe(SITE);
    expect(corsHeadersFor(req('http://localhost:5173'), '')['Access-Control-Allow-Origin']).toBe('http://localhost:5173');
  });
});

describe('HTTP', () => {
  let server: Server, base: string, stop: () => void;
  beforeAll(async () => {
    const h = createHttpApp(openDb(':memory:').db, { publicOrigin: SITE });
    stop = h.stop;
    server = h.app.listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => {
    stop();
    server.close();
  });
  const login = (origin?: string) => fetch(`${base}/api/login`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) },
    body: JSON.stringify({ nickname: 'nobody', password: 'password1' }),
  });

  it('/api POST: 다른 Origin은 403, 우리 Origin·Origin 없음은 처리 (여기선 로그인 실패 401)', async () => {
    expect((await login('https://evil.example')).status).toBe(403);
    expect((await login(SITE)).status).toBe(401);
    expect((await login()).status).toBe(401);
  });

  it('보안 헤더: CSP(스크립트·연결은 우리 출처), nosniff, 프레임 금지', async () => {
    const res = await fetch(`${base}/api/me`);
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain(`connect-src 'self' wss://game.example.com`);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
  });
});
