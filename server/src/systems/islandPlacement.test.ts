// 장식 배치: 같은 칸은 먼저 온 요청만, 가방·공용 창고 개수, 치우면 놓은 사람에게, 다시 열어도 남음, 장애물
import { ISLAND, ITEMS, TILE } from '@game/shared';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from '../db/client';
import { IslandStore } from '../db/islandStore';
import { activityLog, islandStorage, islands, users } from '../db/schema';
import { IslandGame } from './islandGame';

const P = ISLAND.place;
const cell = { x: P.x + 2, y: P.y + 2 };
let db: Db, islandId: number, sent: [string, string, unknown][];

const user = (nickname: string) => db.insert(users).values({
  nickname, nicknameKey: nickname, passwordHash: 'h', recoveryHash: 'r', islandId, createdAt: 0,
}).returning({ id: users.id }).get().id;

const game = (dev = true) => {
  const store = new IslandStore(db, islandId);
  return { store, g: new IslandGame('섬', 0, [], { send: (id, type, msg) => sent.push([id, type, msg]), broadcast: () => {} }, { store, dev }) };
};
const lastInv = (id: string) => (sent.filter(([to, type]) => to === id && type === 'inv').at(-1)?.[2] as { items: Record<string, number> } | undefined)?.items;
const fails = (id: string) => sent.filter(([to, type]) => to === id && type === 'placeFail').map(([, , m]) => (m as { reason: string }).reason);

beforeEach(() => {
  db = openDb(':memory:').db;
  islandId = db.insert(islands).values({ name: '섬' }).returning({ id: islands.id }).get().id;
  sent = [];
});

describe('장식 배치', () => {
  it('같은 칸에 두 사람이 놓으면 먼저 온 요청만 성공, 가방에서 하나씩 빠짐', () => {
    const a = String(user('a')), b = String(user('b'));
    const { store, g } = game();
    store.give(Number(a), 'fence', 2);
    store.give(Number(b), 'fence', 1);
    for (const id of [a, b]) {
      g.addResident({ id, name: id, color: 0 });
      g.join(id);
    }
    g.onMessage(a, 'place', { itemId: 'fence', ...cell, rot: 0, from: 'mine' });
    g.onMessage(b, 'place', { itemId: 'fence', ...cell, rot: 0, from: 'mine' });
    expect(g.state.placements.size).toBe(1);
    expect([...g.state.placements.values()][0]!.placedBy).toBe(a);
    expect(lastInv(a)).toEqual({ fence: 1 });
    expect(fails(b)).toEqual(['overlap']);
    expect(store.inventory(Number(b))).toEqual({ fence: 1 });
  });

  it('가방에 없으면 실패, 다른 사람이 치워도 놓은 사람 가방으로, 활동 기록', () => {
    const a = String(user('a')), b = String(user('b'));
    const { store, g } = game();
    for (const id of [a, b]) { g.addResident({ id, name: id, color: 0 }); g.join(id); }
    g.onMessage(a, 'place', { itemId: 'lamp', ...cell, rot: 0, from: 'mine' });
    expect(fails(a)).toEqual(['none']);
    store.give(Number(a), 'lamp', 1);
    g.onMessage(a, 'place', { itemId: 'lamp', ...cell, rot: 0, from: 'mine' });
    const pid = [...g.state.placements.keys()][0]!;
    g.onMessage(b, 'remove', { placementId: pid });
    expect(g.state.placements.size).toBe(0);
    expect(store.inventory(Number(a))).toEqual({ lamp: 1 });
    expect(lastInv(a)).toEqual({ lamp: 1 });
    expect(db.select().from(activityLog).all().map((r) => r.action)).toEqual(['place', 'remove']);
  });

  it('옮기기·회전 (벤치 1×2), 자리가 막히면 실패. 다시 열어도 남음', () => {
    const a = String(user('a'));
    const { store, g } = game();
    store.give(Number(a), 'bench', 1);
    store.give(Number(a), 'fence', 1);
    g.addResident({ id: a, name: 'a', color: 0 });
    g.join(a);
    g.onMessage(a, 'place', { itemId: 'bench', ...cell, rot: 0, from: 'mine' });
    g.onMessage(a, 'place', { itemId: 'fence', x: cell.x + 3, y: cell.y + 1, rot: 0, from: 'mine' });
    const bench = [...g.state.placements.values()].find((p) => p.itemId === 'bench')!;
    g.onMessage(a, 'move', { placementId: bench.id, x: cell.x + 3, y: cell.y, rot: 1 });
    expect(fails(a)).toEqual(['overlap']);
    g.onMessage(a, 'move', { placementId: bench.id, x: cell.x + 5, y: cell.y, rot: 1 });
    expect([bench.x, bench.rot]).toEqual([cell.x + 5, 1]);
    const again = game().g;
    expect([...again.state.placements.values()].map((p) => [p.itemId, p.x, p.rot]).sort()).toEqual([['bench', cell.x + 5, 1], ['fence', cell.x + 3, 0]]);
  });

  it('공용 창고에서 꺼내 놓고, 치우면 창고로 (상태에 개수)', () => {
    const a = String(user('a'));
    db.insert(islandStorage).values({ islandId, itemId: 'fountain', count: 1 }).run();
    const { store, g } = game();
    g.addResident({ id: a, name: 'a', color: 0 });
    g.join(a);
    expect(g.state.storage.get('fountain')).toBe(1);
    g.onMessage(a, 'place', { itemId: 'fountain', ...cell, rot: 0, from: 'storage' });
    expect(g.state.storage.has('fountain')).toBe(false);
    const p = [...g.state.placements.values()][0]!;
    expect(p.communal).toBe(true);
    g.onMessage(a, 'remove', { placementId: p.id });
    expect(store.storage()).toEqual({ fountain: 1 });
    expect(store.inventory(Number(a))).toEqual({});
  });

  it('걸을 수 없는 장식은 서 있는 사람 칸에 못 놓고, 놓으면 길을 막는다', () => {
    const a = String(user('a'));
    const { store, g } = game();
    store.give(Number(a), 'fence', 3);
    g.addResident({ id: a, name: 'a', color: 0 });
    g.join(a);
    const w = g.walkerOf(a)!;
    w.pos = { x: (cell.x + 0.5) * TILE, y: (cell.y + 0.5) * TILE };
    g.onMessage(a, 'place', { itemId: 'fence', ...cell, rot: 0, from: 'mine' });
    expect(fails(a)).toEqual(['occupied']);
    g.onMessage(a, 'place', { itemId: 'fence', x: cell.x + 1, y: cell.y, rot: 0, from: 'mine' });
    g.onMessage(a, 'input', { seq: 1, t: 0, mx: 1, my: 0, run: false });
    for (let i = 0; i < 60; i++) g.tick();
    expect(w.pos.x).toBeLessThan((cell.x + 1) * TILE);
  });

  it('give는 개발 모드에서만, 가입 선물 목록은 장식', () => {
    const a = String(user('a'));
    const { store, g } = game(false);
    g.addResident({ id: a, name: 'a', color: 0 });
    g.join(a);
    g.onMessage(a, 'give', { itemId: 'tree', count: 3 });
    expect(store.inventory(Number(a))).toEqual({});
    expect(Object.keys(ITEMS.starter).every((id) => ITEMS.decorations[id])).toBe(true);
    expect(db.select().from(users).where(eq(users.id, Number(a))).get()).toBeDefined();
  });
});
