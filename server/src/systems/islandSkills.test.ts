// 스킬 창(K) (skills.md 1장): 섬에서 포인트·변형 저장(서버 검사)·초기화, 던전 파티 정보·입력 검사에 반영
import { decodeBuild, resolveSkill, slotSkills, weaponDef, type S2C } from '@game/shared';
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

  it('계열 스킬: 배우면 같은 키의 다른 스킬은 지워지고 포인트가 옮겨감, 0으로 내리면 안 배움', () => {
    const a = user(3), g = game();
    enter(g, a);
    g.onMessage(a, 'skill', { weapon: 'greatsword', op: 'set', skillId: 'gs_whirl', points: 2 });
    expect(gs(lastSkills(a))).toMatchObject({ spent: 2, build: 'gs_whirl:2' });
    g.onMessage(a, 'skill', { weapon: 'greatsword', op: 'set', skillId: 'gs_shoulder', points: 2 });
    expect(skillBuild(db, Number(a))).toEqual({ gs_shoulder: { points: 2 } });
    g.onMessage(a, 'skill', { weapon: 'greatsword', op: 'set', skillId: 'gs_shoulder', points: 0 });
    expect(gs(lastSkills(a))).toMatchObject({ spent: 0, build: '' });
  });

  it('계열 2단계: 1단계 3포인트 전에는 잠김, 1단계를 내리면 2단계가 지워지고 SP가 돌아옴', () => {
    const a = user(6), g = game();
    enter(g, a);
    g.onMessage(a, 'skill', { weapon: 'greatsword', op: 'set', skillId: 'gs_quake', points: 1 });
    expect(lastSkills(a).fail).toBe('locked');
    g.onMessage(a, 'skill', { weapon: 'greatsword', op: 'set', skillId: 'gs_whirl', points: 3 });
    g.onMessage(a, 'skill', { weapon: 'greatsword', op: 'set', skillId: 'gs_quake', points: 2 });
    expect(gs(lastSkills(a))).toMatchObject({ spent: 5, build: 'gs_whirl:3,gs_quake:2' });
    g.onMessage(a, 'skill', { weapon: 'greatsword', op: 'set', skillId: 'gs_whirl', points: 2 });
    expect(gs(lastSkills(a))).toMatchObject({ spent: 2, build: 'gs_whirl:2' });
  });

  it('슬롯 장착: 저장되고 던전 파티 정보에 실림, 장착 안 한 스킬은 던전에서 거절', () => {
    const a = user(6), g = game(), w = weaponDef('greatsword');
    enter(g, a);
    g.onMessage(a, 'skill', { weapon: 'greatsword', op: 'set', skillId: 'gs_whirl', points: 3 });
    g.onMessage(a, 'skill', { weapon: 'greatsword', op: 'set', skillId: 'gs_wave', points: 1 });
    g.onMessage(a, 'skill', { weapon: 'greatsword', op: 'set', skillId: 'gs_quake', points: 1 });
    // 빈칸이 없어 지진은 장착 안 됨 → U에 장착하면 올려베기가 빠짐
    expect(slotSkills(w, skillBuild(db, Number(a)))).toEqual(['gs_launch', 'gs_earthsplit', 'gs_whirl', 'gs_wave']);
    g.onMessage(a, 'skill', { weapon: 'greatsword', op: 'equip', skillId: 'gs_quake', slot: 0 });
    expect(lastSkills(a).fail).toBeUndefined();
    const b = skillBuild(db, Number(a));
    expect(slotSkills(w, b)).toEqual(['gs_quake', 'gs_earthsplit', 'gs_whirl', 'gs_wave']);
    expect(slotSkills(w, decodeBuild(gs(lastSkills(a)).build))).toEqual(slotSkills(w, b));
    const q = new InputQueue(), act = (skillId: string) => ({ seq: 1, t: 0, kind: 'skill' as const, skillId, x: 0, y: 0, facing: 1 as const });
    const p = { downed: false, hurt: null, cooldowns: {}, mp: 100, reinput: null };
    expect(q.onAction(act('gs_launch'), p as never, w, b)).not.toBeNull();
    expect(q.onAction(act('gs_quake'), p as never, w, b)).toBeNull();
    // 안 배운 스킬은 거절 (없는 슬롯은 skillLoadout.test, 섬 메시지는 초당 5개라 여기서는 5번까지)
    g.onMessage(a, 'skill', { weapon: 'greatsword', op: 'equip', skillId: 'gs_draw', slot: 1 });
    expect(lastSkills(a).fail).toBe('skill');
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

  it('안 배운 계열 스킬은 거절', () => {
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
