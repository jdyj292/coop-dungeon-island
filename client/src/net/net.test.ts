import { describe, expect, it } from 'vitest';
import { COMBAT, PLAYER, weaponDef } from '@game/shared';
import { ServerClock } from './clock';
import type { MonsterSnap, PlayerSnap } from './connection';
import { SnapshotBuffer, type Pos } from './interp';
import { mirrorMonster, mirrorPlayer, playerAction } from './mirror';

describe('ServerClock (network.md 2장)', () => {
  it('왕복 절반을 더해 offset 추정, 평균', () => {
    let now = 1000;
    const c = new ServerClock(() => now);
    c.hint(5000);
    expect(c.serverNow()).toBe(5000);
    now = 1100;
    c.onPong(1000, 6000); // 왕복 100ms → 서버 시각은 지금 6050
    expect(c.serverNow()).toBe(6050);
    c.onPong(1080, 6040); // 왕복 20ms → 6050
    expect(c.serverNow()).toBe(6050);
  });
});

describe('SnapshotBuffer (network.md 8장)', () => {
  const snap = (t: number, x: number) => ({ t, items: new Map<string, Pos & { s: string }>([['a', { x, y: 0, z: 0, s: `t${t}` }]]) });
  it('두 스냅샷 사이 보간, 다른 값은 앞 스냅샷 것', () => {
    const b = new SnapshotBuffer<Pos & { s: string }>();
    b.push(snap(0, 0));
    b.push(snap(50, 10));
    expect(b.sample(25).get('a')).toEqual({ x: 5, y: 0, z: 0, s: 't0' });
  });
  it('마지막 뒤는 속도로 외삽, 최대 200ms', () => {
    const b = new SnapshotBuffer<Pos & { s: string }>();
    b.push(snap(0, 0));
    b.push(snap(50, 10));
    expect(b.sample(100).get('a')!.x).toBe(20);
    expect(b.sample(1000).get('a')!.x).toBe(50);
  });
  it('같은·옛 시각 패치는 무시, 첫 스냅샷 전 시점은 첫 값', () => {
    const b = new SnapshotBuffer<Pos & { s: string }>();
    b.push(snap(50, 10));
    b.push(snap(50, 99));
    b.push(snap(20, 99));
    expect(b.sample(0).get('a')!.x).toBe(10);
  });
});

describe('mirror: 스냅샷 → 그리기 객체', () => {
  const ps: PlayerSnap = {
    id: 'a', name: 'A', x: 50, y: 40, z: 0, facing: -1, state: 'action', since: 900, actionId: 'gs_b2', actionStart: 1000, hp: 800, maxHp: 1000, ult: 3, lastInputSeq: 0, reviveProgress: 0, color: 0,
  };
  it('행동 id → 평타 단계·대시·스킬', () => {
    const w = weaponDef('greatsword');
    expect(playerAction(w, 'gs_b2')).toMatchObject({ kind: 'basic', step: 1 });
    expect(playerAction(w, w.dash.id)).toMatchObject({ kind: 'dash' });
    expect(playerAction(w, 'gs_launch')).toMatchObject({ kind: 'skill' });
    expect(playerAction(w, 'nope')).toBeNull();
  });
  it('플레이어: 행동 진행 시간, 본인 전용 값(쿨타임은 지금 기준 남은 초)', () => {
    const p = mirrorPlayer(ps, 1100, 'greatsword', { mp: 70, cooldowns: new Map([['gs_launch', 3000]]), potionHp: 2, potionMp: 1, feathers: 0 }, 1500);
    expect(p.fighter.run).toMatchObject({ kind: 'basic', step: 1 });
    expect(p.fighter.run!.t).toBeCloseTo(0.1);
    expect([p.facing, p.hp, p.mp, p.potions.hp, p.cooldowns.gs_launch]).toEqual([-1, 800, 70, 2, 1.5]);
  });
  it('플레이어: 백스텝·다운·쓰러짐', () => {
    expect(mirrorPlayer({ ...ps, state: 'backstep', actionId: '' }, 1000, 'greatsword').backstep!.t).toBeCloseTo(0.1);
    expect(mirrorPlayer({ ...ps, state: 'down' }, 1400, 'greatsword').hurt).toEqual({ kind: 'down', left: PLAYER.hurt.downSec - 0.5 });
    expect(mirrorPlayer({ ...ps, state: 'knocked' }, 1000, 'greatsword').downed).toBe(true);
  });
  const ms: MonsterSnap = {
    id: '3', type: 'mushroom', x: 100, y: 50, z: 8, facing: -1, state: 'airborne', since: 0, actionId: '', actionStart: 0, hpRatio: 128, superArmor: false,
  };
  it('몬스터: 공중·기절 타이머·공격 구간·체력, 같은 객체 재사용', () => {
    const m = mirrorMonster(ms, 100);
    expect([m.id, m.body.state, m.body.z, m.hp]).toEqual([3, 'air', 8, 30]);
    const again = mirrorMonster({ ...ms, state: 'stunned', since: 0 }, 200, m);
    expect(again).toBe(m);
    expect(m.body.timer).toBeCloseTo(COMBAT.stunExitSec - 0.2);
    const atk = m.def.attacks[0]!;
    mirrorMonster({ ...ms, state: 'action', actionId: atk.id, actionStart: 1000 }, 1050, m);
    expect([m.mode, m.attack!.def.id]).toEqual(['attack', atk.id]);
    expect(m.attack!.t).toBeCloseTo(0.05);
  });
});
