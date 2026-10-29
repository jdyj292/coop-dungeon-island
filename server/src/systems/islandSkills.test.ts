// 스킬 창(K) (skills.md 1장): 섬에서 포인트·변형 저장(서버 검사)·초기화, 던전 파티 정보·입력 검사에 반영
import { decodeBuild, resolveSkill, type S2C } from '@game/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from '../db/client';
import { IslandStore } from '../db/islandStore';
import { islands, users, weaponMastery } from '../db/schema';
import { ShopStore } from '../db/shopStore';
import { skillBuild } from '../db/skillStore';
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

beforeEach(() => {
  db = openDb(':memory:').db;
  islandId = db.insert(islands).values({ name: '섬', treasury: 0 }).returning({ id: islands.id }).get().id;
  sent = [];
});

describe('스킬 탭', () => {
  it('입장 때 무기마다 SP(레벨 − 1)·쓴 SP·노드', () => {
    const a = user(4), g = game();
    enter(g, a);
    expect(gs(lastSkills(a))).toEqual({ weapon: 'greatsword', sp: 3, spent: 0, build: '' });
    expect(lastSkills(a).weapons.find((w) => w.weapon === 'staff')?.sp).toBe(0);
  });

  it('포인트·변형 저장, SP를 넘으면 거절', () => {
    const a = user(4), g = game();
    enter(g, a);
    g.onMessage(a, 'skill', { weapon: 'greatsword', op: 'set', skillId: 'gs_launch', points: 3, variant: 'double' });
    expect(gs(lastSkills(a))).toMatchObject({ spent: 2, build: 'gs_launch:3:double' });
    g.onMessage(a, 'skill', { weapon: 'greatsword', op: 'set', skillId: 'gs_earthsplit', points: 3 });
    expect(lastSkills(a).fail).toBe('sp');
    expect(skillBuild(db, Number(a))).toEqual({ gs_launch: { points: 3, variant: 'double' } });
  });

  it('변형은 3포인트부터, 다른 무기 스킬은 거절', () => {
    const a = user(4), g = game();
    enter(g, a);
    g.onMessage(a, 'skill', { weapon: 'greatsword', op: 'set', skillId: 'gs_launch', points: 2, variant: 'double' });
    expect(lastSkills(a).fail).toBe('variant');
    g.onMessage(a, 'skill', { weapon: 'greatsword', op: 'set', skillId: 'st_icefield', points: 2 });
    expect(lastSkills(a).fail).toBe('skill');
  });

  it('1포인트로 내리면 행이 지워지고, 초기화는 그 무기만', () => {
    const a = user(4), g = game();
    enter(g, a);
    g.onMessage(a, 'skill', { weapon: 'greatsword', op: 'set', skillId: 'gs_launch', points: 2 });
    g.onMessage(a, 'skill', { weapon: 'greatsword', op: 'set', skillId: 'gs_launch', points: 1 });
    expect(skillBuild(db, Number(a))).toEqual({});
    g.onMessage(a, 'skill', { weapon: 'greatsword', op: 'set', skillId: 'gs_earthsplit', points: 3, variant: 'fan' });
    g.onMessage(a, 'skill', { weapon: 'greatsword', op: 'reset' });
    expect(gs(lastSkills(a))).toMatchObject({ spent: 0, build: '' });
  });

  it('출발 카운트다운 중인 대기자는 못 바꿈', () => {
    const a = user(4), g = game();
    enter(g, a);
    Object.assign(g.state.well, { departAt: 1 });
    g.state.well.members.push(a);
    g.onMessage(a, 'skill', { weapon: 'greatsword', op: 'set', skillId: 'gs_launch', points: 2 });
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

  it('재입력 대기 중이면 쿨타임이어도 받는다', () => {
    const q = new InputQueue(), w = { baseSkills: ['gs_launch'] } as never, p = player();
    p.cooldowns.gs_launch = 5;
    expect(q.onAction(action('gs_launch'), p as never, w)).toBe('cooldown');
    p.reinput = { id: 'gs_launch', left: 1, window: 0.5 };
    expect(q.onAction(action('gs_launch'), p as never, w)).toBeNull();
  });
});
