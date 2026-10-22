import { describe, expect, it } from 'vitest';
import { DungeonGame } from './dungeonGame';

function game(party = 2) {
  let closed = false;
  const g = new DungeonGame({ room: 1, partySize: party, rng: () => 0 }, { broadcast: () => {}, send: () => {}, close: () => { closed = true; } });
  g.join('a', 'A');
  if (party > 1) g.join('b', 'B');
  return { g, closed: () => closed };
}
const ticks = (g: DungeonGame, sec: number) => { for (let i = 0; i < sec * 60; i++) g.tick(); };

describe('접속 끊김 (network.md 10장)', () => {
  it('파티원 끊김: 30초 대기, 제자리·무적·대상 제외, 상태 disconnected', () => {
    const { g } = game();
    expect(g.disconnect('b')).toBe(30);
    const b = g.sim.players.get('b')!;
    const pos = { ...b.state.pos };
    ticks(g, 1);
    expect(g.state.players.get('b')!.state).toBe('disconnected');
    expect(b.state.pos).toEqual(pos);
    expect(g.sim.playerTargets().map((t) => t.pid)).toEqual(['a']);
  });
  it('30초 안에 재접속하면 그대로, 지나면 이탈·남은 인원으로 체력 재계산 (비율 유지)', () => {
    const { g } = game();
    g.disconnect('b');
    ticks(g, 10);
    g.reconnect('b');
    expect(g.sim.players.get('b')!.away).toBe(false);
    const m = g.sim.alive[0]!;
    m.hp = m.maxHp / 2;
    g.disconnect('b');
    ticks(g, 31);
    expect(g.state.players.has('b')).toBe(false);
    expect(g.state.partySize).toBe(1);
    expect([m.maxHp, m.hp]).toEqual([60, 30]);
    expect(g.dropped.at(-1)?.kind).toBe('wipe');
  });
  it('솔로 끊김: 세계가 멈추고 60초 대기, 지나면 방 종료', () => {
    const { g, closed } = game(1);
    expect(g.disconnect('a')).toBe(60);
    const t0 = g.state.serverTime, m = g.sim.alive[0]!, x = m.body.x;
    ticks(g, 30);
    expect(g.state.serverTime).toBeGreaterThan(t0);
    expect(m.body.x).toBe(x);
    g.reconnect('a');
    ticks(g, 1);
    g.disconnect('a');
    ticks(g, 61);
    expect(closed()).toBe(true);
  });
  it('전원 끊김: 60초 대기 뒤 방 종료', () => {
    const { g, closed } = game();
    g.disconnect('a');
    g.disconnect('b');
    ticks(g, 45);
    expect(closed()).toBe(false);
    ticks(g, 16);
    expect(closed()).toBe(true);
  });
  it('스스로 나가면 바로 이탈', () => {
    const { g } = game();
    g.leave('b');
    expect([g.state.players.size, g.state.partySize]).toEqual([1, 1]);
  });
});
