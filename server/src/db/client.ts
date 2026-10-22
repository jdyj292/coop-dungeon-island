// DB 열기 (docs/db.md): SQLite WAL + 외래 키, 시작할 때 마이그레이션을 끝까지 적용
// 경로는 환경 변수 DB_PATH (기본 data/game.sqlite, .gitignore). 테스트는 ':memory:'
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema';

export type Db = BetterSQLite3Database<typeof schema>;

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), 'migrations');
export const DEFAULT_DB_PATH = 'data/game.sqlite';

export function openDb(path = process.env.DB_PATH ?? DEFAULT_DB_PATH): { db: Db; close: () => void } {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS });
  return { db, close: () => sqlite.close() };
}
