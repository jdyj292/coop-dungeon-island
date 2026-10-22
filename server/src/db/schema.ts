// DB 테이블 (docs/db.md MVP 표). 시각은 모두 ms (Date.now()), 돈은 정수 코인
// 마이그레이션: 이 파일을 고친 뒤 `pnpm --filter @game/server db:generate` → src/db/migrations/ 에 SQL 생성 (손으로 고치지 않음)
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const islands = sqliteTable('islands', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  /** 초대 코드 (새로 발급하면 이전 코드는 즉시 무효, island.md 7장) */
  inviteCode: text('invite_code').notNull(),
  treasury: integer('treasury').notNull().default(0),
}, (t) => [uniqueIndex('islands_invite_code').on(t.inviteCode)]);

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** 표시 이름 그대로. 중복 검사는 nicknameKey (NFC + 소문자) */
  nickname: text('nickname').notNull(),
  nicknameKey: text('nickname_key').notNull(),
  passwordHash: text('password_hash').notNull(),
  recoveryHash: text('recovery_hash').notNull(),
  failedLogins: integer('failed_logins').notNull().default(0),
  lockedUntil: integer('locked_until').notNull().default(0),
  islandId: integer('island_id').references(() => islands.id),
  wallet: integer('wallet').notNull().default(0),
  hairStyle: integer('hair_style').notNull().default(0),
  hairColor: integer('hair_color').notNull().default(0),
  createdAt: integer('created_at').notNull(),
}, (t) => [uniqueIndex('users_nickname_key').on(t.nicknameKey), index('users_island').on(t.islandId)]);

export const sessions = sqliteTable('sessions', {
  /** 토큰의 SHA-256 (hex). 토큰 자체는 저장하지 않음 (security.md 2장) */
  tokenHash: text('token_hash').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  createdAt: integer('created_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
  lastSeenAt: integer('last_seen_at').notNull(),
}, (t) => [index('sessions_user').on(t.userId)]);

/** 인증 기록 (30일 보관). 비밀번호·토큰·복구 코드는 넣지 않는다 */
export const authLog = sqliteTable('auth_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id'),
  ip: text('ip').notNull(),
  event: text('event').notNull(),
  createdAt: integer('created_at').notNull(),
}, (t) => [index('auth_log_created').on(t.createdAt)]);

export const placements = sqliteTable('placements', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  islandId: integer('island_id').notNull().references(() => islands.id),
  itemId: text('item_id').notNull(),
  /** 격자 칸 (island.md 2장) */
  x: integer('x').notNull(),
  y: integer('y').notNull(),
  rotation: integer('rotation').notNull().default(0),
  placedBy: integer('placed_by').references(() => users.id),
  /** 공동 금고로 산 공용 장식 (치우면 공용 창고로, island.md 3장) */
  communal: integer('communal', { mode: 'boolean' }).notNull().default(false),
  placedAt: integer('placed_at').notNull(),
}, (t) => [index('placements_island').on(t.islandId)]);

/** 장식·재료·물약·의상 보유 수 */
export const inventory = sqliteTable('inventory', {
  userId: integer('user_id').notNull().references(() => users.id),
  itemId: text('item_id').notNull(),
  count: integer('count').notNull().default(0),
}, (t) => [primaryKey({ columns: [t.userId, t.itemId] })]);

/** 공용 창고: 섬 단위 보관 (공동 금고로 산 장식, 치운 공용 장식) */
export const islandStorage = sqliteTable('island_storage', {
  islandId: integer('island_id').notNull().references(() => islands.id),
  itemId: text('item_id').notNull(),
  count: integer('count').notNull().default(0),
}, (t) => [primaryKey({ columns: [t.islandId, t.itemId] })]);

export const activityLog = sqliteTable('activity_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  islandId: integer('island_id').notNull().references(() => islands.id),
  userId: integer('user_id').references(() => users.id),
  action: text('action').notNull(),
  itemId: text('item_id'),
  createdAt: integer('created_at').notNull(),
}, (t) => [index('activity_island_created').on(t.islandId, t.createdAt)]);

export const weaponMastery = sqliteTable('weapon_mastery', {
  userId: integer('user_id').notNull().references(() => users.id),
  weapon: text('weapon').notNull(),
  level: integer('level').notNull().default(1),
  exp: integer('exp').notNull().default(0),
  sp: integer('sp').notNull().default(0),
}, (t) => [primaryKey({ columns: [t.userId, t.weapon] })]);
