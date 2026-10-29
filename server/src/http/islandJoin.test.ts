// 섬 고르기·입장 신청 (island.md 7장): 새 섬, 목록, 신청·취소·거절·허용, 주인만, 주민 10명까지
import { AUTH, ISLAND, signupReq } from '@game/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from '../db/client';
import { activityLog, placements } from '../db/schema';
import { islandBus } from '../systems/islandBus';
import { Accounts } from './accounts';

let db: Db, acc: Accounts, ipN = 0;
const now = 1_000_000;
const ip = () => `10.2.0.${ipN++}`;
async function user(nickname: string): Promise<number> {
  const r = await acc.signup(signupReq.parse({ nickname, password: 'password1' }), ip(), now);
  if (!r.ok) throw new Error(r.error);
  return r.value.userId;
}
/** 새 섬 주인 → [주인 id, 섬 id] */
async function owner(nickname: string): Promise<[number, number]> {
  const id = await user(nickname);
  const r = acc.islands.create(id, now);
  if (!r.ok) throw new Error(r.error);
  return [id, r.value];
}

beforeEach(() => {
  db = openDb(':memory:').db;
  acc = new Accounts(db);
});

describe('섬 고르기', () => {
  it('새 섬: "닉네임의 섬", 기본 장식, 주인, 한 번만', async () => {
    const [a, isl] = await owner('모리');
    expect(acc.me(a)!.island).toEqual({ id: isl, name: '모리의 섬', treasury: 0, ownerId: a });
    const decor = db.select().from(placements).all();
    expect(decor.map((p) => [p.itemId, p.x, p.y, p.rotation])).toEqual(ISLAND.starterDecor.map((d) => [d.itemId, d.x, d.y, d.rot]));
    expect(decor.every((p) => p.communal && p.placedBy === null)).toBe(true);
    expect(acc.islands.create(a, now)).toEqual({ ok: false, error: 'hasIsland' });
  });

  it('목록: 이름·주인·주민 수', async () => {
    await owner('모리');
    await owner('카이');
    await user('누리');
    expect(acc.islands.list().map((i) => [i.name, i.owner, i.residents])).toEqual([['모리의 섬', '모리', 1], ['카이의 섬', '카이', 1]]);
  });

  it('신청 → 주인에게 알림·목록, 허용하면 주민 (활동 기록), 신청 지워짐', async () => {
    const [a, isl] = await owner('모리');
    const b = await user('카이');
    const heard: string[] = [];
    const off = islandBus.watchRequests(isl, (n) => heard.push(n));
    expect(acc.islands.request(b, isl, now)).toEqual({ ok: true, value: true });
    off();
    expect(heard).toEqual(['카이']);
    expect(acc.me(b)!.request).toEqual({ islandId: isl, islandName: '모리의 섬', rejected: false });
    const p = acc.islands.pending(a);
    expect(p.ok && p.value.map((r) => r.nickname)).toEqual(['카이']);
    expect(acc.islands.decide(a, b, true, now)).toEqual({ ok: true, value: true });
    expect(acc.me(b)!.island).toMatchObject({ id: isl, ownerId: a });
    expect(acc.me(b)!.request).toBeNull();
    expect(db.select().from(activityLog).all().map((x) => x.action)).toEqual(['found', 'join']);
    // 이미 주민이면 다시 신청·허용 불가
    expect(acc.islands.request(b, isl, now)).toEqual({ ok: false, error: 'hasIsland' });
    expect(acc.islands.decide(a, b, true, now)).toEqual({ ok: false, error: 'noRequest' });
  });

  it('주인만 허용·거절, 다른 섬 신청은 못 건드림', async () => {
    const [a, isl] = await owner('모리');
    const [c] = await owner('누리');
    const b = await user('카이');
    acc.islands.request(b, isl, now);
    expect(acc.islands.decide(c, b, true, now)).toEqual({ ok: false, error: 'noRequest' });
    expect(acc.islands.decide(b, b, true, now)).toEqual({ ok: false, error: 'notOwner' });
    expect(acc.islands.pending(b)).toEqual({ ok: false, error: 'notOwner' });
    // 주인 아닌 주민
    const d = await user('하루');
    acc.islands.request(d, isl, now);
    acc.islands.decide(a, d, true, now);
    expect(acc.islands.decide(d, b, true, now)).toEqual({ ok: false, error: 'notOwner' });
  });

  it('거절: 신청자에게 rejected로 보이고 주인 목록에서 빠짐. 다시 신청하면 새로', async () => {
    const [a, isl] = await owner('모리');
    const b = await user('카이');
    acc.islands.request(b, isl, now);
    acc.islands.decide(a, b, false, now);
    expect(acc.me(b)!.request?.rejected).toBe(true);
    expect(acc.islands.pending(a)).toEqual({ ok: true, value: [] });
    acc.islands.request(b, isl, now);
    expect(acc.me(b)!.request?.rejected).toBe(false);
    acc.islands.cancel(b);
    expect(acc.me(b)!.request).toBeNull();
    expect(acc.islands.decide(a, b, true, now)).toEqual({ ok: false, error: 'noRequest' });
  });

  it('신청은 하나만 (다른 섬에 신청하면 바뀜), 새 섬을 만들면 신청은 지워짐', async () => {
    const [a, isl1] = await owner('모리');
    const [, isl2] = await owner('누리');
    const b = await user('카이');
    acc.islands.request(b, isl1, now);
    acc.islands.request(b, isl2, now);
    expect(acc.me(b)!.request?.islandId).toBe(isl2);
    expect(acc.islands.pending(a)).toEqual({ ok: true, value: [] });
    acc.islands.create(b, now);
    expect(acc.me(b)!.request).toBeNull();
  });

  it(`주민 ${AUTH.islandResidents}명까지: 꽉 차면 신청·허용 거절, 없는 섬은 invalid`, async () => {
    const [a, isl] = await owner('모리');
    const waiting = await user('대기');
    acc.islands.request(waiting, isl, now);
    for (let i = 1; i < AUTH.islandResidents; i++) {
      const u = await user(`주민${i}`);
      acc.islands.request(u, isl, now);
      expect(acc.islands.decide(a, u, true, now).ok).toBe(true);
    }
    expect(acc.islands.list()[0]!.residents).toBe(AUTH.islandResidents);
    expect(acc.islands.decide(a, waiting, true, now)).toEqual({ ok: false, error: 'islandFull' });
    expect(acc.islands.request(await user('늦음'), isl, now)).toEqual({ ok: false, error: 'islandFull' });
    expect(acc.islands.request(waiting, 999, now)).toEqual({ ok: false, error: 'invalid' });
  });

  it('신청은 계정당 분당 5회', async () => {
    const [, isl] = await owner('모리');
    const b = await user('카이');
    for (let i = 0; i < 5; i++) expect(acc.islands.request(b, isl, now).ok).toBe(true);
    expect(acc.islands.request(b, isl, now)).toEqual({ ok: false, error: 'rateLimited' });
  });
});
