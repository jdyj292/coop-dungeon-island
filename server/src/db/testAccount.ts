// 개발용 테스트 계정 (docs/playtest.md): 섬에 들어올 때마다 모든 MVP 무기 숙련도를 최대 레벨로, 지갑을 정한 값으로 채운다
// 설정은 CONFIG.testAccount (production이면 null → 아무것도 안 함). 닉네임은 대소문자를 가리지 않고 정확히 같을 때만
import { MAX_LEVEL, MVP_WEAPONS, nicknameKey } from '@game/shared';
import { eq } from 'drizzle-orm';
import type { Db } from './client';
import { users, weaponMastery } from './schema';

export interface TestAccount {
  nickname: string;
  wallet: number;
}

/** 테스트 계정이면 채우고 true */
export function keepTestAccount(db: Db, userId: number, nickname: string, cfg: TestAccount | null): boolean {
  if (!cfg || nicknameKey(nickname) !== nicknameKey(cfg.nickname)) return false;
  db.transaction((tx) => {
    tx.update(users).set({ wallet: cfg.wallet }).where(eq(users.id, userId)).run();
    for (const weapon of MVP_WEAPONS) {
      tx.insert(weaponMastery).values({ userId, weapon, level: MAX_LEVEL, exp: 0 })
        .onConflictDoUpdate({ target: [weaponMastery.userId, weaponMastery.weapon], set: { level: MAX_LEVEL, exp: 0 } }).run();
    }
  });
  return true;
}
