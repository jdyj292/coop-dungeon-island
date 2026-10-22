// 던전 정산 저장: 지갑·금고·재료·쓴 물약·숙련도·기록 (한 트랜잭션), 가져갈 물약 한도
import { PLAYER } from '@game/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from './client';
import { IslandStore } from './islandStore';
import { carryPotions, mastery, saveRun, type ResultLine } from './runStore';
import { activityLog, islands, users } from './schema';
import { ShopStore } from './shopStore';

let db: Db, islandId: number, uid: number;
const line = (o: Partial<ResultLine>): ResultLine => ({
  pid: 'p', name: 'a', coins: 100, bonusPct: 0, bonusCoins: 0, lost: 0, wallet: 70, treasury: 30, materials: 2, exp: 50,
  levelBefore: 1, levelAfter: 2, levelExp: 10, ...o,
});

beforeEach(() => {
  db = openDb(':memory:').db;
  islandId = db.insert(islands).values({ name: '섬', inviteCode: 'ABCDEFGH', treasury: 5 }).returning({ id: islands.id }).get().id;
  uid = db.insert(users).values({ nickname: 'a', nicknameKey: 'a', passwordHash: 'h', recoveryHash: 'r', islandId, wallet: 10, createdAt: 0 }).returning({ id: users.id }).get().id;
});

describe('던전 정산 저장', () => {
  it('지갑·금고·재료·쓴 물약·숙련도·기록', () => {
    const inv = new IslandStore(db, islandId);
    inv.give(uid, 'hpPotion', 7);
    inv.give(uid, 'mpPotion', 1);
    expect(carryPotions(db, uid)).toEqual({ hp: PLAYER.potions.hp.carry, mp: 1 });
    saveRun(db, islandId, uid, 'clear', line({}), { hp: 3, mp: 1 }, 1, 123);
    const shop = new ShopStore(db, islandId);
    expect([shop.wallet(uid), shop.treasury()]).toEqual([80, 35]);
    expect(inv.inventory(uid)).toEqual({ hpPotion: 4, mushroom: 2 });
    expect(mastery(db, uid)).toEqual({ level: 2, exp: 10 });
    expect(db.select().from(activityLog).all().map((r) => r.action)).toEqual(['dungeon:clear']);
    // 두 번째 판: 숙련도 덮어쓰기
    saveRun(db, islandId, uid, 'wipe', line({ wallet: 0, treasury: 0, materials: 0, levelAfter: 2, levelExp: 60 }), { hp: 0, mp: 0 }, 1, 124);
    expect(mastery(db, uid)).toEqual({ level: 2, exp: 60 });
  });

  it('숙련도 기록이 없으면 Lv1', () => {
    expect(mastery(db, uid)).toEqual({ level: 1, exp: 0 });
    expect(carryPotions(db, uid)).toEqual({ hp: 0, mp: 0 });
  });
});
