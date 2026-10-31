// 스킬 창(K) (skills.md 1장): 섬에서 포인트·변형·계열·장착 저장(서버 검사)·초기화, 던전 파티 정보·입력 검사에 반영
import { decodeBuild, perksOf, resolveSkill, slotSkills, weaponDef, type S2C } from '@game/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from '../db/client';
import { IslandStore } from '../db/islandStore';
import { islands, users, weaponMastery } from '../db/schema';
import { ShopStore } from '../db/shopStore';
import { dungeonBuild, skillBuild } from '../db/skillStore';
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

describe('스킬 탭', () => {
  it('입장 때 무기마다 레벨·SP(레벨 − 1)·쓴 SP·노드·계열·장착', () => {
    const a = user(4), g = game();
    enter(g, a);
    expect(gs(lastSkills(a))).toEqual({ weapon: 'greatsword', level: 4, sp: 3, spent: 0, build: '', branch: 'A', slots: ['gs_launch', 'gs_earthsplit', 'gs_whirl', 'gs_shoulder'] });
    expect(lastSkills(a).weapons.find((w) => w.weapon === 'staff')).toMatchObject({ level: 1, sp: 0, slots: ['st_fireburst', 'st_icefield', '', ''] });
  });

  it('포인트·변형 저장 (변형은 1포인트부터), SP를 넘으면 거절', () => {
    const a = user(4), g = game();
    enter(g, a);
    set(g, a, 'gs_earthsplit', 1, 'fan');
    expect(lastSkills(a).fail).toBeUndefined();
    set(g, a, 'gs_launch', 3, 'double');
    expect(gs(lastSkills(a))).toMatchObject({ spent: 2, build: 'gs_launch:3:double,gs_earthsplit:1:fan' });
    set(g, a, 'gs_whirl', 3);
    expect(lastSkills(a).fail).toBe('sp');
    expect(skillBuild(db, Number(a))).toEqual({ gs_earthsplit: { points: 1, variant: 'fan' }, gs_launch: { points: 3, variant: 'double' } });
  });

  it('잠긴 노드·다른 계열·다른 무기는 거절, 패시브는 0~3', () => {
    const a = user(5), g = game();
    enter(g, a);
    set(g, a, 'gs_quake', 2);
    expect(lastSkills(a).fail).toBe('locked');
    set(g, a, 'gs_keenedge', 1);
    expect(lastSkills(a).fail).toBe('branch');
    set(g, a, 'st_icefield', 2);
    expect(lastSkills(a).fail).toBe('skill');
    set(g, a, 'gs_steadfast', 3);
    expect(gs(lastSkills(a))).toMatchObject({ spent: 3, build: 'gs_steadfast:3' });
  });

  it('기본값으로 내리면 행이 지워지고, 초기화는 그 무기 포인트·변형만', () => {
    const a = user(4), g = game();
    enter(g, a);
    set(g, a, 'gs_whirl', 2);
    set(g, a, 'gs_whirl', 1);
    expect(skillBuild(db, Number(a))).toEqual({});
    set(g, a, 'gs_earthsplit', 3, 'fan');
    g.onMessage(a, 'skill', { weapon: 'greatsword', op: 'reset' });
    expect(gs(lastSkills(a))).toMatchObject({ spent: 0, build: '' });
  });

  it('계열 바꾸기: 장착은 계열마다 따로 기억, 다른 계열에 찍은 포인트는 남음', () => {
    const a = user(9), g = game();
    enter(g, a);
    set(g, a, 'gs_whirl', 3);
    g.onMessage(a, 'skill', { weapon: 'greatsword', op: 'equip', skillId: 'gs_quake', slot: 0 });
    expect(gs(lastSkills(a)).slots).toEqual(['gs_quake', 'gs_earthsplit', 'gs_whirl', 'gs_shoulder']);
    g.onMessage(a, 'skill', { weapon: 'greatsword', op: 'branch', branch: 'B' });
    expect(gs(lastSkills(a))).toMatchObject({ branch: 'B', spent: 2, slots: ['gs_launch', 'gs_earthsplit', 'gs_wave', 'gs_draw'] });
    g.onMessage(a, 'skill', { weapon: 'greatsword', op: 'equip', skillId: 'gs_whirl', slot: 2 });
    expect(lastSkills(a).fail).toBe('branch');
    g.onMessage(a, 'skill', { weapon: 'greatsword', op: 'branch', branch: 'A' });
    expect(gs(lastSkills(a))).toMatchObject({ branch: 'A', slots: ['gs_quake', 'gs_earthsplit', 'gs_whirl', 'gs_shoulder'] });
  });

  it('던전 파티 정보: 고른 계열·장착만 실리고, 장착 안 한 스킬은 던전에서 거절', () => {
    const a = user(9), g = game(), w = weaponDef('greatsword');
    enter(g, a);
    set(g, a, 'gs_whirl', 3, 'rush');
    set(g, a, 'gs_keenedge', 1);
    expect(lastSkills(a).fail).toBe('branch');
    set(g, a, 'gs_heavyhand', 2);
    g.onMessage(a, 'skill', { weapon: 'greatsword', op: 'equip', skillId: 'gs_quake', slot: 0 });
    const b = decodeBuild(dungeonBuild(db, Number(a), 'greatsword'));
    expect(slotSkills(w, b)).toEqual(['gs_quake', 'gs_earthsplit', 'gs_whirl', 'gs_shoulder']);
    expect(b.gs_whirl).toEqual({ points: 3, variant: 'rush', slot: 2 });
    expect(perksOf(w, b).chargeSpeedMul).toBe(1.45);
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
    expect(skillBuild(db, Number(a))).toEqual({});
  });
});

describe('던전 입력 검사', () => {
  const action = (skillId: string) => ({ seq: 1, t: 0, kind: 'skill' as const, skillId, x: 0, y: 0, facing: 1 as const });
  const player = () => ({ downed: false, hurt: null, cooldowns: {} as Record<string, number>, mp: 100, reinput: null as { id: string; left: number; window: number } | null });

  it('서버가 정한 노드의 정의로 판정 (변형·레벨 배율)', () => {
    const q = new InputQueue(), build = decodeBuild('gs_launch:3:double');
    const w = { baseSkills: ['gs_launch', 'gs_earthsplit'] } as never;
    expect(q.onAction(action('gs_launch'), player() as never, w, build)).toBeNull();
    expect(q.take().input.skill).toBe(resolveSkill('gs_launch', { points: 3, variant: 'double' }));
  });

  it('빌드에 없는 계열 스킬은 거절', () => {
    const q = new InputQueue(), w = weaponDef('greatsword');
    expect(q.onAction(action('gs_whirl'), player() as never, w, {})).not.toBeNull();
    expect(q.onAction(action('gs_whirl'), player() as never, w, decodeBuild('gs_whirl:1'))).toBeNull();
  });

  it('재입력 대기 중이면 쿨타임이어도 받는다', () => {
    const q = new InputQueue(), w = { baseSkills: ['gs_launch'] } as never, p = player();
    p.cooldowns.gs_launch = 5;
    expect(q.onAction(action('gs_launch'), p as never, w)).toBe('cooldown');
    p.reinput = { id: 'gs_launch', left: 1, window: 0.5 };
    expect(q.onAction(action('gs_launch'), p as never, w)).toBeNull();
  });
});
