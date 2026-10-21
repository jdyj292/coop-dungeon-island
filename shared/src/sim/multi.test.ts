import { describe, expect, it } from 'vitest';
import { weaponDef } from '../actions';
import { TICK } from '../constants';
import { newMonster } from '../monster/state';
import { newPlayerState, type PlayerInput } from '../player';
import { chooseTarget } from './aim';
import { RoomSim, type SimEvent } from './room';

const gs = weaponDef('greatsword');
const bounds = { minX: 8, maxX: 400, minY: 0, maxY: 112 };
const none: PlayerInput = { x: 0, y: 0, attack: false, skill: null, backstep: false };
/** 2인 방: p1(100), p2(300) */
function duo(ai = true) {
  const sim = new RoomSim(gs, bounds, null, { partySize: 2, ai, rng: () => 0 });
  sim.addPlayer('p1', { x: 100, y: 56 });
  sim.addPlayer('p2', { x: 300, y: 56 });
  return sim;
}
function run(sim: RoomSim, sec: number, inputs: Record<string, PlayerInput> = {}): SimEvent[] {
  const out: SimEvent[] = [];
  for (let t = 0; t < sec; t += TICK) out.push(...sim.step(TICK, new Map(Object.entries(inputs))).events);
  return out;
}
const ps = (sim: RoomSim, pid: string) => sim.players.get(pid)!.state;

describe('여러 명 RoomSim', () => {
  it('플레이어마다 자기 입력으로 움직임 (없는 입력 = 정지)', () => {
    const sim = duo(false);
    run(sim, 0.5, { p1: { ...none, x: 1 } });
    expect(ps(sim, 'p1').pos.x).toBeGreaterThan(100);
    expect(ps(sim, 'p2').pos.x).toBe(300);
  });
  it('적중 이벤트에 공격자 id, 콤보는 각자', () => {
    const sim = duo(false);
    sim.spawn([{ kind: 'mushroom', x: 314, y: 56 }]);
    const ev = run(sim, 0.7, { p2: { ...none, attack: true } });
    const hits = ev.filter((e) => e.type === 'hit');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((e) => e.pid === 'p2')).toBe(true);
    expect(sim.players.get('p2')!.combo.count).toBe(hits.length);
    expect(sim.players.get('p1')!.combo.count).toBe(0);
  });
  it('몬스터는 가까운 플레이어를 노리고 그 사람만 맞음', () => {
    const sim = duo();
    sim.spawn([{ kind: 'mushroom', x: 280, y: 56 }]);
    const ev = run(sim, 4);
    const hit = ev.filter((e) => e.type === 'playerHit');
    expect(hit.length).toBeGreaterThan(0);
    expect(hit.every((e) => e.pid === 'p2')).toBe(true);
    expect(ps(sim, 'p1').hp).toBe(ps(sim, 'p1').maxHp);
  });
  it('한 공격 판정에 든 플레이어는 모두 한 번씩 맞음', () => {
    const sim = duo();
    ps(sim, 'p2').pos = { x: 104, y: 56 };
    sim.spawn([{ kind: 'mushroom', x: 130, y: 56 }]);
    const ev = run(sim, 4);
    const first = ev.filter((e) => e.type === 'playerHit').slice(0, 2).map((e) => (e as { pid: string }).pid).sort();
    expect(first).toEqual(['p1', 'p2']);
  });
});

describe('대상 선택 chooseTarget (dungeon.md 3장)', () => {
  const m = newMonster(1, 'mushroom', 100, 56);
  const a = { pid: 'a', state: newPlayerState({ x: 140, y: 56 }) };
  const b = { pid: 'b', state: newPlayerState({ x: 60, y: 50 }) };
  it('가장 가까운 플레이어', () => {
    expect(chooseTarget(m, [a, b], undefined)).toBe('a');
  });
  it('무적·쓰러짐은 빼고, 모두 그렇다면 가장 가까운 사람', () => {
    const down = { pid: 'a', state: { ...a.state, downed: true } };
    expect(chooseTarget(m, [down, b], undefined)).toBe('b');
    expect(chooseTarget(m, [down], undefined)).toBe('a');
  });
  it('공격 중에는 대상을 바꾸지 않음', () => {
    const atk = { ...m, attack: { def: m.def.attacks[0]!, t: 0, dir: 1, struck: [] } };
    expect(chooseTarget(atk, [a, b], 'b')).toBe('b');
    expect(chooseTarget(m, [a, b], 'b')).toBe('a');
  });
});
