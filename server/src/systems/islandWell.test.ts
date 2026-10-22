// 우물 출발: 우물 앞에서만 합류, 최대 인원, 대기 시작자만 출발, 혼자면 바로·여럿이면 카운트다운, 끊기면 빠짐, 탐험 중 상태
import { footOf, ISLAND, TILE } from '@game/shared';
import { describe, expect, it } from 'vitest';
import { islandBus } from './islandBus';
import { IslandGame } from './islandGame';

const well = ISLAND.facilities.find((f) => f.id === 'well')!;
const front = { x: footOf(well).x, y: (well.y + well.h) * TILE + TILE / 2 };

function make() {
  const sent: [string, string, unknown][] = [], departed: [string[], string][] = [];
  const g = new IslandGame('섬', 0, [], { send: (id, t, m) => sent.push([id, t, m]), broadcast: () => {} }, {
    onDepart: (ids, floor) => departed.push([ids, floor]),
  });
  const enter = (id: string, atWell = true) => {
    g.addResident({ id, name: id, color: 0 });
    g.join(id);
    if (atWell) g.walkerOf(id)!.pos = { ...front };
  };
  const fails = (id: string) => sent.filter(([to, t]) => to === id && t === 'wellFail').map(([, , m]) => (m as { reason: string }).reason);
  return { g, enter, departed, fails };
}

describe('우물 출발', () => {
  it('혼자면 출발 즉시, 주민은 탐험 중', () => {
    const { g, enter, departed } = make();
    enter('a');
    g.onMessage('a', 'well', { op: 'join' });
    expect([...g.state.well.members]).toEqual(['a']);
    g.onMessage('a', 'well', { op: 'depart' });
    expect(departed).toEqual([[['a'], 'floor1']]);
    expect(g.state.residents.get('a')!.status).toBe('dungeon:1');
    expect(g.state.well.members.length).toBe(0);
  });

  it('우물 앞이 아니면 합류 못함, 대기 시작자만 출발, 여럿이면 카운트다운 동안 합류 가능', () => {
    const { g, enter, departed, fails } = make();
    enter('a');
    enter('b');
    enter('far', false);
    g.onMessage('far', 'well', { op: 'join' });
    expect(fails('far')).toEqual(['far']);
    g.onMessage('a', 'well', { op: 'join' });
    g.onMessage('b', 'well', { op: 'join' });
    g.onMessage('b', 'well', { op: 'depart' });
    expect(fails('b')).toEqual(['notHost']);
    g.onMessage('a', 'well', { op: 'depart' });
    expect(g.state.well.departAt).toBeGreaterThan(0);
    enter('c');
    g.onMessage('c', 'well', { op: 'join' });
    const ticks = Math.ceil((ISLAND.well.countdownSec * 1000) / (1000 / 60)) + 1;
    for (let i = 0; i < ticks; i++) g.tick();
    expect(departed).toEqual([[['a', 'b', 'c'], 'floor1']]);
  });

  it('가득 차면 거절, 끊기면 빠지고 대기 시작자가 바뀜, 아무도 없으면 카운트다운 취소', () => {
    const { g, enter, fails } = make();
    for (const id of ['a', 'b', 'c', 'd', 'e']) { enter(id); g.onMessage(id, 'well', { op: 'join' }); }
    expect(fails('e')).toEqual(['full']);
    g.onMessage('a', 'well', { op: 'depart' });
    g.leave('a');
    expect(g.state.well.members[0]).toBe('b');
    for (const id of ['b', 'c', 'd']) g.onMessage(id, 'well', { op: 'leave' });
    expect(g.state.well.departAt).toBe(0);
  });

  it('던전에 간 사람은 섬을 나가도 탐험 중, 돌아오면 away', () => {
    const { g, enter } = make();
    enter('a');
    islandBus.departed(1, ['a'], 'floor1');
    g.leave('a');
    expect(g.state.residents.get('a')!.status).toBe('dungeon:1');
    islandBus.returned(1, ['a']);
    g.returned(['a']);
    expect(g.state.residents.get('a')!.status).toBe('away');
  });
});
