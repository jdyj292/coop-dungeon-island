// 스킬 카드 (skills.md 1장, network.md 4장 card): 섬에서 팩 열기·지정 구매·강화·갈기·변형·장착 (서버 검사·DB 트랜잭션), 던전 파티 빌드·입력 검사
import { craftPriceOf, decodeBuild, dustOf, giftItemOf, perksOf, resolveSkill, slotSkills, weaponDef, WELCOME_PACKS, type S2C } from '@game/shared';
import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildOf, collectionOf, grantStarter, writeCards } from '../db/cardStore';
import { openDb, type Db } from '../db/client';
import { IslandStore } from '../db/islandStore';
import { activityLog, cardPity, inventory, islands, users, weaponMastery } from '../db/schema';
import { ShopStore } from '../db/shopStore';
import { InputQueue } from './inputs';
import { IslandGame } from './islandGame';

let db: Db, islandId: number, sent: [string, string, unknown][], rolls: number[], nick = 0;

const user = (level = 1, wallet = 0, dust = 0) => {
  const name = `u${++nick}`;
  const id = db.insert(users).values({ nickname: name, nicknameKey: name, passwordHash: 'h', recoveryHash: 'r', islandId, wallet, dust, createdAt: 0 }).returning({ id: users.id }).get().id;
  if (level > 1) db.insert(weaponMastery).values({ userId: id, weapon: 'greatsword', level, exp: 0 }).run();
  grantStarter(db, id);
  return String(id);
};
/** 카드 주기 (count장, 강화) */
const give = (a: string, cardId: string, count = 1, enhanced = false, variant?: string) =>
  writeCards(db, Number(a), { [cardId]: { count, enhanced, ...(variant ? { variant } : {}) } }, [cardId]);
/** 난수: rolls를 차례로, 다 쓰면 0 */
const game = () => new IslandGame('섬', 0, [], { send: (id, type, msg) => sent.push([id, type, msg]), broadcast: () => {} },
  { store: new IslandStore(db, islandId), shopStore: new ShopStore(db, islandId), dev: true, rng: () => rolls.shift() ?? 0 });
const last = <T>(id: string, type: string) => sent.filter(([to, t]) => to === id && t === type).at(-1)?.[2] as T;
const cardsOf = (id: string) => last<S2C['cards']>(id, 'cards');
const gs = (id: string) => cardsOf(id).weapons.find((w) => w.weapon === 'greatsword')!;
const enter = (g: IslandGame, id: string) => { g.addResident({ id, name: id, color: 0 }); g.join(id); };
/** card 메시지 (섬 메시지 초당 5회 제한에 안 걸리게 시각을 넘김) */
const card = (g: IslandGame, a: string, msg: Record<string, unknown>) => { g.now += 250; g.onMessage(a, 'card', msg); };
const equip = (g: IslandGame, a: string, kind: 'active' | 'passive', slot: number, cardId: string | null) => card(g, a, { op: 'equip', weapon: 'greatsword', kind, slot, cardId });
const dust = (a: string) => db.select({ d: users.dust }).from(users).where(eq(users.id, Number(a))).get()!.d;

beforeEach(() => {
  db = openDb(':memory:').db;
  islandId = db.insert(islands).values({ name: '섬', treasury: 0 }).returning({ id: islands.id }).get().id;
  sent = [];
  rolls = [];
});

describe('카드 보유·창 값', () => {
  it('처음 카드 무기별 2장 + 환영 선물 팩, 입장 때 cards (기본 배치 A S)', () => {
    const a = user(4), g = game();
    enter(g, a);
    expect(cardsOf(a)).toMatchObject({ dust: 0, gifts: WELCOME_PACKS.count });
    expect(gs(a)).toEqual({
      weapon: 'greatsword', level: 4, cap: 3, active: ['gs_launch', 'gs_earthsplit', '', ''], passive: [],
      owned: { gs_launch: { count: 1, enhanced: false }, gs_earthsplit: { count: 1, enhanced: false } },
    });
    expect(Object.keys(cardsOf(a).weapons.find((w) => w.weapon === 'staff')!.owned)).toEqual(['st_fireburst', 'st_icefield']);
  });
});

describe('카드팩', () => {
  it('선물로 열기: 4장(마지막 티어 2 이상), pack → cards, 선물 −1', () => {
    const a = user(), g = game();
    enter(g, a);
    card(g, a, { op: 'open', weapon: 'greatsword', pack: 1, pay: 'gift' });
    const p = last<S2C['pack']>(a, 'pack');
    expect(p.cards).toHaveLength(4);
    expect(p.cards.at(-1)!.tier).toBeGreaterThanOrEqual(2);
    expect(cardsOf(a).gifts).toBe(WELCOME_PACKS.count - 1);
    expect(cardsOf(a).fail).toBeUndefined();
    // 난수 0 = 티어 1 첫 카드(올려베기)만 3장 → 처음 1장 + 2장째에 3장이 모여 바로 강화, 3장째는 갈림
    expect(gs(a).owned.gs_launch).toEqual({ count: 0, enhanced: true });
    expect(p.cards.map((c) => c.isNew)).toEqual([false, false, false, true]);
    expect(p.cards.map((c) => c.merged)).toEqual([false, true, false, false]);
    expect(p.cards.map((c) => c.ground)).toEqual([0, 0, 5, 0]);
    expect(cardsOf(a).dust).toBe(5);
    const n = Object.values(gs(a).owned).reduce((s, o) => s + o.count, 0);
    expect(n).toBe(1 + 1);
  });

  it('이미 강화한 카드는 보관하지 않고 바로 갈려 조각, 지정 구매도 못 함 (done)', () => {
    const a = user(), g = game();
    enter(g, a);
    give(a, 'gs_launch', 0, true);
    card(g, a, { op: 'open', weapon: 'greatsword', pack: 1, pay: 'gift' });
    const p = last<S2C['pack']>(a, 'pack');
    expect(p.cards.map((c) => c.ground)).toEqual([5, 5, 5, 0]);
    expect(gs(a).owned.gs_launch).toEqual({ count: 0, enhanced: true });
    expect(cardsOf(a).dust).toBe(15);
    card(g, a, { op: 'craft', cardId: 'gs_launch' });
    expect(cardsOf(a).fail).toBe('done');
    expect(cardsOf(a).dust).toBe(15);
  });

  it('코인·조각 모자람, 숙련도 모자란 팩, 선물은 팩 1만', () => {
    const a = user(1, 99), g = game();
    enter(g, a);
    card(g, a, { op: 'open', weapon: 'greatsword', pack: 1, pay: 'coin' });
    expect(cardsOf(a).fail).toBe('coin');
    card(g, a, { op: 'open', weapon: 'greatsword', pack: 1, pay: 'dust' });
    expect(cardsOf(a).fail).toBe('dust');
    card(g, a, { op: 'open', weapon: 'greatsword', pack: 2, pay: 'gift' });
    expect(cardsOf(a).fail).toBe('locked');
    const b = user(6), h = game();
    enter(h, b);
    card(h, b, { op: 'open', weapon: 'greatsword', pack: 2, pay: 'gift' });
    expect(cardsOf(b).fail).toBe('gift');
    expect(db.select().from(inventory).where(and(eq(inventory.userId, Number(b)), eq(inventory.itemId, giftItemOf(1)))).get()?.count).toBe(WELCOME_PACKS.count);
  });

  it('코인으로 열면 지갑 차감 + me 다시', () => {
    const a = user(1, 150), g = game();
    enter(g, a);
    card(g, a, { op: 'open', weapon: 'greatsword', pack: 1, pay: 'coin' });
    expect(last<S2C['me']>(a, 'me').wallet).toBe(50);
  });

  it('천장: 팩 2를 9번 티어 3 없이 열면 10번째 마지막 장 = 티어 3, 게시판 한 줄, 천장 0으로', () => {
    const a = user(11, 0, 99999), g = game();
    enter(g, a);
    for (let i = 0; i < 10; i++) card(g, a, { op: 'open', weapon: 'greatsword', pack: 2, pay: 'dust' });
    const packs = sent.filter(([, t]) => t === 'pack').map(([, , m]) => m as S2C['pack']);
    expect(packs.slice(0, 9).every((p) => p.cards.every((c) => c.tier < 3))).toBe(true);
    expect(packs[8]!.pity).toBe(9);
    expect(packs[9]!.cards.at(-1)!.tier).toBe(3);
    expect(packs[9]!.pity).toBe(0);
    expect(db.select().from(cardPity).get()).toMatchObject({ weapon: 'greatsword', pack: 2, opened: 0 });
    const log = db.select().from(activityLog).where(eq(activityLog.action, 'card')).all();
    expect(log.map((l) => l.itemId)).toEqual([packs[9]!.cards.at(-1)!.id]);
  });
});

describe('지정 구매·강화·갈기·변형', () => {
  it('지정 구매 3장째에 바로 강화, 그 뒤는 못 삼 (done), 조각 모자라면 거절', () => {
    const a = user(1, 0, craftPriceOf('gs_whirl') * 3), g = game();
    enter(g, a);
    card(g, a, { op: 'craft', cardId: 'gs_crush' });
    expect(cardsOf(a).fail).toBe('dust');
    for (let i = 0; i < 2; i++) card(g, a, { op: 'craft', cardId: 'gs_whirl' });
    expect(gs(a).owned.gs_whirl).toEqual({ count: 2, enhanced: false });
    card(g, a, { op: 'craft', cardId: 'gs_whirl' });
    expect(gs(a).owned.gs_whirl).toEqual({ count: 0, enhanced: true });
    expect(dust(a)).toBe(0);
    card(g, a, { op: 'craft', cardId: 'gs_whirl' });
    expect(cardsOf(a).fail).toBe('done');
  });

  it('직접 강화 요청은 없음 (메시지 거절)', () => {
    const a = user(), g = game();
    enter(g, a);
    give(a, 'gs_launch', 4);
    const before = sent.length;
    card(g, a, { op: 'enhance', cardId: 'gs_launch' } as never);
    expect(sent.length).toBe(before);
  });

  it('끼운 패시브가 3장째로 강화돼도 비용 그대로 (한도가 꽉 차도 됨)', () => {
    const a = user(1, 0, craftPriceOf('gs_heavyhand')), g = game();
    enter(g, a);
    give(a, 'gs_heavyhand', 2);
    give(a, 'gs_steadfast', 1);
    equip(g, a, 'passive', 0, 'gs_heavyhand');
    equip(g, a, 'passive', 1, 'gs_steadfast');
    card(g, a, { op: 'craft', cardId: 'gs_heavyhand' });
    expect(cardsOf(a).fail).toBeUndefined();
    expect(gs(a)).toMatchObject({ owned: { gs_heavyhand: { count: 0, enhanced: true } }, passive: ['gs_heavyhand', 'gs_steadfast'] });
  });

  it('직접 갈기는 없음, 섬에 들어오면 강화한 카드에 남은 장수만 조각으로', () => {
    const a = user(), g = game();
    give(a, 'gs_quake', 2, true);
    give(a, 'gs_whirl', 2);
    enter(g, a);
    expect(dust(a)).toBe(dustOf('gs_quake') * 2);
    expect(gs(a).owned).toMatchObject({ gs_quake: { count: 0, enhanced: true }, gs_whirl: { count: 2, enhanced: false } });
    const before = sent.length;
    card(g, a, { op: 'grind', cardId: 'gs_whirl', n: 1 } as never);
    expect(sent.length).toBe(before);
  });

  it('변형은 강화한 액티브만, null = 기본 동작', () => {
    const a = user(), g = game();
    enter(g, a);
    card(g, a, { op: 'variant', cardId: 'gs_launch', variant: 'double' });
    expect(cardsOf(a).fail).toBe('variant');
    give(a, 'gs_launch', 0, true);
    card(g, a, { op: 'variant', cardId: 'gs_launch', variant: 'double' });
    expect(gs(a).owned.gs_launch).toEqual({ count: 0, enhanced: true, variant: 'double' });
    card(g, a, { op: 'variant', cardId: 'gs_launch', variant: null });
    expect(gs(a).owned.gs_launch).toEqual({ count: 0, enhanced: true });
  });
});

describe('장착', () => {
  it('액티브 자리 바꾸기, 없는 카드·없는 칸·패시브 카드·숙련도 모자람은 거절', () => {
    const a = user(9), g = game();
    enter(g, a);
    equip(g, a, 'active', 2, 'gs_whirl');
    expect(cardsOf(a).fail).toBe('owned');
    give(a, 'gs_whirl');
    give(a, 'gs_crush');
    equip(g, a, 'active', 2, 'gs_whirl');
    equip(g, a, 'active', 0, 'gs_whirl');
    expect(gs(a).active).toEqual(['gs_whirl', 'gs_earthsplit', 'gs_launch', '']);
    equip(g, a, 'active', 4, 'gs_whirl');
    expect(cardsOf(a).fail).toBe('slot');
    equip(g, a, 'active', 3, 'gs_heavyhand');
    expect(cardsOf(a).fail).toBe('card');
    equip(g, a, 'active', 3, 'gs_crush');
    expect(cardsOf(a).fail).toBe('locked');
  });

  it('패시브는 비용 한도 안에서 (비용 = 티어, 강화해도 그대로), 패시브를 끼워도 액티브 배치는 그대로', () => {
    const a = user(6), g = game();
    enter(g, a);
    give(a, 'gs_steadfast', 0, true);
    give(a, 'gs_aftershock');
    give(a, 'gs_stomp', 0, true);
    equip(g, a, 'passive', 0, 'gs_steadfast');
    equip(g, a, 'passive', 1, 'gs_aftershock');
    expect(gs(a)).toMatchObject({ cap: 4, active: ['gs_launch', 'gs_earthsplit', '', ''], passive: ['gs_steadfast', 'gs_aftershock'] });
    equip(g, a, 'passive', 2, 'gs_stomp');
    expect(cardsOf(a).fail).toBe('cap');
    equip(g, a, 'passive', 0, null);
    expect(gs(a).passive).toEqual(['gs_aftershock']);
  });

  it('출발 카운트다운 중인 대기자는 장착만 못 바꿈 (열기는 됨)', () => {
    const a = user(), g = game();
    enter(g, a);
    Object.assign(g.state.well, { departAt: 1 });
    g.state.well.members.push(a);
    equip(g, a, 'active', 0, null);
    expect(cardsOf(a).fail).toBe('busy');
    card(g, a, { op: 'open', weapon: 'greatsword', pack: 1, pay: 'gift' });
    expect(cardsOf(a).fail).toBeUndefined();
  });
});

describe('던전 빌드', () => {
  it('장착 카드만 실리고 (강화·변형·칸), 계열 보너스, 안 낀 스킬은 던전에서 거절', () => {
    const a = user(9), g = game(), w = weaponDef('greatsword');
    enter(g, a);
    give(a, 'gs_whirl', 0, true, 'rush');
    give(a, 'gs_quake');
    give(a, 'gs_heavyhand', 0, true);
    give(a, 'gs_wave');
    equip(g, a, 'active', 0, 'gs_quake');
    equip(g, a, 'active', 2, 'gs_whirl');
    equip(g, a, 'passive', 0, 'gs_heavyhand');
    const b = decodeBuild(buildOf(db, Number(a), 'greatsword'));
    expect(slotSkills(w, b)).toEqual(['gs_quake', 'gs_earthsplit', 'gs_whirl', null]);
    expect(b.gs_whirl).toEqual({ level: 2, variant: 'rush', slot: 2 });
    expect(b.gs_wave).toBeUndefined();
    // 파쇄 카드 3장(지진·회전베기·무거운 손) = 계열 보너스 Ⅰ 충전 속도 ×1.15
    expect(perksOf(w, b).chargeSpeedMul).toBeCloseTo(1.6 * 1.15);
    const q = new InputQueue(), act = (skillId: string) => ({ seq: 1, t: 0, kind: 'skill' as const, skillId, x: 0, y: 0, facing: 1 as const });
    const p = { downed: false, hurt: null, cooldowns: {}, mp: 100, reinput: null };
    expect(q.onAction(act('gs_launch'), p as never, w, b)).not.toBeNull();
    expect(q.onAction(act('gs_quake'), p as never, w, b)).toBeNull();
    expect(collectionOf(db, Number(a), 'staff')).toEqual({ st_fireburst: { count: 1, enhanced: false }, st_icefield: { count: 1, enhanced: false } });
  });
});

describe('던전 입력 검사', () => {
  const action = (skillId: string) => ({ seq: 1, t: 0, kind: 'skill' as const, skillId, x: 0, y: 0, facing: 1 as const });
  const player = () => ({ downed: false, hurt: null, cooldowns: {} as Record<string, number>, mp: 100, reinput: null as { id: string; left: number; window: number } | null });

  it('서버가 정한 노드의 정의로 판정 (변형·강화 배율)', () => {
    const q = new InputQueue(), build = decodeBuild('gs_launch:2:double');
    expect(q.onAction(action('gs_launch'), player() as never, weaponDef('greatsword'), build)).toBeNull();
    expect(q.take().input.skill).toBe(resolveSkill('gs_launch', { level: 2, variant: 'double' }));
  });

  it('빌드에 없는 스킬은 거절 (빈 빌드는 처음 카드)', () => {
    const q = new InputQueue(), w = weaponDef('greatsword');
    expect(q.onAction(action('gs_whirl'), player() as never, w, {})).not.toBeNull();
    expect(q.onAction(action('gs_launch'), player() as never, w, {})).toBeNull();
    expect(q.onAction(action('gs_whirl'), player() as never, w, decodeBuild('gs_whirl:1'))).toBeNull();
  });

  it('재입력 대기 중이면 쿨타임이어도 받는다', () => {
    const q = new InputQueue(), w = weaponDef('greatsword'), p = player();
    p.cooldowns.gs_launch = 5;
    expect(q.onAction(action('gs_launch'), p as never, w)).toBe('cooldown');
    p.reinput = { id: 'gs_launch', left: 1, window: 0.5 };
    expect(q.onAction(action('gs_launch'), p as never, w)).toBeNull();
  });
});
