// 방(Colyseus)이 쓰는 서버 공용 객체: DB·계정. index.ts가 시작할 때 한 번 정한다 (테스트는 직접 넣음)
import type { Db } from './db/client';
import type { Accounts } from './http/accounts';

export interface Services {
  db: Db;
  accounts: Accounts;
}

let current: Services | null = null;

export function setServices(s: Services): void {
  current = s;
}

export function services(): Services {
  if (!current) throw new Error('services: 아직 정해지지 않음 (index.ts)');
  return current;
}

/** Cookie 헤더에서 값 하나 (WebSocket 입장 인증용, security.md 2장) */
export function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}
