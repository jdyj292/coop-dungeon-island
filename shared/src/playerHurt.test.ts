import { describe, expect, it } from 'vitest';
import { skillDef, weaponDef } from './actions';
import { TICK } from './constants';
import { PLAYER } from './data/load';
import { newPlayerState, skillReady, stepPlayerState, type PlayerInput, type PlayerState } from './player';
import { gainMpOnHit, hurtPlayer, isInvulnerable, maxHpFor, usePotion } from './playerHurt';
import { RoomSim } from './sim/room';

const gs = weaponDef('greatsword');
const bounds = { minX: 0, maxX: 1000, minY: 0, maxY: 100 };
const none: PlayerInput = { x: 0, y: 0, attack: false, skill: null, backstep: false };
const step = (p: PlayerState, sec: number, input: Partial<PlayerInput> = {}) => {
  const ev: string[] = [];
  for (let t = 0; t < sec - 1e-9; t += TICK) ev.push(...stepPlayerState(p, gs, { ...none, ...input }, TICK, bounds).hurt);
  return ev;
};

describe('HP (balance.md 5장)', () => {
  it('최대 HP = 1000 × (1 + 0.04 × (숙련도 - 1))', () => {
    expect(maxHpFor(1)).toBe(1000);
    expect(maxHpFor(20)).toBe(1760);
  });
});

describe('피격 (combat.md 4장)', () => {
  it('약 공격: 0.2초 경직, 그동안 조작 불가, 하던 행동 끊김, 경직 중 연속 피격 가능', () => {
    const p = newPlayerState({ x: 100, y: 50 });
    step(p, TICK, { attack: true });
    expect(p.fighter.run).not.toBeNull();
    expect(hurtPlayer(p, 60, 'light')).toEqual(['stun']);
    expect(p.fighter.run).toBeNull();
    expect(p.hp).toBe(940);
    expect(hurtPlayer(p, 60, 'light')).toEqual(['stun']);
    const x0 = p.pos.x;
    step(p, 0.1, { x: 1 });
    expect(p.pos.x).toBe(x0);
    step(p, 0.15, { x: 1 });
    expect(p.hurt).toBeNull();
  });
  it('강 공격: 1초 다운(맞지 않음) → 기상 후 1초 무적', () => {
    const p = newPlayerState({ x: 100, y: 50 });
    expect(hurtPlayer(p, 120, 'heavy')).toEqual(['down']);
    expect(isInvulnerable(p)).toBe(true);
    expect(hurtPlayer(p, 120, 'heavy')).toEqual([]);
    expect(step(p, PLAYER.hurt.downSec + TICK)).toEqual(['getup']);
    expect(isInvulnerable(p)).toBe(true);
    step(p, PLAYER.hurt.getupInvuln + TICK);
    expect(isInvulnerable(p)).toBe(false);
  });
  it('HP 0: 부활의 깃털로 50% 부활 + 2초 무적, 깃털이 없으면 전멸', () => {
    const p = newPlayerState({ x: 100, y: 50 });
    expect(hurtPlayer(p, 5000)).toEqual(['revive']);
    expect(p.hp).toBe(500);
    expect(p.invuln).toBe(PLAYER.revive.invuln);
    step(p, PLAYER.revive.invuln + TICK);
    expect(hurtPlayer(p, 5000)).toEqual(['wipe']);
    expect(p.downed).toBe(true);
    expect(hurtPlayer(p, 10)).toEqual([]);
  });
});

describe('MP·물약 (balance.md 6장)', () => {
  it('스킬은 MP를 쓰고, 모자라면 못 씀. 초당 1 회복, 적중 1회당 +1', () => {
    const p = newPlayerState({ x: 100, y: 50 });
    const launch = skillDef('gs_launch');
    p.mp = launch.mp! - 1;
    expect(skillReady(p, launch)).toBe(false);
    step(p, 1.05);
    expect(skillReady(p, launch)).toBe(true);
    const mp0 = p.mp;
    stepPlayerState(p, gs, { ...none, skill: launch }, TICK, bounds);
    expect(p.mp).toBeCloseTo(mp0 - launch.mp! + PLAYER.mp.regen * TICK);
    const before = p.mp;
    gainMpOnHit(p);
    expect(p.mp).toBeCloseTo(before + 1);
  });
  it('물약: HP 30% / MP 50, 각 5개, 쿨 5초, 다운 중 불가', () => {
    const p = newPlayerState({ x: 100, y: 50 });
    p.hp = 100;
    expect(usePotion(p, 'hp')).toBe(true);
    expect(p.hp).toBe(400);
    expect(p.potions.hp).toBe(4);
    expect(usePotion(p, 'hp')).toBe(false);
    step(p, 5.01);
    expect(usePotion(p, 'hp')).toBe(true);
    hurtPlayer(p, 10, 'heavy');
    p.mp = 0;
    expect(usePotion(p, 'mp')).toBe(false);
  });
});

describe('RoomSim 연결', () => {
  it('통통버섯 박치기 → HP 감소 + 경직 이벤트', () => {
    const sim = new RoomSim(gs, { minX: 8, maxX: 312, minY: 0, maxY: 112 }, { x: 100, y: 56 }, { rng: () => 0 });
    sim.spawn([{ kind: 'mushroom', x: 115, y: 56 }]);
    const ev: string[] = [];
    for (let t = 0; t < 2; t += TICK) ev.push(...sim.tick(TICK, none).events.map((e) => (e.type === 'playerHurt' ? `hurt:${e.e}` : e.type)));
    expect(ev).toContain('playerHit');
    expect(ev).toContain('hurt:stun');
    expect(sim.player.hp).toBe(1000 - 60);
    expect(sim.player.ult).toBe(PLAYER.ultimate.onHurt);
  });
  it('졸음 구름 안에서는 이동 속도 -50%', () => {
    const sim = new RoomSim(gs, { minX: 0, maxX: 1000, minY: 0, maxY: 200 }, { x: 100, y: 56 }, { ai: false });
    const walk = () => { const x0 = sim.player.pos.x; for (let i = 0; i < 30; i++) sim.tick(TICK, { ...none, x: 1 }); return sim.player.pos.x - x0; };
    const free = walk();
    sim.zones.push({ id: 99, attackId: 'bear_yawn', def: { shape: 'circle', at: [0, 0], radius: 400, duration: 6, effect: { type: 'slow', amount: 0.5 } }, x: 200, y: 56, left: 6 });
    expect(walk()).toBeCloseTo(free / 2, 0);
  });
});

describe('콤보·필살기 게이지', () => {
  it('적중이 1.5초 안에 이어지면 콤보 유지, 끊기면 0. 게이지는 적중 1회당 +1', () => {
    const sim = new RoomSim(gs, { minX: 0, maxX: 1000, minY: 0, maxY: 100 }, { x: 100, y: 50 }, { ai: false });
    sim.spawn([{ kind: 'mushroom', x: 114, y: 50 }, { kind: 'mushroom', x: 118, y: 52 }]);
    for (let i = 0; i < 40; i++) sim.tick(TICK, { ...none, attack: i === 0 });
    expect(sim.combo.count).toBe(2);
    expect(sim.player.ult).toBe(2 * PLAYER.ultimate.onHit);
    for (let t = 0; t < 1.6; t += TICK) sim.tick(TICK, none);
    expect(sim.combo.count).toBe(0);
    expect(sim.combo.best).toBe(2);
  });
});

describe('넉백 (combat.md 4장)', () => {
  const pushed = (strength: 'light' | 'medium' | 'heavy', dir: number, x = 500) => {
    const p = newPlayerState({ x, y: 50 });
    hurtPlayer(p, 10, strength, dir);
    step(p, PLAYER.hurt.pushSec + 0.05);
    return p.pos.x - x;
  };
  it('세기별 거리만큼 pushSec 동안 밀림, 방향 0이면 안 밀림', () => {
    expect(pushed('light', 1)).toBeCloseTo(PLAYER.hurt.push.light);
    expect(pushed('medium', -1)).toBeCloseTo(-PLAYER.hurt.push.medium);
    expect(pushed('heavy', 1)).toBeCloseTo(PLAYER.hurt.push.heavy);
    expect(pushed('heavy', 0)).toBe(0);
  });
  it('벽에 막힘', () => {
    expect(pushed('heavy', -1, 10)).toBeCloseTo(-10); // 경계 x = 0에서 멈춤 (24px 다 못 밀림)
  });
  it('몬스터에게 맞으면 몬스터 반대쪽으로', () => {
    const sim = new RoomSim(gs, { minX: 8, maxX: 312, minY: 0, maxY: 112 }, { x: 100, y: 56 }, { rng: () => 0 });
    sim.spawn([{ kind: 'mushroom', x: 115, y: 56 }]);
    let x = -1;
    for (let t = 0; t < 2 && x < 0; t += TICK) if (sim.tick(TICK, none).events.some((e) => e.type === 'playerHit')) x = sim.player.pos.x;
    for (let t = 0; t < PLAYER.hurt.pushSec + 0.05; t += TICK) sim.tick(TICK, none);
    expect(sim.player.pos.x).toBeLessThan(x);
  });
});
