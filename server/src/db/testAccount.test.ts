// 개발용 테스트 계정 (docs/playtest.md): 최대 레벨·지갑 채우기, production(설정 없음)·다른 닉네임은 그대로
import { MAX_LEVEL } from '@game/shared';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from './client';
import { users, weaponMastery } from './schema';
import { keepTestAccount } from './testAccount';

let db: Db;
const cfg = { nickname: 'ADMIN', wallet: 99999 };
const user = (nickname: string) => db.insert(users).values({
  nickname, nicknameKey: nickname.toLowerCase(), passwordHash: 'h', recoveryHash: 'r', wallet: 10, createdAt: 0,
}).returning({ id: users.id }).get().id;
const wallet = (id: number) => db.select({ w: users.wallet }).from(users).where(eq(users.id, id)).get()?.w;
const levels = (id: number) => db.select({ weapon: weaponMastery.weapon, level: weaponMastery.level }).from(weaponMastery).where(eq(weaponMastery.userId, id)).all();

beforeEach(() => {
  db = openDb(':memory:').db;
});

describe('테스트 계정', () => {
  it('모든 MVP 무기 최대 레벨, 지갑을 채운다 (써도 다음 입장에 다시)', () => {
    const id = user('Admin');
    db.insert(weaponMastery).values({ userId: id, weapon: 'staff', level: 3, exp: 40 }).run();
    expect(keepTestAccount(db, id, 'Admin', cfg)).toBe(true);
    expect(wallet(id)).toBe(99999);
    expect(levels(id)).toEqual(expect.arrayContaining([{ weapon: 'greatsword', level: MAX_LEVEL }, { weapon: 'staff', level: MAX_LEVEL }]));
    db.update(users).set({ wallet: 5 }).where(eq(users.id, id)).run();
    keepTestAccount(db, id, 'Admin', cfg);
    expect(wallet(id)).toBe(99999);
  });

  it('production(설정 없음)이거나 닉네임이 다르면 그대로', () => {
    const a = user('ADMIN'), b = user('ADMIN1');
    expect(keepTestAccount(db, a, 'ADMIN', null)).toBe(false);
    expect(keepTestAccount(db, b, 'ADMIN1', cfg)).toBe(false);
    expect([wallet(a), wallet(b)]).toEqual([10, 10]);
    expect(levels(a)).toEqual([]);
  });
});
