import { describe, expect, it } from 'vitest';
import { weaponDef } from '../actions';
import { TICK } from '../constants';
import { gradeTiming } from '../hit';
import type { PlayerInput } from '../player';
import { PositionHistory } from './history';
import { RoomSim, SOLO_PID } from './room';

const gs = weaponDef('greatsword');
const bounds = { minX: 0, maxX: 1000, minY: 0, maxY: 100 };
const none: PlayerInput = { x: 0, y: 0, attack: false, skill: null, backstep: false };
const room = (hitstop: 'none' | 'entity' = 'none') => new RoomSim(gs, bounds, { x: 100, y: 50 }, { ai: false, hitstop });
const run = (sim: RoomSim, n: number, input = none) => {
  const ev = [];
  for (let i = 0; i < n; i++) ev.push(...sim.tick(TICK, input).events);
  return ev;
};

describe('PositionHistory', () => {
  it('두 기록 사이 보간, 범위 밖은 가까운 기록, 300ms 넘은 기록은 버림', () => {
    const h = new PositionHistory();
    h.record(1, new Map([[1, { x: 0, y: 0, z: 0, airborne: false }]]));
    h.record(1.1, new Map([[1, { x: 10, y: 0, z: 0, airborne: true }]]));
    expect(h.at(1, 1.05)!.x).toBeCloseTo(5);
    expect(h.at(1, 0.5)!.x).toBe(0);
    expect(h.at(1, 2)!.x).toBe(10);
    h.record(1.5, new Map([[1, { x: 50, y: 0, z: 0, airborne: false }]]));
    expect(h.at(1, 1)!.x).toBe(50);
    expect(h.at(2, 1)).toBeUndefined();
  });
});

describe('되감기 판정 (network.md 9장)', () => {
  /** 평타 준비(windup) 동안 사거리 안(114)에 있던 버섯이 active 직전에 사거리 밖(200)으로 순간 이동 */
  function swingWhileLeaving(rewind: number) {
    const sim = room();
    const [m] = sim.spawn([{ kind: 'mushroom', x: 114, y: 50 }]);
    sim.players.get(SOLO_PID)!.rewind = rewind;
    let hits = sim.tick(TICK, { ...none, attack: true }).events.filter((e) => e.type === 'hit').length;
    while (sim.player.fighter.run!.t < gs.basic[0]!.phases.windup - TICK) sim.tick(TICK, none);
    m!.body.x = 200;
    hits += run(sim, 40).filter((e) => e.type === 'hit').length;
    return hits;
  }
  it('되감기 없으면 지금 위치라 빗나감, 0.1초 되감으면 플레이어가 본 자리에서 맞음', () => {
    expect(swingWhileLeaving(0)).toBe(0);
    expect(swingWhileLeaving(0.1)).toBe(1);
  });
});

describe('히트스톱 동기화 (entity)', () => {
  it('공격자·대상만 멈추고, 솔로(none)는 멈추지 않음', () => {
    for (const mode of ['none', 'entity'] as const) {
      const sim = room(mode);
      const [m, other] = sim.spawn([{ kind: 'mushroom', x: 114, y: 50 }, { kind: 'mushroom', x: 400, y: 50 }]);
      other!.body.state = 'air';
      other!.body.vz = 100;
      other!.body.z = 10;
      let t0 = -1;
      for (let i = 0; i < 40 && t0 < 0; i++) if (sim.tick(TICK, { ...none, attack: i === 0 }).events.some((e) => e.type === 'hit')) t0 = sim.player.fighter.run!.t;
      const mx = m!.body.x, oz = other!.body.z;
      run(sim, 2);
      const frozen = sim.player.fighter.run!.t === t0 && m!.body.x === mx;
      expect(frozen).toBe(mode === 'entity');
      expect(other!.body.z).not.toBe(oz);
    }
  });
  it('멈춘 동안 누른 다음 평타는 멈춤이 끝난 뒤 이어진다', () => {
    const sim = room('entity');
    sim.spawn([{ kind: 'mushroom', x: 114, y: 50 }]);
    let hitAt = -1;
    for (let i = 0; i < 40 && hitAt < 0; i++) if (sim.tick(TICK, { ...none, attack: i === 0 }).events.some((e) => e.type === 'hit')) hitAt = i;
    sim.tick(TICK, { ...none, attack: true }); // 멈춘 동안 누름
    run(sim, Math.ceil((gradeTiming(gs.basic[0]!.fx!.grade).hitstop * (gs.recoilMul ?? 1)) / TICK) + 1); // 근접 역경직만큼
    expect(sim.player.fighter.queued).toBe(true);
  });
  it('근접 역경직: 대검은 히트스톱 × recoilMul, 맞은 몬스터도 같은 시간 멈춤', () => {
    const sim = room('entity');
    const [m] = sim.spawn([{ kind: 'mushroom', x: 114, y: 50 }]);
    let hit: { recoil: number } | undefined;
    for (let i = 0; i < 40 && !hit; i++) hit = sim.tick(TICK, { ...none, attack: i === 0 }).events.find((e) => e.type === 'hit');
    const sec = gradeTiming(gs.basic[0]!.fx!.grade).hitstop;
    expect(gs.recoilMul).toBeGreaterThan(1);
    expect(hit!.recoil).toBeCloseTo(sec * gs.recoilMul!);
    expect(sim.players.get(SOLO_PID)!.stop).toBeGreaterThan(sec);
    const mx = m!.body.x;
    run(sim, Math.floor(hit!.recoil / TICK) - 1);
    expect(m!.body.x).toBe(mx); // 표 값(sec)만큼만 멈췄다면 이미 밀려남
    run(sim, 3);
    expect(m!.body.x).not.toBe(mx);
  });
});

describe('백스텝 소급 무적', () => {
  it('입력 시각 뒤 100ms 안의 피격은 취소, 밖이면 그대로', () => {
    for (const [back, restored] of [[0.05, true], [0.2, false]] as const) {
      const sim = new RoomSim(gs, bounds, { x: 100, y: 50 }, { rng: () => 0 });
      sim.spawn([{ kind: 'mushroom', x: 120, y: 50 }]);
      let hitT = -1;
      for (let i = 0; i < 600 && hitT < 0; i++) if (sim.tick(TICK, none).events.some((e) => e.type === 'playerHit')) hitT = sim.time;
      expect(sim.player.hp).toBeLessThan(sim.player.maxHp);
      expect(sim.cancelHitsSince(SOLO_PID, hitT - back) > 0).toBe(restored);
      expect(sim.player.hp === sim.player.maxHp).toBe(restored);
      if (restored) expect(sim.player.hurt).toBeNull();
    }
  });
});
