import { describe, expect, it } from 'vitest';
import { weaponDef } from '../actions';
import { TICK } from '../constants';
import { applyHit } from '../body';
import { RoomSim, type SimEvent } from '../sim/room';
import type { PlayerInput } from '../player';
import { attackPhase } from './state';

const gs = weaponDef('greatsword');
const none: PlayerInput = { x: 0, y: 0, attack: false, skill: null, backstep: false };
const room = (w = 320, d = 112) => new RoomSim(gs, { minX: 8, maxX: w - 8, minY: 0, maxY: d }, { x: 100, y: 56 }, { rng: () => 0 });

/** sec초 진행하며 이벤트 모으기 (each: 틱마다 검사) */
function run(sim: RoomSim, sec: number, each?: () => void, input: PlayerInput = none): SimEvent[] {
  const out: SimEvent[] = [];
  for (let t = 0; t < sec; t += TICK) {
    out.push(...sim.tick(TICK, input).events);
    each?.();
  }
  return out;
}
const types = (ev: SimEvent[]) => ev.map((e) => (e.type === 'monster' ? `m:${e.e.type}` : e.type));

describe('통통버섯 (melee, hop)', () => {
  it('감지 → 튀어 다가와 깊이를 맞추고 박치기 → 플레이어 적중', () => {
    const sim = room();
    const [m] = sim.spawn([{ kind: 'mushroom', x: 160, y: 70 }]);
    const ev = run(sim, 4);
    expect(m!.aware).toBe(true);
    expect(types(ev)).toContain('m:attackStart');
    expect(types(ev)).toContain('playerHit');
    expect(Math.abs(m!.body.y - 56)).toBeLessThanOrEqual(5);
  });
  it('감지 거리 밖이면 가만히 (포자꽃 224px), 버섯은 방에 들어오면 바로 다가옴', () => {
    const sim = room(600);
    const [spore, m] = sim.spawn([{ kind: 'sporeflower', x: 400, y: 56 }, { kind: 'mushroom', x: 400, y: 30 }]);
    run(sim, 2);
    expect(spore!.aware).toBe(false);
    expect(m!.aware).toBe(true);
    expect(m!.body.x).toBeLessThan(400);
  });
  it('예고(windup) 중 맞으면 공격이 끊기고 토큰 반납', () => {
    const sim = room();
    const [m] = sim.spawn([{ kind: 'mushroom', x: 112, y: 56 }]);
    run(sim, 0.1);
    expect(attackPhase(m!)).toBe('windup');
    applyHit(m!.body, { dir: 1, strength: 'light' });
    run(sim, TICK);
    expect(m!.attack).toBeNull();
    expect(sim.tokens.used).toBe(0);
  });
});

describe('공격 토큰 (솔로 2)', () => {
  it('4마리가 둘러싸도 동시에 공격 동작(windup~active)은 2마리까지', () => {
    const sim = room();
    const ms = sim.spawn([80, 90, 110, 120].map((x, i) => ({ kind: 'mushroom', x, y: 50 + (i % 2) * 12 })));
    let most = 0;
    run(sim, 6, () => {
      most = Math.max(most, ms.filter((m) => ['windup', 'active'].includes(attackPhase(m) ?? '')).length);
    });
    expect(most).toBe(2);
  });
});

describe('아기 멧돼지 (charger)', () => {
  it('깊이를 맞추고 돌진, 벽에 부딪히면 1초 어지러움', () => {
    const sim = room();
    const [m] = sim.spawn([{ kind: 'boar', x: 100, y: 70 }]);
    sim.player.pos = { x: 20, y: 56 };
    const ev: SimEvent[] = [];
    let dizzy = false;
    ev.push(...run(sim, 5, () => { dizzy ||= m!.mode === 'selfStun'; }, { ...none }));
    expect(types(ev)).toContain('m:attackStart');
    expect(types(ev)).toContain('m:wallHit');
    expect(dizzy).toBe(true);
  });
});

describe('포자꽃 (turret, 투사체)', () => {
  it('깊이가 맞으면 포자탄 발사 → 날아가 플레이어 적중, 고정형이라 이동 없음', () => {
    const sim = room();
    const [m] = sim.spawn([{ kind: 'sporeflower', x: 180, y: 60 }]);
    const ev = run(sim, 3);
    expect(types(ev)).toContain('m:shoot');
    expect(ev.some((e) => e.type === 'playerHit' && e.def.id === 'spore_shot')).toBe(true);
    expect(m!.body.x).toBe(180);
  });
  it('깊이가 달라도 플레이어 쪽으로 비스듬히 쏴 맞힘', () => {
    const sim = room();
    sim.spawn([{ kind: 'sporeflower', x: 180, y: 100 }]);
    let dy = 0;
    const ev = run(sim, 3, () => { dy ||= sim.projectiles[0]?.dy ?? 0; });
    expect(dy).toBeLessThan(0);
    expect(ev.some((e) => e.type === 'playerHit' && e.def.id === 'spore_shot')).toBe(true);
  });
  it('백스텝 무적이면 맞지 않음', () => {
    const sim = room();
    sim.spawn([{ kind: 'sporeflower', x: 120, y: 56 }]);
    sim.player.backstep = { t: 0, dir: -1, dy: 0 };
    const ev = run(sim, 0.15);
    expect(ev.some((e) => e.type === 'playerHit')).toBe(false);
  });
});

describe('갓버섯 기사 (정예, 공격 중 슈퍼아머)', () => {
  it('예고 중 맞아도 경직 없이 계속 공격', () => {
    const sim = room();
    const [m] = sim.spawn([{ kind: 'capknight', x: 124, y: 56 }]);
    run(sim, 0.2);
    expect(attackPhase(m!)).toBe('windup');
    expect(m!.body.armor).toBe(true);
    applyHit(m!.body, { dir: 1, strength: 'heavy' });
    run(sim, TICK);
    expect(m!.body.state).toBe('idle');
    expect(attackPhase(m!)).toBe('windup');
  });
});

describe('졸린 이끼곰 (boss loop)', () => {
  it('순서대로 앞발 → 땅울림 → 앞발 → 가시 → 구르기, 벽에 부딪히면 그로기(슈퍼아머 해제)', () => {
    const sim = room(448, 144);
    const [m] = sim.spawn([{ kind: 'mossbear', x: 140, y: 56 }]);
    const starts: string[] = [];
    let groggy = false;
    run(sim, 20, () => {
      sim.player.hp = sim.player.maxHp;
      if (m!.mode === 'groggy') groggy = true;
    }).forEach((e) => { if (e.type === 'monster' && e.e.type === 'attackStart') starts.push(e.e.def.id); });
    expect(starts.slice(0, 5)).toEqual(['bear_paw', 'bear_quake', 'bear_paw', 'bear_thorns', 'bear_roll']);
    expect(groggy).toBe(true);
  });
  it('체력 50% 미만이면 다음 단계 (하품 → 졸음 구름 장판)', () => {
    const sim = room(448, 144);
    const [m] = sim.spawn([{ kind: 'mossbear', x: 140, y: 56 }]);
    m!.hp = m!.def.hp * 0.4;
    const ev = run(sim, 12);
    expect(m!.loop.phase).toBe(1);
    expect(types(ev)).toContain('m:zone');
  });
  it('가시: 부채꼴로 5발을 한 번에 (깊이 방향이 서로 다름)', () => {
    const sim = room(448, 144);
    const [m] = sim.spawn([{ kind: 'mossbear', x: 140, y: 56 }]);
    m!.loop.index = 3;
    let thorns: typeof sim.projectiles = [];
    run(sim, 3, () => {
      if (!thorns.length) thorns = sim.projectiles.filter((p) => p.def.id === 'bear_thorns');
    });
    expect(thorns).toHaveLength(5);
    expect(new Set(thorns.map((p) => p.dy.toFixed(3))).size).toBe(5);
  });
  it('체력 25% 미만: 3단계, 구르기는 벽에 한 번 튕긴 뒤 그로기', () => {
    const sim = room(448, 144);
    const [m] = sim.spawn([{ kind: 'mossbear', x: 140, y: 56 }]);
    m!.hp = m!.def.hp * 0.2;
    m!.loop = { phase: 2, index: 4 };
    const walls: boolean[] = [];
    let groggy = false;
    run(sim, 12, () => {
      sim.player.hp = sim.player.maxHp;
      if (m!.mode === 'groggy') groggy = true;
    }).forEach((e) => { if (e.type === 'monster' && e.e.type === 'wallHit') walls.push(e.e.groggy); });
    expect(walls.slice(0, 2)).toEqual([false, true]);
    expect(groggy).toBe(true);
  });
});
