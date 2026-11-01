// 스킬 창(K) (skills.md 1장, CD-3 전 임시 연결 cards/interim.ts): 섬에서 카드 단계·변형·장착 저장(서버 검사)·초기화, 던전 파티 정보·입력 검사에 반영
import { decodeBuild, perksOf, resolveSkill, slotSkills, weaponDef, type S2C } from '@game/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from '../db/client';
import { IslandStore } from '../db/islandStore';
import { islands, users, weaponMastery } from '../db/schema';
import { ShopStore } from '../db/shopStore';
import { cardNodes, dungeonBuild } from '../db/skillStore';
import { InputQueue } from './inputs';
import { IslandGame } from './islandGame';

let db: Db, islandId: number, sent: [string, string, unknown][];

const user = (level = 1) => {
  const id = db.insert(users).values({ nickname: 'a', nicknameKey: 'a', passwordHash: 'h', recoveryHash: 'r', islandId, wallet: 0, createdAt: 0 }).returning({ id: users.id }).get().id;
  if (level > 1) db.insert(weaponMastery).values({ userId: id, weapon: 'greatsword', level, exp: 0 }).run();
  return String(id);
};
const game = () => new IslandGame('섬', 0, [], { send: (id, type, msg) => sent.push([id, type, msg]), broadcast: () => {} },
  { store: new IslandStore(db, islandId), shopStore: new ShopStore(db, islandId), dev: true });
const lastSkills = (id: string) => sent.filter(([to, t]) => to === id && t === 'skills').at(-1)?.[2] as S2C['skills'];
const gs = (s: S2C['skills']) => s.weapons.find((w) => w.weapon === 'greatsword')!;
const enter = (g: IslandGame, id: string) => { g.addResident({ id, name: id, color: 0 }); g.join(id); };
const set = (g: IslandGame, a: string, skillId: string, points: number, variant?: string) =>
  g.onMessage(a, 'skill', { weapon: 'greatsword', op: 'set', skillId, points, ...(variant ? { variant } : {}) });

beforeEach(() => {
  db = openDb(':memory:').db;
  islandId = db.insert(islands).values({ name: '섬', treasury: 0 }).returning({ id: islands.id }).get().id;
  sent = [];
});

describe('스킬 탭 (CD-3 전 임시: 모든 카드 보유로 봄)', () => {
  it('입장 때 무기마다 레벨·패시브 한도·쓴 비용·노드·액티브 4칸 (기본 A S 처음 카드)', () => {
    const a = user(4), g = game();
    enter(g, a);
    expect(gs(lastSkills(a))).toEqual({ weapon: 'greatsword', level: 4, cap: 3, used: 0, build: '', slots: ['gs_launch', 'gs_earthsplit', '', ''] });
    expect(lastSkills(a).weapons.find((w) => w.weapon === 'staff')).toMatchObject({ level: 1, cap: 2, slots: ['st_fireburst', 'st_icefield', '', ''] });
  });

  it('강화(2)·변형 저장, 변형은 강화만, 단계 3은 없음', () => {
    const a = user(4), g = game();
    enter(g, a);
    set(g, a, 'gs_earthsplit', 1, 'fan');
    expect(lastSkills(a).fail).toBe('variant');
    set(g, a, 'gs_launch', 2, 'double');
    expect(gs(lastSkills(a))).toMatchObject({ build: 'gs_launch:2:double' });
    set(g, a, 'gs_whirl', 3);
    expect(lastSkills(a).fail).toBe('points');
    expect(cardNodes(db, Number(a), 'greatsword')).toEqual({ gs_launch: { points: 2, variant: 'double' } });
  });

  it('장착 숙련도·다른 무기는 거절, 패시브는 비용 한도 안에서 (계열 섞기 됨)', () => {
    const a = user(5), g = game();
    enter(g, a);
    set(g, a, 'gs_quake', 2);
    expect(lastSkills(a).fail).toBe('locked');
    set(g, a, 'st_icefield', 2);
    expect(lastSkills(a).fail).toBe('skill');
    set(g, a, 'gs_steadfast', 2);
    set(g, a, 'gs_keenedge', 1);
    expect(gs(lastSkills(a))).toMatchObject({ cap: 4, used: 3, build: 'gs_keenedge:1,gs_steadfast:2' });
    set(g, a, 'gs_honing', 2);
    expect(lastSkills(a).fail).toBe('cap');
  });

  it('기본값으로 내리면 행이 지워지고, 초기화는 그 무기 단계·변형·패시브만', () => {
    const a = user(4), g = game();
    enter(g, a);
    set(g, a, 'gs_whirl', 2);
    set(g, a, 'gs_whirl', 1);
    expect(cardNodes(db, Number(a), 'greatsword')).toEqual({});
    set(g, a, 'gs_earthsplit', 2, 'fan');
    set(g, a, 'gs_heavyhand', 1);
    g.onMessage(a, 'skill', { weapon: 'greatsword', op: 'reset' });
    expect(gs(lastSkills(a))).toMatchObject({ used: 0, build: '' });
  });

  it('액티브 칸: 자리 바꾸기, 없는 칸·패시브·숙련도 모자람은 거절', () => {
    const a = user(9), g = game();
    enter(g, a);
    g.onMessage(a, 'skill', { weapon: 'greatsword', op: 'equip', skillId: 'gs_quake', slot: 2 });
    g.onMessage(a, 'skill', { weapon: 'greatsword', op: 'equip', skillId: 'gs_wave', slot: 0 });
    expect(gs(lastSkills(a)).slots).toEqual(['gs_wave', 'gs_earthsplit', 'gs_quake', '']);
    g.onMessage(a, 'skill', { weapon: 'greatsword', op: 'equip', skillId: 'gs_whirl', slot: 4 });
    expect(lastSkills(a).fail).toBe('slot');
    g.onMessage(a, 'skill', { weapon: 'greatsword', op: 'equip', skillId: 'gs_heavyhand', slot: 3 });
    expect(lastSkills(a).fail).toBe('skill');
    g.onMessage(a, 'skill', { weapon: 'greatsword', op: 'equip', skillId: 'gs_crush', slot: 3 });
    expect(lastSkills(a).fail).toBe('locked');
  });

  it('던전 파티 정보: 장착 카드만 실리고, 안 낀 스킬은 던전에서 거절', () => {
    const a = user(9), g = game(), w = weaponDef('greatsword');
    enter(g, a);
    set(g, a, 'gs_whirl', 2, 'rush');
    set(g, a, 'gs_heavyhand', 2);
    g.onMessage(a, 'skill', { weapon: 'greatsword', op: 'equip', skillId: 'gs_quake', slot: 0 });
    g.onMessage(a, 'skill', { weapon: 'greatsword', op: 'equip', skillId: 'gs_whirl', slot: 2 });
    const b = decodeBuild(dungeonBuild(db, Number(a), 'greatsword'));
    expect(slotSkills(w, b)).toEqual(['gs_quake', 'gs_earthsplit', 'gs_whirl', null]);
    expect(b.gs_whirl).toEqual({ level: 2, variant: 'rush', slot: 2 });
    // 파쇄 카드 3장(지진·회전베기·무거운 손) = 계열 보너스 Ⅰ 충전 속도 ×1.15
    expect(perksOf(w, b).chargeSpeedMul).toBeCloseTo(1.6 * 1.15);
    const q = new InputQueue(), act = (skillId: string) => ({ seq: 1, t: 0, kind: 'skill' as const, skillId, x: 0, y: 0, facing: 1 as const });
    const p = { downed: false, hurt: null, cooldowns: {}, mp: 100, reinput: null };
    expect(q.onAction(act('gs_launch'), p as never, w, b)).not.toBeNull();
    expect(q.onAction(act('gs_quake'), p as never, w, b)).toBeNull();
  });

  it('출발 카운트다운 중인 대기자는 못 바꿈', () => {
    const a = user(4), g = game();
    enter(g, a);
    Object.assign(g.state.well, { departAt: 1 });
    g.state.well.members.push(a);
    set(g, a, 'gs_launch', 2);
    expect(lastSkills(a).fail).toBe('busy');
    expect(cardNodes(db, Number(a), 'greatsword')).toEqual({});
  });
});

describe('던전 입력 검사', () => {
  const action = (skillId: string) => ({ seq: 1, t: 0, kind: 'skill' as const, skillId, x: 0, y: 0, facing: 1 as const });
  const player = () => ({ downed: false, hurt: null, cooldowns: {} as Record<string, number>, mp: 100, reinput: null as { id: string; left: number; window: number } | null });

  it('서버가 정한 노드의 정의로 판정 (변형·강화 배율)', () => {
    const q = new InputQueue(), build = decodeBuild('gs_launch:2:double');
    const w = weaponDef('greatsword');
    expect(q.onAction(action('gs_launch'), player() as never, w, build)).toBeNull();
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
