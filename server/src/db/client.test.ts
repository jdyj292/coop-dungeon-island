import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { openDb } from './client';
import { inventory, islands, users } from './schema';

const newUser = (nickname: string, islandId: number | null = null) => ({
  nickname, nicknameKey: nickname.toLowerCase(), passwordHash: 'h', recoveryHash: 'r', islandId, createdAt: 1,
});

describe('DB 마이그레이션', () => {
  it('빈 DB에 db.md MVP 테이블 13개를 만든다', () => {
    const { db, close } = openDb(':memory:');
    // __drizzle_migrations(적용 기록)·sqlite_sequence는 빼고
    const names = db.all<{ name: string }>(sql`select name from sqlite_master where type = 'table'`)
      .map((r) => r.name).filter((n) => !n.startsWith('__') && !n.startsWith('sqlite')).sort();
    expect(names).toEqual(['activity_log', 'auth_log', 'inventory', 'island_facilities', 'island_storage', 'islands', 'join_requests', 'memos', 'placements', 'sessions', 'skill_nodes', 'users', 'weapon_mastery']);
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
    const isl = db.insert(islands).values({ name: '섬' }).returning().get();
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

it('0006: 이미 있는 섬의 주인 = 가장 먼저 가입한 주민 (초대 코드 시절 데이터)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cdi-mig-'));
  try {
    // 0004까지만 적용한 옛 DB
    const all = join(dirname(fileURLToPath(import.meta.url)), 'migrations');
    cpSync(all, dir, { recursive: true });
    const journal = JSON.parse(readFileSync(join(all, 'meta/_journal.json'), 'utf8')) as { entries: { idx: number }[] };
    writeFileSync(join(dir, 'meta/_journal.json'), JSON.stringify({ ...journal, entries: journal.entries.filter((e) => e.idx <= 4) }));
    const path = join(dir, 'game.sqlite'), sqlite = new Database(path);
    migrate(drizzle(sqlite), { migrationsFolder: dir });
    sqlite.exec(`insert into islands (id, name, invite_code) values (1, 'A', 'AAAAAAAA'), (2, 'B', 'BBBBBBBB');
      insert into users (id, nickname, nickname_key, password_hash, recovery_hash, island_id, created_at) values
      (1, 'a', 'a', 'h', 'r', 2, 0), (2, 'b', 'b', 'h', 'r', 1, 0), (3, 'c', 'c', 'h', 'r', 2, 0);`);
    sqlite.close();
    const { db, close } = openDb(path);
    expect(db.select({ id: islands.id, ownerId: islands.ownerId }).from(islands).all()).toEqual([{ id: 1, ownerId: 2 }, { id: 2, ownerId: 1 }]);
    close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
