import { describe, expect, it } from 'vitest';
import { MONSTERS, type S2C } from '@game/shared';
import { DungeonGame, type Outbox } from './dungeonGame';
import { killReward, LootBook } from './reward';

describe('보상 (balance.md 7장)', () => {
  it('처치 보상: 코인 범위 안 무작위, 재료는 확률(1 이상이면 개수), 경험치 고정', () => {
    expect(killReward(MONSTERS.mushroom!, () => 0)).toEqual({ coins: 6, material: 1, exp: 8 });
    expect(killReward(MONSTERS.mushroom!, () => 0.99)).toEqual({ coins: 9, material: 0, exp: 8 });
    expect(killReward(MONSTERS.mossbear!, () => 0.5)).toEqual({ coins: 100, material: 3, exp: 60 });
  });
  it('콤보 보너스: 더 높은 단계만, 솔로 30/60/90 · 팀 20/40/60 → 5/10/15%', () => {
    const b = new LootBook(() => 0);
    expect(b.milestone(30, ['a'], true)).toEqual([{ to: 'a', type: 'comboBonus', msg: { count: 30, rate: 0.05 } }]);
    expect(b.milestone(30, ['a'], true)).toEqual([]);
    expect(b.milestone(40, ['a', 'b'], false).map((m) => m.to)).toEqual(['a', 'b']);
    expect(b.of('a').bonus).toBe(0.1);
  });
});

type Sent = { to: string; type: keyof S2C; msg: unknown };
function game(room: number, party = 2) {
  const sent: Sent[] = [];
  const out: Outbox = { broadcast: (type, msg) => { sent.push({ to: '*', type, msg }); }, send: (pid, type, msg) => { sent.push({ to: pid, type, msg }); } };
  const g = new DungeonGame({ room, partySize: party, rng: () => 0, dev: true }, out);
  g.join('a', 'A');
  if (party > 1) g.join('b', 'B');
  return { g, sent };
}

describe('DungeonGame 보상', () => {
  it('인원 체력 보정: 2인 방 버섯 체력 60 × 1.5', () => {
    expect(game(1).g.sim.alive[0]!.maxHp).toBe(90);
    expect(game(1, 1).g.sim.alive[0]!.maxHp).toBe(60);
  });
  it('기절하면 파티원 모두에게 각자 보상, 본인 전용 상태에 누적', () => {
    const { g, sent } = game(1);
    g.onMessage('a', 'dev', { cmd: 'clear' });
    g.tick();
    const rewards = sent.filter((s) => s.type === 'reward');
    expect(rewards.filter((s) => s.to === 'a')).toHaveLength(4);
    expect(rewards.filter((s) => s.to === 'b')).toHaveLength(4);
    expect(g.state.players.get('b')!.priv.coins).toBe(24);
    expect(g.state.players.get('b')!.priv.materials).toBe(4);
    expect(g.state.players.get('b')!.priv.exp).toBe(32);
  });
  it('보물상자: 클리어 뒤 가까이서 한 번만, 파티원 모두 코인 15 + 버섯 1', () => {
    const { g, sent } = game(3);
    const a = g.sim.players.get('a')!.state;
    a.pos = { x: 240, y: 36 };
    g.onMessage('a', 'interact', { targetId: 'chest' });
    expect(g.state.chestOpen).toBe(false); // 클리어 전
    g.onMessage('a', 'dev', { cmd: 'clear' });
    // 기절 → 퇴장(stunExitSec)까지 기다려야 웨이브 진행
    for (let i = 0; i < 120; i++) g.tick();
    expect(g.state.doorOpen).toBe(true);
    a.pos = { x: 100, y: 36 };
    const before = g.state.players.get('b')!.priv.coins;
    g.onMessage('a', 'interact', { targetId: 'chest' });
    expect(g.state.chestOpen).toBe(false); // 멀리
    a.pos = { x: 240, y: 36 };
    g.onMessage('a', 'interact', { targetId: 'chest' });
    g.onMessage('a', 'interact', { targetId: 'chest' });
    g.tick();
    expect(g.state.chestOpen).toBe(true);
    expect(g.state.players.get('b')!.priv.coins - before).toBe(15);
    expect(sent.filter((s) => s.type === 'reward' && s.to === 'b' && (s.msg as S2C['reward']).coins === 15)).toHaveLength(1);
  });
});
