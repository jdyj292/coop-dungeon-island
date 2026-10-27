import { describe, expect, it } from 'vitest';
import { skillDef, weaponDef } from './actions';
import { applyHit, newBody, stepBody } from './body';
import { TICK } from './constants';
import { COMBAT, PLAYER } from './data/load';
import { canDodge, newPlayerState, skillReady, stepPlayerState, type PlayerInput, type PlayerState } from './player';
import { hurtPlayer, isInvulnerable } from './playerHurt';

const gs = weaponDef('greatsword');
const bounds = { minX: 0, maxX: 1000, minY: 0, maxY: 100 };
const none: PlayerInput = { x: 0, y: 0, attack: false, skill: null, backstep: false };
const launch = skillDef('gs_launch');

/** 틱 n번. first = 첫 틱 입력, hold = 계속 누르는 방향 */
function ticks(p: PlayerState, n: number, first: Partial<PlayerInput> = {}, hold: Partial<PlayerInput> = {}) {
  const events: string[] = [];
  for (let i = 0; i < n; i++) {
    const r = stepPlayerState(p, gs, { ...none, ...hold, ...(i === 0 ? first : {}) }, TICK, bounds);
    events.push(...r.events.map((e) => `${e.type}:${e.run.def.id}`));
    if (r.backstepStarted) events.push('backstep');
  }
  return events;
}

describe('대시 공격', () => {
  it('달리는 중 J → 대시 (32px 전진), 걷는 중 J → 1타', () => {
    const p = newPlayerState({ x: 100, y: 50 });
    ticks(p, 3, {}, { x: 1 });
    ticks(p, 3);
    ticks(p, 10, {}, { x: 1 });
    expect(p.run.running).toBe(true);
    const x0 = p.pos.x;
    expect(ticks(p, 1, { attack: true }, { x: 1 })).toEqual(['start:gs_dash']);
    ticks(p, 60, {}, { x: 1 });
    expect(p.pos.x - x0).toBeGreaterThanOrEqual(32);
    const q = newPlayerState({ x: 100, y: 50 });
    expect(ticks(q, 1, { attack: true }, { x: 1 })).toEqual(['start:gs_b1']);
  });
});

describe('백스텝 (combat.md 1장)', () => {
  it('바라보는 반대쪽으로 2.5타일, 앞 0.2초 무적, 쿨 2초', () => {
    const p = newPlayerState({ x: 100, y: 50 });
    expect(ticks(p, 1, { backstep: true })).toEqual(['backstep']);
    expect(isInvulnerable(p)).toBe(true);
    ticks(p, Math.round(PLAYER.backstep.invuln / TICK));
    expect(isInvulnerable(p)).toBe(false);
    ticks(p, 10);
    expect(p.backstep).toBeNull();
    expect(p.pos.x).toBeCloseTo(100 - PLAYER.backstep.distance);
    expect(ticks(p, 1, { backstep: true })).toEqual([]);
    ticks(p, Math.round(PLAYER.backstep.cooldown / TICK));
    expect(ticks(p, 1, { backstep: true })).toEqual(['backstep']);
  });
  it('공격 중(어느 구간이든) 불가', () => {
    const p = newPlayerState({ x: 100, y: 50 });
    ticks(p, 1, { attack: true });
    ticks(p, 20);
    expect(ticks(p, 1, { backstep: true })).toEqual([]);
  });
});

describe('스킬 쿨타임·캔슬', () => {
  it('실제 쿨 = 기준 × 1.5, windup 진입부터', () => {
    const p = newPlayerState({ x: 100, y: 50 });
    expect(ticks(p, 1, { skill: launch })).toEqual(['start:gs_launch']);
    expect(p.cooldowns.gs_launch).toBeCloseTo(launch.cooldown! * COMBAT.cooldownScale);
    ticks(p, 60);
    expect(skillReady(p, launch)).toBe(false);
    expect(ticks(p, 1, { skill: launch })).toEqual([]);
    ticks(p, Math.round((launch.cooldown! * COMBAT.cooldownScale) / TICK));
    expect(skillReady(p, launch)).toBe(true);
  });
  it('평타 recovery → 스킬 캔슬, 스킬 → 스킬 불가', () => {
    const p = newPlayerState({ x: 100, y: 50 });
    ticks(p, 1, { attack: true });
    const b1 = gs.basic[0]!.phases;
    ticks(p, Math.ceil((b1.windup + b1.active) / TICK) + 1);
    expect(ticks(p, 1, { skill: launch })).toEqual(['start:gs_launch']);
    expect(ticks(p, 1, { skill: skillDef('gs_earthsplit') })).toEqual([]);
  });
});

describe('기절 → 퇴장', () => {
  it('땅에서 체력 0: 기절, stunExitSec 뒤 퇴장', () => {
    const b = newBody(100, 0, 'light');
    applyHit(b, { dir: 1, strength: 'light' });
    b.ko = true;
    const ev: string[] = [];
    for (let t = 0; t < COMBAT.stunExitSec + 0.1; t += TICK) ev.push(...stepBody(b, TICK, 0, 1000));
    expect(ev).toEqual(['stunned', 'exit']);
    expect(b.gone).toBe(true);
  });
  it('공중에서 체력 0: 바운드·다운까지 떨어진 뒤 기절', () => {
    const b = newBody(100, 0, 'light');
    applyHit(b, { dir: 1, strength: 'medium', flags: ['launch'] });
    b.ko = true;
    const ev: string[] = [];
    for (let t = 0; t < 3; t += TICK) ev.push(...stepBody(b, TICK, 0, 1000));
    expect(ev).toEqual(['bounce', 'down', 'stunned', 'exit']);
  });
});

describe('회피 방향', () => {
  const dodge = (x: number) => {
    const p = newPlayerState({ x: 500, y: 50 });
    ticks(p, Math.ceil(PLAYER.backstep.sec / TICK) + 1, { backstep: true, x });
    return p;
  };
  it('바라보는 쪽 방향키 → 앞으로, 바라보는 방향은 그대로', () => {
    const p = dodge(1);
    expect(p.pos.x).toBeCloseTo(500 + PLAYER.backstep.distance);
    expect(p.facing).toBe(1);
  });
  it('반대쪽 방향키 → 뒤로, 방향키 없음 → 바라보는 반대쪽', () => {
    expect(dodge(-1).pos.x).toBeCloseTo(500 - PLAYER.backstep.distance);
    expect(dodge(0).pos.x).toBeCloseTo(500 - PLAYER.backstep.distance);
  });
});

describe('회피로 공격 끊기', () => {
  it('공격 중에 누르면 cancelDelay 동안 공격이 이어지고, 그 뒤 공격을 끊고 회피', () => {
    const p = newPlayerState({ x: 500, y: 50 });
    ticks(p, 1, { attack: true });
    expect(p.fighter.run).not.toBeNull();
    const delay = Math.round(PLAYER.backstep.cancelDelay / TICK);
    expect(ticks(p, delay - 1, { backstep: true })).not.toContain('backstep');
    expect(p.fighter.run).not.toBeNull();
    expect(ticks(p, 1)).toEqual(['backstep']);
    expect(p.fighter.run).toBeNull();
    expect(p.stamina).toBeCloseTo(PLAYER.stamina.max - PLAYER.stamina.dodge, 0);
  });
  it('기다리는 중에 맞으면 회피 취소', () => {
    const p = newPlayerState({ x: 500, y: 50 });
    ticks(p, 1, { attack: true });
    ticks(p, 1, { backstep: true });
    hurtPlayer(p, 10, 'light');
    expect(p.dodgeQueued).toBeNull();
  });
});

describe('대검 평타 전진 (weapons.json basicAdvance)', () => {
  const swing = (x: number) => {
    const p = newPlayerState({ x: 500, y: 50 });
    ticks(p, 30, { attack: true }, { x });
    return p.pos.x - 500;
  };
  it('바라보는 쪽 키를 누르면 초당 basicAdvance로 전진, 안 누르면 제자리', () => {
    expect(swing(1)).toBeCloseTo(gs.basicAdvance! * 30 * TICK, 0);
    expect(swing(0)).toBe(0);
    // 반대쪽 키: 돌아설 수 있는 구간(canTurn)에서 돌아선 뒤에만 그쪽으로 전진 → 끝까지 누른 것보다 짧음
    const back = swing(-1);
    expect(back).toBeLessThan(0);
    expect(back).toBeGreaterThan(-gs.basicAdvance! * 30 * TICK);
  });
});

describe('지구력', () => {
  const st = PLAYER.stamina;
  it('회피 1회 소모, 1회분이 안 되면 회피 불가', () => {
    const p = newPlayerState({ x: 500, y: 50 });
    ticks(p, 1, { backstep: true });
    expect(p.stamina).toBeCloseTo(st.max - st.dodge);
    const q = newPlayerState({ x: 500, y: 50 });
    q.stamina = st.dodge - 1;
    expect(canDodge(q)).toBe(false);
    expect(ticks(q, 1, { backstep: true })).toEqual([]);
  });
  it('달리면 초당 소모, 쓰고 regenDelay 뒤부터 회복', () => {
    const p = newPlayerState({ x: 100, y: 50 });
    ticks(p, 60, {}, { x: 1, run: true });
    expect(p.stamina).toBeCloseTo(st.max - st.runPerSec, 0);
    const left = p.stamina;
    ticks(p, Math.floor(st.regenDelay / TICK) - 1);
    expect(p.stamina).toBeCloseTo(left);
    ticks(p, 32);
    expect(p.stamina).toBeGreaterThan(left + st.regen * 0.4);
  });
  it('바닥나면 걷기, 달리기 입력을 뗐다 다시 해야 달림', () => {
    const p = newPlayerState({ x: 100, y: 50 });
    p.stamina = 1;
    ticks(p, 10, {}, { x: 1, run: true });
    expect([p.tired, p.run.running]).toEqual([true, false]);
    ticks(p, 1, {}, { x: 1, run: false });
    expect(p.tired).toBe(false);
    ticks(p, 60);
    ticks(p, 2, {}, { x: 1, run: true });
    expect([p.tired, p.run.running]).toEqual([false, true]);
  });
});
