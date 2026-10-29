import { describe, expect, it } from 'vitest';
import { addExp, expToNext, type S2C } from '@game/shared';
import { DungeonGame, type Outbox } from './dungeonGame';
import { newLoot } from './reward';
import { settle } from './settle';

type Sent = { to: string; type: keyof S2C; msg: unknown };
function game(room: number, party = 2) {
  const sent: Sent[] = [];
  const out: Outbox = { broadcast: (type, msg) => { sent.push({ to: '*', type, msg }); }, send: (pid, type, msg) => { sent.push({ to: pid, type, msg }); } };
  const g = new DungeonGame({ room, partySize: party, rng: () => 0, dev: true }, out);
  g.join('a', 'A');
  if (party > 1) g.join('b', 'B');
  return { g, sent };
}
const ticks = (g: DungeonGame, n: number) => { for (let i = 0; i < n; i++) g.tick(); };
const result = (sent: Sent[]) => sent.find((s) => s.type === 'result')?.msg as S2C['result'] | undefined;
const down = (g: DungeonGame, pid: string) => Object.assign(g.sim.players.get(pid)!.state, { hp: 0, downed: true });

/** 방의 모든 웨이브를 개발 명령으로 기절시키고 출구가 열릴 때까지 (퇴장 stunExitSec 기다림) */
function clearRoom(g: DungeonGame): void {
  for (let w = 0; w < 5 && !g.state.doorOpen; w++) {
    g.onMessage('a', 'dev', { cmd: 'clear' });
    for (let i = 0; i < 90; i++) g.tick();
  }
}

describe('쓰러짐·부활 (combat.md 4장)', () => {
  it('깃털은 솔로만', () => {
    expect(game(1, 1).g.sim.players.get('a')!.state.feathers).toBe(1);
    expect(game(1, 2).g.sim.players.get('a')!.state.feathers).toBe(0);
  });
  it('가까이서 E를 2초 누르고 있으면 HP 30%로 부활, 손을 떼면 진행도 0', () => {
    const { g } = game(1);
    g.sim.monsters.forEach((m) => (m.body.gone = true));
    const b = down(g, 'b');
    g.sim.players.get('a')!.state.pos = { ...b.pos };
    const holdFor = (n: number) => { for (let i = 0; i < n; i++) { if (i % 9 === 0) g.onMessage('a', 'interact', { targetId: 'revive:b' }); g.tick(); } };
    holdFor(60);
    expect(g.state.players.get('b')!.reviveProgress).toBeGreaterThan(100);
    ticks(g, 30); // 손 뗌
    expect(g.state.players.get('b')!.reviveProgress).toBe(0);
    holdFor(125);
    expect(b.downed).toBe(false);
    expect(b.hp).toBe(300);
  });
  it('멀면 부활하지 않음', () => {
    const { g } = game(1);
    const b = down(g, 'b');
    g.sim.players.get('a')!.state.pos = { x: b.pos.x + 50, y: b.pos.y };
    for (let i = 0; i < 150; i++) { if (i % 9 === 0) g.onMessage('a', 'interact', { targetId: 'revive:b' }); g.tick(); }
    expect(b.downed).toBe(true);
  });
});

describe('한 판의 끝', () => {
  it('전원 쓰러짐 → 2초 뒤 전멸 결과, 이후 세계 멈춤', () => {
    const { g, sent } = game(1);
    down(g, 'a');
    down(g, 'b');
    ticks(g, 60);
    expect(result(sent)).toBeUndefined();
    ticks(g, 70);
    expect(result(sent)?.kind).toBe('wipe');
    expect(g.state.phase).toBe('result');
  });
  it('귀환 지점: 클리어 뒤 살아 있는 전원이 고리 안에 3초 → 귀환, 나가면 취소', () => {
    const { g, sent } = game(3);
    clearRoom(g);
    expect(g.state.doorOpen).toBe(true);
    const ring = { x: 32 * 16 / 2, y: 14 * 16 / 2 };
    g.sim.players.get('a')!.state.pos = { ...ring };
    g.sim.players.get('b')!.state.pos = { ...ring };
    ticks(g, 90);
    expect(g.state.returnLeft).toBeGreaterThan(1);
    g.sim.players.get('b')!.state.pos = { x: 40, y: 40 };
    ticks(g, 2);
    expect(g.state.returnLeft).toBe(0);
    g.sim.players.get('b')!.state.pos = { ...ring };
    ticks(g, 190);
    expect(result(sent)?.kind).toBe('return');
  });
  it('보스 방 클리어 → 결과 clear', () => {
    const { g, sent } = game(6);
    clearRoom(g);
    ticks(g, 250);
    expect(result(sent)?.kind).toBe('clear');
  });
});

describe('정산 (balance.md 7장)', () => {
  const loot = { ...newLoot(), coins: 200, materials: 3, exp: 300, bonus: 0.1 };
  const m = [{ pid: 'a', name: 'A', level: 1, levelExp: 0 }];
  it('클리어: 코인 × (1 + 보너스), 30% 금고 · 70% 지갑, 경험치로 레벨', () => {
    const l = settle('clear', m, () => loot).lines[0]!;
    expect([l.bonusCoins, l.treasury, l.wallet, l.materials]).toEqual([20, 66, 154, 3]);
    expect(l.levelAfter).toBe(addExp(1, 0, 300).level);
  });
  it('전멸: 코인 50% 손실·보너스 없음, 재료 유지', () => {
    const l = settle('wipe', m, () => loot).lines[0]!;
    expect([l.bonusCoins, l.lost, l.treasury, l.wallet, l.materials]).toEqual([0, 100, 30, 70, 3]);
  });
  it('필요 경험치 = 100 × 레벨^1.3', () => {
    expect([expToNext(1), expToNext(2)]).toEqual([100, Math.round(100 * 2 ** 1.3)]);
    expect(addExp(1, 0, 350)).toEqual({ level: 3, exp: 350 - 100 - Math.round(100 * 2 ** 1.3) });
  });
});
