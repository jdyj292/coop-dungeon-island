// 인증 HTTP API (docs/security.md, network.md 3장). 요청은 zod로 검사, 세션은 httpOnly 쿠키
// POST /api/signup·login·logout·recover·password, GET /api/me
// 섬 고르기 (island.md 7장): GET /api/islands, POST /api/island/create·request·request/cancel, 섬 주인: GET /api/island/requests, POST /api/island/decide
import { AUTH, decideReq, joinReq, loginReq, passwordReq, recoverReq, signupReq, type AuthError } from '@game/shared';
import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import type { z } from 'zod';
import type { Accounts } from './accounts';

export const SESSION_COOKIE = 'sid';

const STATUS: Record<AuthError, number> = {
  invalid: 400, badLogin: 401, unauthorized: 401, locked: 423, suspended: 403, rateLimited: 429, nicknameTaken: 409, islandFull: 409,
  noIsland: 409, hasIsland: 409, notOwner: 403, noRequest: 409,
};

export interface HttpOptions {
  /** Secure 쿠키 (기본 true. localhost는 브라우저가 http여도 받음) */
  secureCookie?: boolean;
  now?: () => number;
}

export function authRouter(accounts: Accounts, opts: HttpOptions = {}): express.Router {
  const now = opts.now ?? Date.now;
  const cookie: express.CookieOptions = {
    httpOnly: true, secure: opts.secureCookie ?? true, sameSite: 'lax', path: '/', maxAge: AUTH.sessionDays * 86_400_000,
  };
  const r = express.Router();
  r.use(express.json({ limit: '4kb' }));
  r.use(cookieParser());
  r.use((_req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    next();
  });

  const err = (res: Response, e: AuthError) => res.status(STATUS[e]).json({ error: e });
  const parse = <S extends z.ZodTypeAny>(s: S, req: Request, res: Response): z.output<S> | null => {
    const p = s.safeParse(req.body);
    if (!p.success) err(res, 'invalid');
    return p.success ? p.data : null;
  };
  const ip = (req: Request) => req.ip ?? 'unknown';
  const token = (req: Request): string | undefined => {
    const t = req.cookies?.[SESSION_COOKIE];
    return typeof t === 'string' ? t : undefined;
  };
  /** 로그인한 사람만 (res.locals.userId) */
  const authed = (req: Request, res: Response, next: NextFunction) => {
    const id = accounts.sessions.user(token(req), now());
    if (id === null) return void err(res, 'unauthorized');
    res.locals.userId = id;
    next();
  };
  // 비동기 핸들러 오류를 express 오류 처리로 넘김
  const wrap = (fn: (req: Request, res: Response) => Promise<unknown> | unknown) =>
    (req: Request, res: Response, next: NextFunction) => void Promise.resolve(fn(req, res)).catch(next);

  r.post('/signup', wrap(async (req, res) => {
    const body = parse(signupReq, req, res);
    if (!body) return;
    const out = await accounts.signup(body, ip(req), now());
    if (!out.ok) return err(res, out.error);
    res.cookie(SESSION_COOKIE, out.value.token, cookie).json({ me: accounts.me(out.value.userId), recoveryCode: out.value.recoveryCode });
  }));

  r.post('/login', wrap(async (req, res) => {
    const body = parse(loginReq, req, res);
    if (!body) return;
    const out = await accounts.login(body, ip(req), now());
    if (!out.ok) return err(res, out.error);
    res.cookie(SESSION_COOKIE, out.value.token, cookie).json({ me: accounts.me(out.value.userId) });
  }));

  r.post('/logout', (req, res) => {
    const t = token(req);
    if (t) accounts.logout(t, ip(req), now());
    res.clearCookie(SESSION_COOKIE, { ...cookie, maxAge: undefined }).json({ ok: true });
  });

  r.post('/recover', wrap(async (req, res) => {
    const body = parse(recoverReq, req, res);
    if (!body) return;
    const out = await accounts.recover(body, ip(req), now());
    if (!out.ok) return err(res, out.error);
    res.cookie(SESSION_COOKIE, out.value.token, cookie).json({ me: accounts.me(out.value.userId), recoveryCode: out.value.recoveryCode });
  }));

  r.post('/password', authed, wrap(async (req, res) => {
    const body = parse(passwordReq, req, res);
    if (!body) return;
    const out = await accounts.changePassword(res.locals.userId as number, body, ip(req), now());
    if (!out.ok) return err(res, out.error);
    res.cookie(SESSION_COOKIE, out.value.token, cookie).json({ ok: true });
  }));

  r.get('/me', authed, (_req, res) => {
    const me = accounts.me(res.locals.userId as number);
    if (!me) return void err(res, 'unauthorized');
    res.json({ me });
  });

  const me = (res: Response) => res.json({ me: accounts.me(res.locals.userId as number) });

  r.get('/islands', authed, (_req, res) => {
    res.json({ islands: accounts.islands.list() });
  });

  r.post('/island/create', authed, (_req, res) => {
    const out = accounts.islands.create(res.locals.userId as number, now());
    if (!out.ok) return void err(res, out.error);
    me(res);
  });

  r.post('/island/request', authed, (req, res) => {
    const body = parse(joinReq, req, res);
    if (!body) return;
    const out = accounts.islands.request(res.locals.userId as number, body.islandId, now());
    if (!out.ok) return void err(res, out.error);
    me(res);
  });

  r.post('/island/request/cancel', authed, (_req, res) => {
    accounts.islands.cancel(res.locals.userId as number);
    me(res);
  });

  r.get('/island/requests', authed, (_req, res) => {
    const out = accounts.islands.pending(res.locals.userId as number);
    if (!out.ok) return void err(res, out.error);
    res.json({ requests: out.value });
  });

  r.post('/island/decide', authed, (req, res) => {
    const body = parse(decideReq, req, res);
    if (!body) return;
    const out = accounts.islands.decide(res.locals.userId as number, body.userId, body.accept, now());
    if (!out.ok) return void err(res, out.error);
    res.json({ ok: true });
  });

  // 잘못된 JSON 등 → 400, 그 밖의 오류는 내용을 숨기고 500 (로그에 비밀 값 없음)
  r.use((e: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = (e as { status?: number }).status;
    if (status && status >= 400 && status < 500) return void err(res, 'invalid');
    console.error('[http] 오류', e instanceof Error ? e.message : e);
    res.status(500).json({ error: 'server' });
  });
  return r;
}
