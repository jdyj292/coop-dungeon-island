// 통신 보안 (docs/security.md 5장): Origin 제한(/api·WebSocket·매치메이킹 CORS), 보안 헤더
// publicOrigin(PUBLIC_ORIGIN)이 비어 있으면 개발: 제한 없음 (Vite 5173 → 게임 서버 2567처럼 다른 출처에서 접속)
import type { IncomingMessage } from 'node:http';
import type { NextFunction, Request, Response } from 'express';

/**
 * 받아도 되는 Origin인가. 브라우저가 아닌 클라이언트(봇·curl)는 Origin을 안 보내므로 없으면 통과
 * (교차 사이트 요청 위조는 브라우저 요청이라 Origin이 붙는다. 세션 쿠키도 SameSite=Lax)
 */
export function originAllowed(origin: string | undefined, publicOrigin: string): boolean {
  return !publicOrigin || !origin || origin === publicOrigin;
}

/** /api 상태를 바꾸는 요청(POST 등)은 우리 Origin만 */
export function apiOriginGuard(publicOrigin: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.method !== 'GET' && req.method !== 'HEAD' && !originAllowed(req.headers.origin, publicOrigin)) {
      res.status(403).json({ error: 'origin' });
      return;
    }
    next();
  };
}

/** WebSocket 연결 (Colyseus WebSocketTransport verifyClient) */
export function wsOriginOk(req: IncomingMessage, publicOrigin: string): boolean {
  return originAllowed(req.headers.origin, publicOrigin);
}

/** 매치메이킹 응답의 CORS: 배포는 우리 Origin만, 개발은 요청한 Origin (Colyseus 기본과 같음) */
export function corsHeadersFor(req: IncomingMessage, publicOrigin: string): Record<string, string> {
  const origin = req.headers.origin;
  return { 'Access-Control-Allow-Origin': publicOrigin || origin || '*', Vary: 'Origin' };
}

/**
 * 보안 헤더 (모든 응답). CSP: 스크립트·연결·글꼴은 우리 출처만. style은 DOM 폼·index.html의 <style> 때문에 'unsafe-inline',
 * img는 Phaser 기본 텍스처(data:)·캔버스 텍스처(blob:). HSTS는 TLS를 끝내는 Nginx가 붙인다 (docs/deploy.md)
 */
export function securityHeaders(publicOrigin: string) {
  const ws = publicOrigin ? ` ${publicOrigin.replace(/^http/, 'ws')}` : '';
  const csp = [
    "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:",
    "font-src 'self'", `connect-src 'self'${ws}`, "object-src 'none'", "base-uri 'self'", "frame-ancestors 'none'", "form-action 'self'",
  ].join('; ');
  return (_req: Request, res: Response, next: NextFunction): void => {
    res.set({
      'Content-Security-Policy': csp, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin',
      'X-Frame-Options': 'DENY', 'Cross-Origin-Opener-Policy': 'same-origin',
    });
    next();
  };
}
