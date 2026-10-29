// 관리자 명령: 정지(로그인·세션 막힘)·해제, 세션 강제 종료, 목록, 백업 → 복원
import { copyFileSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { signupReq } from '@game/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from '../db/client';
import { users } from '../db/schema';
import { Accounts } from '../http/accounts';
import { backup, backupName, kick, listUsers, suspend, unsuspend } from './commands';

let dir: string, db: Db, sqlite: ReturnType<typeof openDb>['sqlite'], close: () => void, acc: Accounts, ipN = 0;
const now = 1_800_000_000_000;
const ip = () => `10.1.0.${ipN++}`;
const login = () => acc.login({ nickname: '모리', password: 'password1' }, ip(), now);

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'cdi-admin-'));
  ({ db, sqlite, close } = openDb(join(dir, 'game.sqlite')));
  acc = new Accounts(db);
  const s = await acc.signup(signupReq.parse({ nickname: '모리', password: 'password1' }), ip(), now);
  if (s.ok) acc.islands.create(s.value.userId, now);
});
afterEach(() => {
  close();
  rmSync(dir, { recursive: true, force: true });
});

describe('관리자 명령', () => {
  it('정지: 세션이 끊기고 로그인하면 suspended, 기간이 지나면 풀림. 해제하면 바로', async () => {
    const r = await login();
    if (!r.ok) throw new Error();
    suspend(db, '모리', 3, now);
    expect(acc.sessions.user(r.value.token, now)).toBeNull();
    expect(await login()).toEqual({ ok: false, error: 'suspended' });
    expect((await acc.login({ nickname: '모리', password: 'password1' }, ip(), now + 3 * 86_400_000 + 1)).ok).toBe(true);
    suspend(db, '모리', null, now);
    expect(await login()).toEqual({ ok: false, error: 'suspended' });
    unsuspend(db, '모리', now);
    expect((await login()).ok).toBe(true);
  });

  it('틀린 비밀번호면 정지 여부를 알리지 않음 (badLogin)', async () => {
    suspend(db, '모리', null, now);
    expect(await acc.login({ nickname: '모리', password: 'wrong-pass' }, ip(), now)).toEqual({ ok: false, error: 'badLogin' });
  });

  it('세션 강제 종료·목록, 없는 닉네임은 오류', async () => {
    const r = await login();
    if (!r.ok) throw new Error();
    expect(kick(db, '모리', now)).toBe(2);
    expect(acc.sessions.user(r.value.token, now)).toBeNull();
    expect(listUsers(db).map((u) => [u.nickname, u.island])).toEqual([['모리', '모리의 섬']]);
    expect(() => kick(db, '없음', now)).toThrow(/없는 닉네임/);
  });

  it('백업: 서버가 돌고 있어도 되고, 권한 600, keep개만 남김. 복원하면 그 시점 데이터', async () => {
    const bdir = join(dir, 'backups');
    for (let i = 0; i < 3; i++) await backup(sqlite, bdir, 2, now + i * 86_400_000);
    const files = readdirSync(bdir).sort();
    expect(files).toEqual([backupName(now + 86_400_000), backupName(now + 2 * 86_400_000)]);
    if (process.platform !== 'win32') expect(statSync(join(bdir, files[0]!)).mode & 0o777).toBe(0o600);
    // 백업 뒤 바뀐 데이터는 복원하면 사라짐
    db.update(users).set({ wallet: 999 }).run();
    const restored = join(dir, 'restored.sqlite');
    copyFileSync(join(bdir, files[1]!), restored);
    const r = openDb(restored);
    expect(r.db.select().from(users).all().map((u) => [u.nickname, u.wallet])).toEqual([['모리', 0]]);
    r.close();
  });
});
