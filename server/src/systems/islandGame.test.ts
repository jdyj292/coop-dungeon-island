import { ISLAND, spawnPos } from '@game/shared';
import { describe, expect, it } from 'vitest';
import { islandBus } from './islandBus';
import { IslandGame } from './islandGame';

const make = () => {
  const sent: [string, string, unknown][] = [];
  const g = new IslandGame('모리의 섬', 120, [{ id: '1', name: '모리', color: 0 }, { id: '2', name: '카이', color: 1 }], {
    send: (id, type, msg) => sent.push([id, type, msg]), broadcast: () => {},
  });
  return { g, sent };
};

describe('IslandGame', () => {
  it('던전에서 막 나왔으면 우물 앞, 시간이 지났거나 다시 접속하면 선착장 (island.md 2장)', () => {
    const { g } = make();
    islandBus.returned(99, ['1']);
    islandBus.returned(99, ['2'], Date.now() - ISLAND.returnWindowSec * 1000 - 1);
    g.join('1');
    g.join('2');
    expect(g.state.residents.get('1')!.y).toBe(Math.round(spawnPos(0, 'return').y));
    expect(g.state.residents.get('2')!.y).toBe(Math.round(spawnPos(1, 'login').y));
    g.leave('1');
    g.join('1');
    expect(g.state.residents.get('1')!.y).toBe(Math.round(spawnPos(1, 'login').y));
  });

  it('주민은 접속 전엔 away, 들어오면 선착장 자리, 나가면 away', () => {
    const { g } = make();
    expect(g.state.residents.get('1')!.status).toBe('away');
    g.join('1');
    g.join('2');
    const a = g.state.residents.get('1')!, b = g.state.residents.get('2')!;
    expect([a.online, a.status, a.x]).toEqual([true, 'island', Math.round(spawnPos(0).x)]);
    expect(b.x).toBe(Math.round(spawnPos(1).x));
    g.leave('2');
    expect([b.online, b.status]).toEqual([false, 'away']);
  });

  it('입력을 60Hz로 적용, 마지막 입력 번호·상태를 상태에 반영. 오래된 seq는 무시', () => {
    const { g } = make();
    g.join('1');
    const x0 = g.state.residents.get('1')!.x;
    g.onMessage('1', 'input', { seq: 5, t: 0, mx: 1, my: 0, run: false });
    g.onMessage('1', 'input', { seq: 4, t: 0, mx: -1, my: 0, run: false });
    for (let i = 0; i < 30; i++) g.tick();
    const r = g.state.residents.get('1')!;
    expect(r.x).toBeGreaterThan(x0);
    expect([r.state, r.lastInputSeq, r.facing]).toEqual(['walk', 5, 1]);
    g.onMessage('1', 'input', { seq: 6, t: 0, mx: 0, my: 0, run: false });
    g.tick();
    expect(r.state).toBe('idle');
  });

  it('잘못된 메시지는 무시, ping엔 pong, 접속 안 한 주민 메시지는 무시', () => {
    const { g, sent } = make();
    g.join('1');
    g.onMessage('1', 'input', { seq: 1, mx: 5 });
    g.onMessage('2', 'input', { seq: 1, t: 0, mx: 1, my: 0, run: false });
    g.onMessage('1', 'ping', { t: 42 });
    expect(sent).toEqual([['1', 'pong', { t: 42, server: 0 }]]);
  });

  it('입력을 너무 많이 보내면 끊는다', () => {
    const { g } = make();
    g.join('1');
    let kicked = false;
    for (let i = 1; i < 200 && !kicked; i++) kicked = g.onMessage('1', 'input', { seq: i, t: 0, mx: 1, my: 0, run: false }) === 'kick';
    expect(kicked).toBe(true);
  });

  it('새 주민 추가', () => {
    const { g } = make();
    g.addResident({ id: '3', name: '새', color: 2 });
    expect(g.state.residents.size).toBe(3);
  });
});
