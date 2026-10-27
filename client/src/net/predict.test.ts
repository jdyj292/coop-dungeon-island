import { describe, expect, it } from 'vitest';
import { newPlayerState, RoomSim, SOLO_PID, stepPlayerState, TICK, weaponDef, type PlayerInput } from '@game/shared';
import { Predictor } from './predict';

const gs = weaponDef('greatsword');
const bounds = { minX: 8, maxX: 600, minY: 0, maxY: 112 };
const idle: PlayerInput = { x: 0, y: 0, run: false, attack: false, skill: null, backstep: false, potion: null };

/**
 * 가짜 서버로 걷기: 클라이언트는 입력이 바뀔 때 + 3틱(20Hz)마다 seq를 보내고, 서버는 받은 마지막 이동을 매 틱 적용.
 * 한 방향 지연 oneWay틱, 서버 패치는 3틱마다. 보정 기록을 돌려준다
 */
function walk(oneWay: number, moves: number[]) {
  const pr = new Predictor(gs, bounds, { x: 100, y: 50 });
  const server = newPlayerState({ x: 100, y: 50 });
  let seq = 0, lastSent = { x: 0 }, since = 0, serverSeq = 0, serverMove = 0;
  const toServer: { at: number; seq: number; x: number }[] = [];
  const toClient: { at: number; state: ReturnType<typeof newPlayerState>; seq: number }[] = [];
  const log: { mode: string; error: number }[] = [];
  moves.forEach((x, tick) => {
    since++;
    if (x !== lastSent.x || (x && since >= 3)) {
      toServer.push({ at: tick + oneWay, seq: ++seq, x });
      lastSent = { x };
      since = 0;
    }
    pr.tick({ ...idle, x }, TICK, seq);
    // 서버 틱
    for (const m of toServer.filter((m) => m.at === tick)) [serverSeq, serverMove] = [m.seq, m.x];
    stepPlayerState(server, gs, { ...idle, x: serverMove }, TICK, bounds);
    if (tick % 3 === 0) toClient.push({ at: tick + oneWay, state: structuredClone(server), seq: serverSeq });
    for (const m of toClient.filter((m) => m.at === tick)) log.push(pr.reconcile(m.state, m.seq, TICK));
  });
  return { pr, server, log };
}

describe('Predictor (network.md 7장)', () => {
  it('지연 100ms 걷기: 보정은 작고(부드럽게 이하), 멈추면 서버 위치로 모인다', () => {
    const moves = [...Array<number>(120).fill(1), ...Array<number>(60).fill(0)];
    const { pr, server, log } = walk(3, moves);
    expect(log.length).toBeGreaterThan(30);
    expect(log.every((l) => l.mode !== 'snap')).toBe(true);
    expect(Math.max(...log.map((l) => l.error))).toBeLessThan(6);
    expect(Math.abs(pr.display.x - server.pos.x)).toBeLessThan(0.5);
  });
  it('2px 이하 무시, 2~24px 부드럽게(화면은 제자리에서 출발), 24px 초과 즉시', () => {
    const pr = new Predictor(gs, bounds, { x: 100, y: 50 });
    expect(pr.reconcile(newPlayerState({ x: 101, y: 50 }), 0, TICK).mode).toBe('ignore');
    expect(pr.display.x).toBe(100);
    expect(pr.reconcile(newPlayerState({ x: 110, y: 50 }), 0, TICK).mode).toBe('smooth');
    expect(pr.display.x).toBe(100);
    for (let i = 0; i < 6; i++) pr.tick(idle, TICK, 0);
    expect(pr.display.x).toBeCloseTo(110);
    expect(pr.reconcile(newPlayerState({ x: 200, y: 50 }), 0, TICK).mode).toBe('snap');
    expect(pr.display.x).toBe(200);
  });
  it('공격은 바로 windup, 서버가 거절하면 취소하고 다시 적용할 때도 빠진다', () => {
    const pr = new Predictor(gs, bounds, { x: 100, y: 50 });
    pr.tick({ ...idle, attack: true }, TICK, 5, 5);
    expect(pr.state.fighter.run?.def.id).toBe('gs_b1');
    pr.reject(5);
    expect(pr.state.fighter.run).toBeNull();
    pr.reconcile(newPlayerState({ x: 130, y: 50 }), 4, TICK);
    expect(pr.state.fighter.run).toBeNull();
  });
  it('맞는 것은 서버를 따른다: 경직이면 행동 취소, 서버 쪽 HP 반영', () => {
    const pr = new Predictor(gs, bounds, { x: 100, y: 50 });
    pr.tick({ ...idle, attack: true }, TICK, 1, 1);
    const s = newPlayerState({ x: 100, y: 50 });
    Object.assign(s, { hp: 940, hurt: { kind: 'stun', left: 0.2 } });
    pr.reconcile(s, 1, TICK);
    expect([pr.state.hp, pr.state.hurt?.kind, pr.state.fighter.run]).toEqual([940, 'stun', null]);
  });
  it('히트스톱: 멈춘 동안 행동이 진행되지 않고, 그때 누른 평타는 멈춤 뒤 이어진다', () => {
    const pr = new Predictor(gs, bounds, { x: 100, y: 50 });
    pr.tick({ ...idle, attack: true }, TICK, 1, 1);
    for (let i = 0; i < 8; i++) pr.tick(idle, TICK, 1);
    const t = pr.state.fighter.run!.t;
    pr.stop(0.05);
    pr.tick({ ...idle, attack: true }, TICK, 2, 2);
    pr.tick(idle, TICK, 2);
    expect(pr.state.fighter.run!.t).toBe(t);
    for (let i = 0; i < 3; i++) pr.tick(idle, TICK, 2);
    expect(pr.state.fighter.queued).toBe(true);
  });
  it('대시 적중 역경직: 지연이 있어도 화면이 뒤로 갔다 앞으로 가지 않고, 서버와 같은 자리에서 끝난다', () => {
    for (const oneWay of [1, 3, 6]) {
      const { xs, server } = dashInto(oneWay);
      const back = xs.findIndex((x, i) => i > 0 && x < xs[i - 1]! - 0.01);
      expect(back).toBe(-1);
      expect(xs[xs.length - 1]).toBeCloseTo(server, 0);
    }
  });
});

/** 달리다 J(대시)로 버섯을 맞힘: 서버 RoomSim(개체별 히트스톱) + Predictor, 한 방향 지연 oneWay틱. 화면 x 기록 */
function dashInto(oneWay: number) {
  const sim = new RoomSim(gs, { minX: 8, maxX: 800, minY: 0, maxY: 112 }, { x: 100, y: 50 }, { rng: () => 0.5, hitstop: 'entity', ai: false });
  sim.spawn([{ kind: 'mushroom', x: 165, y: 50 }]);
  const pr = new Predictor(gs, { minX: 8, maxX: 800, minY: 0, maxY: 112 }, { x: 100, y: 50 });
  const toServer: { at: number; seq: number; input: PlayerInput }[] = [];
  const toClient: { at: number; run: () => void }[] = [];
  let serverSeq = 0, serverIn = idle, hits = 0;
  const xs: number[] = [];
  for (let tick = 0; tick < 120; tick++) {
    // 70틱부터 멈춤 (끝 위치 비교용)
    const input = { ...idle, x: tick < 70 ? 1 : 0, run: tick >= 5 && tick < 70, attack: tick === 30 };
    toServer.push({ at: tick + oneWay, seq: tick + 1, input });
    for (const m of toClient.filter((m) => m.at === tick)) m.run();
    pr.tick(input, TICK, tick + 1, input.attack ? tick + 1 : null);
    let press = false;
    for (const m of toServer.filter((m) => m.at === tick)) [serverSeq, serverIn, press] = [m.seq, m.input, press || m.input.attack];
    const { events } = sim.step(TICK, new Map([[SOLO_PID, { ...serverIn, attack: press }]]));
    for (const e of events) {
      if (e.type !== 'hit') continue;
      hits++;
      toClient.push({ at: tick + oneWay, run: () => pr.stop(e.recoil, e.act, e.actT) });
    }
    if (tick % 3 === 0) {
      const [state, seq] = [structuredClone(sim.player), serverSeq];
      toClient.push({ at: tick + oneWay, run: () => pr.reconcile(state, seq, TICK) });
    }
    xs.push(pr.display.x);
  }
  expect(hits).toBeGreaterThan(0);
  return { xs, server: sim.player.pos.x };
}
