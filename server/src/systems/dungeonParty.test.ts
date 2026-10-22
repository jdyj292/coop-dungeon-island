// 섬에서 출발한 파티: 이름·색·숙련도(최대 HP)·가져온 물약, 정산에 숙련도·남은 물약이 실려 저장 쪽(settled)으로
import { maxHpFor, type S2C } from '@game/shared';
import { describe, expect, it } from 'vitest';
import { DungeonGame } from './dungeonGame';
import type { PartyMember } from './gameTypes';

const member = (o: Partial<PartyMember>): PartyMember => ({ userId: '1', name: '모리', color: 2, level: 3, levelExp: 40, potions: { hp: 2, mp: 1 }, ...o });

function make() {
  const settled: [S2C['result'], Record<string, { hp: number; mp: number }>][] = [];
  const g = new DungeonGame({ partySize: 2, rng: () => 0 }, { broadcast: () => {}, send: () => {}, settled: (r, l) => settled.push([r, l]) });
  return { g, settled };
}

describe('섬 파티 던전', () => {
  it('이름·색·최대 HP(숙련도)·물약', () => {
    const { g } = make();
    g.join('s1', '무시됨', member({}));
    const p = g.state.players.get('s1')!, sp = g.sim.players.get('s1')!.state;
    expect([p.name, p.color]).toEqual(['모리', 2]);
    expect([sp.maxHp, sp.hp]).toEqual([maxHpFor(3), maxHpFor(3)]);
    expect(sp.potions).toEqual({ hp: 2, mp: 1 });
  });

  it('이탈하면 전멸 정산 (숙련도 이어서), 남은 물약과 함께 settled', () => {
    const { g, settled } = make();
    g.join('s1', '', member({}));
    g.join('s2', '', member({ userId: '2', name: '카이', color: 1, level: 1, levelExp: 0 }));
    g.sim.players.get('s1')!.state.potions.hp = 0;
    g.leave('s1');
    expect(settled).toHaveLength(1);
    const [r, left] = settled[0]!;
    expect(r.kind).toBe('wipe');
    expect(r.lines[0]).toMatchObject({ pid: 's1', name: '모리', levelBefore: 3 });
    expect(left).toEqual({ s1: { hp: 0, mp: 1 } });
  });

  it('개발 방(파티 없음)은 입장 순서 색, Lv1', () => {
    const g = new DungeonGame({ partySize: 2 }, { broadcast: () => {}, send: () => {} });
    g.join('a', '봇');
    g.join('b', '봇');
    expect([g.state.players.get('a')!.color, g.state.players.get('b')!.color]).toEqual([0, 1]);
    expect(g.sim.players.get('a')!.state.maxHp).toBe(maxHpFor(1));
  });
});
