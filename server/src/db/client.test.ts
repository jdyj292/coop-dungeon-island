import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { openDb } from './client';
import { inventory, islands, users } from './schema';

const newUser = (nickname: string, islandId: number | null = null) => ({
  nickname, nicknameKey: nickname.toLowerCase(), passwordHash: 'h', recoveryHash: 'r', islandId, createdAt: 1,
});

describe('DB 마이그레이션', () => {
  it('빈 DB에 db.md MVP 테이블 8개를 만든다', () => {
    const { db, close } = openDb(':memory:');
    // __drizzle_migrations(적용 기록)·sqlite_sequence는 빼고
    const names = db.all<{ name: string }>(sql`select name from sqlite_master where type = 'table'`)
      .map((r) => r.name).filter((n) => !n.startsWith('__') && !n.startsWith('sqlite')).sort();
    expect(names).toEqual(['activity_log', 'auth_log', 'inventory', 'islands', 'placements', 'sessions', 'users', 'weapon_mastery']);
    close();
  });

  it('파일 DB는 WAL, 다시 열면 마이그레이션을 건너뛰고 데이터 유지', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cdi-db-'));
    const path = join(dir, 'game.sqlite');
    try {
      const a = openDb(path);
      expect(a.db.get<{ journal_mode: string }>(sql`pragma journal_mode`)?.journal_mode).toBe('wal');
      a.db.insert(users).values(newUser('Mori')).run();
      a.close();
      const b = openDb(path);
      expect(b.db.select().from(users).all()).toHaveLength(1);
      b.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('닉네임 중복·외래 키·인벤토리 키를 막는다', () => {
    const { db, close } = openDb(':memory:');
    const isl = db.insert(islands).values({ name: '섬', inviteCode: 'ABCD-1234' }).returning().get();
    const u = db.insert(users).values(newUser('Mori', isl.id)).returning().get();
    expect(() => db.insert(users).values(newUser('MORI')).run()).toThrow(/UNIQUE/);
    expect(() => db.insert(users).values(newUser('Kai', 999)).run()).toThrow(/FOREIGN KEY/);
    db.insert(inventory).values({ userId: u.id, itemId: 'bench', count: 1 }).run();
    expect(() => db.insert(inventory).values({ userId: u.id, itemId: 'bench', count: 2 }).run()).toThrow(/UNIQUE|PRIMARY/);
    // 돈 변경은 트랜잭션: 중간에 실패하면 둘 다 되돌림
    expect(() => db.transaction((tx) => {
      tx.update(users).set({ wallet: 100 }).where(eq(users.id, u.id)).run();
      throw new Error('중간 실패');
    })).toThrow();
    expect(db.select().from(users).where(eq(users.id, u.id)).get()?.wallet).toBe(0);
    close();
  });
});
