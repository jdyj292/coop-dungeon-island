// HTTP 앱: 인증 API를 /api 아래에 (Colyseus와 같은 http 서버, index.ts)
import express from 'express';
import type { Db } from '../db/client';
import { Accounts } from './accounts';
import { authRouter, type HttpOptions } from './routes';

const HOUR = 3_600_000;

export function createHttpApp(db: Db, opts: HttpOptions & { staticDir?: string } = {}): { app: express.Express; accounts: Accounts; stop: () => void } {
  const accounts = new Accounts(db);
  const app = express();
  app.disable('x-powered-by');
  // Nginx 뒤에서 실제 IP (M5). 개발은 바로 접속
  app.set('trust proxy', 'loopback');
  app.use('/api', authRouter(accounts, opts));
  // 빌드한 클라이언트 (배포). 이름에 해시가 붙은 assets는 오래 캐시, index.html은 매번 확인
  if (opts.staticDir) {
    app.use(express.static(opts.staticDir, {
      setHeaders: (res, path) => res.setHeader('Cache-Control', /[\\/]assets[\\/]/.test(path) ? 'public, max-age=31536000, immutable' : 'no-cache'),
    }));
  }
  // 만료 세션·30일 지난 인증 기록·시도 기록 정리: 시작할 때 + 한 시간마다
  const sweep = () => accounts.sweep(Date.now());
  sweep();
  const timer = setInterval(sweep, HOUR);
  timer.unref();
  return { app, accounts, stop: () => clearInterval(timer) };
}
