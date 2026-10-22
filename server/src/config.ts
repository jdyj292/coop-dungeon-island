// 서버 설정 (환경 변수, docs/deploy.md). 비밀 값은 환경 변수로만 (security.md 6장). 예시는 저장소 루트 .env.example
import { DEFAULT_DB_PATH } from './db/client';

const env = process.env;

export const CONFIG = {
  /** production이면 개발 명령(dev·give·giveCoins)을 받지 않음 */
  production: env.NODE_ENV === 'production',
  /** 게임 서버 포트 (배포는 127.0.0.1에만 열고 Nginx가 넘김) */
  port: Number(env.SERVER_PORT ?? 2567),
  /** 듣는 주소 (배포 기본 127.0.0.1: 바깥에서 바로 못 들어오게) */
  host: env.SERVER_HOST ?? (env.NODE_ENV === 'production' ? '127.0.0.1' : '0.0.0.0'),
  dbPath: env.DB_PATH ?? DEFAULT_DB_PATH,
  /** 빌드한 클라이언트 폴더 (있으면 게임 서버가 정적 파일도 줌) */
  staticDir: env.STATIC_DIR ?? '',
  /** 우리 사이트 주소 (예: https://game.example.com). 설정하면 WebSocket·/api의 Origin을 이것만 받음 (security.md 5장) */
  publicOrigin: env.PUBLIC_ORIGIN ?? '',
  /** 세션 쿠키 Secure (기본 켬, http로 로컬 시험할 때만 0) */
  secureCookie: env.COOKIE_SECURE !== '0',
} as const;
