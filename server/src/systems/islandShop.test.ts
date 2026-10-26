// 잡화점 구매(지갑·금고), 게시판(기록·메모), 채팅, 개발 코인
import { ITEMS } from '@game/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from '../db/client';
import { IslandStore } from '../db/islandStore';
import { ShopStore } from '../db/shopStore';
import { islands, users } from '../db/schema';
import { IslandGame } from './islandGame';

let db: Db, islandId: number, sent: [string, string, unknown][], cast: [string, unknown][];

const user = (nickname: string, wallet = 0) => String(db.insert(users).values({
  nickname, nicknameKey: nickname, passwordHash: 'h', recoveryHash: 'r', islandId, wallet, createdAt: 0,
}).returning({ id: users.id }).get().id);

const game = (dev = true) => new IslandGame('섬', 0, [], {
  send: (id, type, msg) => sent.push([id, type, msg]), broadcast: (type, msg) => cast.push([type, msg]),
}, { store: new IslandStore(db, islandId), shopStore: new ShopStore(db, islandId), dev });
const last = <T>(id: string, type: string) => sent.filter(([to, t]) => to === id && t === type).at(-1)?.[2] as T | undefined;
const enter = (g: IslandGame, id: string) => { g.addResident({ id, name: id, color: 0 }); g.join(id); };

beforeEach(() => {
  db = openDb(':memory:').db;
  islandId = db.insert(islands).values({ name: '섬', inviteCode: 'ABCDEFGH', treasury: 2000 }).returning({ id: islands.id }).get().id;
  sent = [];
  cast = [];
});

describe('잡화점', () => {
  it('지갑으로 장식·물약 구매 → 지갑 차감, 가방 추가, 기록', () => {
    const a = user('a', 200), g = game();
    enter(g, a);
    expect(last<{ wallet: number }>(a, 'me')?.wallet).toBe(200);
    g.onMessage(a, 'buy', { itemId: 'hpPotion', count: 3 });
    g.onMessage(a, 'buy', { itemId: 'fence', count: 2 });
    expect(last<{ wallet: number }>(a, 'me')?.wallet).toBe(200 - ITEMS.consumables.hpPotion!.price * 3 - ITEMS.decorations.fence!.price * 2);
    expect(last<{ items: Record<string, number> }>(a, 'inv')?.items).toEqual({ hpPotion: 3, fence: 2 });
    expect(new ShopStore(db, islandId).board().log.map((r) => r.action)).toEqual(['buy', 'buy']);
  });

  it('잔액이 모자라면 거절 (지갑·가방 그대로)', () => {
    const a = user('a', 50), g = game();
    enter(g, a);
    g.onMessage(a, 'buy', { itemId: 'lamp', count: 1 });
    expect(last(a, 'buyResult')).toEqual({ ok: false, itemId: 'lamp', count: 1, reason: 'money' });
    expect(new ShopStore(db, islandId).wallet(Number(a))).toBe(50);
    g.onMessage(a, 'buy', { itemId: 'nope', count: 1 });
    expect(last<{ reason: string }>(a, 'buyResult')?.reason).toBe('unknown');
  });

  it('공용 장식은 공동 금고로 → 공용 창고 (상태의 금고·창고), 금고가 모자라면 거절', () => {
    const a = user('a'), g = game();
    enter(g, a);
    expect(g.state.treasury).toBe(2000);
    g.onMessage(a, 'buy', { itemId: 'fountain', count: 1 });
    expect(g.state.treasury).toBe(2000 - ITEMS.decorations.fountain!.price);
    expect(g.state.storage.get('fountain')).toBe(1);
    g.onMessage(a, 'buy', { itemId: 'fountain', count: 1 });
    expect(last<{ reason: string }>(a, 'buyResult')?.reason).toBe('treasury');
    expect(new ShopStore(db, islandId).board().log[0]!.action).toBe('treasury');
  });
});

describe('게시판·채팅', () => {
  it('메모: 제어 문자·줄바꿈 정리, 너무 길면 무시, 최신이 앞', () => {
    const a = user('모리'), g = game();
    enter(g, a);
    g.onMessage(a, 'memo', { text: '  안녕\n\t섬!  ' });
    g.onMessage(a, 'memo', { text: '가'.repeat(41) });
    g.onMessage(a, 'memo', { text: '두번째' });
    const b = last<{ memos: { who: string; text: string }[] }>(a, 'board')!;
    expect(b.memos.map((m) => [m.who, m.text])).toEqual([['모리', '두번째'], ['모리', '안녕 섬!']]);
  });

  it('채팅은 섬 모두에게, 3초에 3회까지', () => {
    const a = user('a'), g = game();
    enter(g, a);
    for (let i = 0; i < 5; i++) g.onMessage(a, 'chat', { text: `말 ${i}` });
    expect(cast.map(([, m]) => (m as { text: string }).text)).toEqual(['말 0', '말 1', '말 2']);
  });

  it('이모트는 섬 모두에게 (1~4만)', () => {
    const a = user('a'), g = game();
    enter(g, a);
    g.onMessage(a, 'emote', { id: 1 });
    g.onMessage(a, 'emote', { id: 9 });
    expect(cast.filter(([t]) => t === 'emote').map(([, m]) => m)).toEqual([{ player: a, id: 1 }]);
  });

  it('개발 코인은 개발 모드에서만', () => {
    const a = user('a'), g = game(false);
    enter(g, a);
    g.onMessage(a, 'giveCoins', { to: 'wallet', amount: 500 });
    expect(new ShopStore(db, islandId).wallet(Number(a))).toBe(0);
    const d = game(true);
    enter(d, a);
    d.onMessage(a, 'giveCoins', { to: 'treasury', amount: 500 });
    expect(d.state.treasury).toBe(2500);
  });
});
