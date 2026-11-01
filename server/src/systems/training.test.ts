// 수련장 진행 (dungeon.md 11장): 층 training, 처음부터 귀환 고리, 쿨타임·MP 없음, 허수아비는 기절하지 않음, 보상 없음
import { describe, expect, it } from 'vitest';
import { COMBAT, floorRoom, mapOf, TICK, type S2C } from '@game/shared';
import { DungeonGame, type Outbox } from './dungeonGame';

type Sent = { to: string; type: keyof S2C; msg: unknown };
function game(floor = 'training') {
  const sent: Sent[] = [];
  const out: Outbox = { broadcast: (type, msg) => { sent.push({ to: '*', type, msg }); }, send: (pid, type, msg) => { sent.push({ to: pid, type, msg }); } };
  const g = new DungeonGame({ floor, partySize: 1, rng: () => 0, dev: true }, out);
  g.join('a', 'A');
  ticks(g, Math.ceil(COMBAT.arriveSec / TICK));
  return { g, sent };
}
const ticks = (g: DungeonGame, n: number) => { for (let i = 0; i < n; i++) g.tick(); };
const skill = (seq: number) => ({ seq, t: 0, kind: 'skill' as const, skillId: 'gs_launch', x: 0, y: 0, facing: 1 });

describe('수련장 DungeonGame', () => {
  it('층 training: 방 하나, 허수아비 하나, 처음부터 열림(귀환 고리), 없는 층은 floor1', () => {
    const { g } = game();
    expect(g.state.floor).toBe('training');
    expect(g.training).toBe(true);
    expect(g.state.roomCount).toBe(1);
    expect(g.state.doorOpen).toBe(true);
    expect(g.sim.alive.map((m) => m.kind)).toEqual(['dummy']);
    expect(game('nope').g.state.floor).toBe('floor1');
  });
  it('같은 스킬을 쿨타임 없이 다시 씀, MP 그대로', () => {
    const { g, sent } = game();
    const p = g.sim.players.get('a')!.state, mp = p.mp;
    g.onMessage('a', 'action', skill(1));
    ticks(g, 90);
    g.onMessage('a', 'action', skill(2));
    ticks(g, 1);
    expect(sent.filter((s) => s.type === 'rejected')).toEqual([]);
    expect(g.state.players.get('a')!.actionId).toBe('gs_launch');
    expect(p.mp).toBe(mp);
  });
  it('허수아비는 맞아도 기절하지 않고 보상도 없음 (개발 명령 clear도 무시)', () => {
    const { g, sent } = game();
    const m = g.sim.alive[0]!;
    for (let k = 0; k < 15; k++) {
      g.sim.players.get('a')!.state.pos = { x: m.body.x - 14, y: m.body.y };
      g.onMessage('a', 'action', { seq: 10 + k, t: 0, kind: 'basic', x: 0, y: 0, facing: 1 });
      ticks(g, 40);
    }
    g.onMessage('a', 'dev', { cmd: 'clear' });
    ticks(g, 120);
    expect(sent.some((s) => s.type === 'hit')).toBe(true);
    expect(g.sim.alive).toHaveLength(1);
    expect(m.hp).toBe(m.maxHp);
    expect(g.state.players.get('a')!.priv.coins).toBe(0);
  });
  it('귀환 고리에 3초 서 있으면 귀환 (보스 처치 clear가 아님), 정산은 0', () => {
    const { g, sent } = game();
    const ring = mapOf(floorRoom('training', 1)).returnPoint!;
    g.sim.players.get('a')!.state.pos = { ...ring };
    ticks(g, Math.ceil((COMBAT.returnSec + COMBAT.resultDelaySec) / TICK) + 10);
    const r = sent.find((s) => s.type === 'result')?.msg as S2C['result'] | undefined;
    expect(r?.kind).toBe('return');
    expect(r?.lines[0]).toMatchObject({ wallet: 0, treasury: 0, materials: 0 });
  });
});
