import { describe, expect, it } from 'vitest';
import { Reflection } from '@colyseus/schema';
import type { S2C } from '@game/shared';
import { DungeonGame, type Outbox } from './dungeonGame';
import { DungeonState } from '../schema/DungeonState';

type Sent = { to: string; type: keyof S2C; msg: unknown };
function setup(room = 1, partySize = 2) {
  const sent: Sent[] = [];
  const out: Outbox = {
    broadcast: (type, msg) => { sent.push({ to: '*', type, msg }); },
    send: (pid, type, msg) => { sent.push({ to: pid, type, msg }); },
  };
  const g = new DungeonGame({ room, partySize, rng: () => 0 }, out);
  g.join('a', '앨리스');
  g.join('b', '  ');
  return { g, sent };
}
const run = (g: DungeonGame, n: number) => { for (let i = 0; i < n; i++) g.tick(); };
const input = (seq: number, mx: number, run = false) => ({ seq, t: 0, mx, my: 0, run });

describe('DungeonGame (서버 진행)', () => {
  it('입장: 이름 정리·기본 이름, 깊이를 나눠 섬, 1번 방 버섯 4마리', () => {
    const { g } = setup();
    const a = g.state.players.get('a')!, b = g.state.players.get('b')!;
    expect([a.name, b.name]).toEqual(['앨리스', '모험가2']);
    expect(a.x).toBe(48);
    expect(a.y).not.toBe(b.y);
    expect(g.state.monsters.size).toBe(4);
  });
  it('입력은 각자, 처리한 seq를 lastInputSeq로', () => {
    const { g } = setup();
    g.onMessage('a', 'input', input(5, 1));
    run(g, 20);
    const a = g.state.players.get('a')!, b = g.state.players.get('b')!;
    expect(a.x).toBeGreaterThan(48);
    expect(a.state).toBe('walk');
    expect(a.lastInputSeq).toBe(5);
    expect(b.x).toBe(48);
  });
  it('run 입력이면 두 번 누르기 없이 달림', () => {
    const { g } = setup();
    g.onMessage('a', 'input', input(1, 1, true));
    run(g, 2);
    expect(g.state.players.get('a')!.state).toBe('run');
  });
  it('공격: 행동 id·시작 시각이 상태에, 맞으면 hit·combo 이벤트', () => {
    const { g, sent } = setup();
    const m = g.sim.alive[0]!;
    g.sim.players.get('a')!.state.pos = { x: m.body.x - 14, y: m.body.y };
    g.onMessage('a', 'action', { seq: 1, t: 0, kind: 'basic', x: 0, y: 0, facing: 1 });
    run(g, 1);
    expect(g.state.players.get('a')!.actionId).toBe('gs_b1');
    run(g, 30);
    const hit = sent.find((s) => s.type === 'hit')?.msg as S2C['hit'];
    expect(hit).toMatchObject({ attacker: 'a', target: m.id, damage: 20 });
    expect(sent.some((s) => s.type === 'combo')).toBe(true);
    expect(g.state.monsters.get(String(m.id))!.hpRatio).toBe(Math.ceil((255 * 40) / 60));
  });
  it('안 되는 행동은 본인에게 rejected (장착 안 한 스킬, 쿨타임)', () => {
    const { g, sent } = setup();
    g.onMessage('a', 'action', { seq: 2, t: 0, kind: 'skill', skillId: 'st_fireburst', x: 0, y: 0, facing: 1 });
    g.onMessage('a', 'action', { seq: 3, t: 0, kind: 'skill', skillId: 'gs_launch', x: 0, y: 0, facing: 1 });
    run(g, 2);
    g.onMessage('a', 'action', { seq: 4, t: 0, kind: 'skill', skillId: 'gs_launch', x: 0, y: 0, facing: 1 });
    expect(sent.filter((s) => s.type === 'rejected')).toEqual([
      { to: 'a', type: 'rejected', msg: { seq: 2, reason: 'state' } },
      { to: 'a', type: 'rejected', msg: { seq: 4, reason: 'cooldown' } },
    ]);
    expect(g.state.players.get('a')!.priv.cooldowns.has('gs_launch')).toBe(true);
  });
  it('잘못된 형식은 무시, 초당 제한을 넘으면 무시 → 계속 넘으면 kick', () => {
    const { g } = setup();
    expect(g.onMessage('a', 'input', { seq: 1, mx: 5 })).toBe('ignored');
    const res: string[] = [];
    for (let i = 0; i < 70; i++) res.push(g.onMessage('a', 'input', input(i + 2, 1)));
    // 형식이 틀린 메시지도 횟수에 든다 → 29개 통과 후 무시
    expect(res.slice(0, 29).every((r) => r === 'ok')).toBe(true);
    expect(res[29]).toBe('ignored');
    expect(res.at(-1)).toBe('kick');
  });
  it('ping → 본인에게 pong (서버 시각)', () => {
    const { g, sent } = setup();
    run(g, 6);
    g.onMessage('b', 'ping', { t: 123 });
    const pong = sent.at(-1)!;
    expect(pong).toMatchObject({ to: 'b', type: 'pong', msg: { t: 123 } });
    expect((pong.msg as S2C['pong']).server).toBeCloseTo(100);
  });
  it('모두 기절 → 다음 웨이브, 마지막이면 roomClear·doorOpen', () => {
    const { g, sent } = setup(4);
    expect(g.state.wave).toBe(1);
    for (const m of g.sim.monsters) m.body.gone = true;
    run(g, 1);
    expect(g.state.wave).toBe(2);
    for (const m of g.sim.monsters) m.body.gone = true;
    run(g, 1);
    expect(g.state.doorOpen).toBe(true);
    expect(sent.some((s) => s.type === 'roomClear')).toBe(true);
    expect(g.state.monsters.size).toBe(0);
  });
  it('아무도 입장하기 전에도 틱이 돈다', () => {
    const g = new DungeonGame({}, { broadcast: () => {}, send: () => {} });
    expect(() => run(g, 10)).not.toThrow();
  });
  it('지연 보정: 되감기 = 지금 − (t − 100ms), 최대 150ms. 공격자 위치는 12px 안이면 클라이언트 값', () => {
    const { g } = setup();
    run(g, 60); // 1000ms
    const sp = g.sim.players.get('a')!;
    g.onMessage('a', 'action', { seq: 1, t: 1000 - 20, x: 50, y: sp.state.pos.y, facing: 1, kind: 'basic' });
    expect(sp.rewind).toBeCloseTo(0.12);
    expect(sp.state.pos.x).toBe(50);
    run(g, 60);
    g.onMessage('a', 'action', { seq: 2, t: 0, x: 300, y: 0, facing: 1, kind: 'basic' });
    expect(sp.rewind).toBeCloseTo(0.15);
    expect(sp.state.pos.x).not.toBe(300);
  });
  it('백스텝 메시지: 입력 시각 뒤 100ms 안의 피격 취소', () => {
    const { g } = setup();
    const sp = g.sim.players.get('a')!;
    let hitAt = -1;
    for (let i = 0; i < 600 && hitAt < 0; i++) {
      g.sim.monsters.forEach((m, j) => { if (j === 0) { m.body.x = sp.state.pos.x + 20; m.body.y = sp.state.pos.y; } });
      g.tick();
      if (sp.state.hp < sp.state.maxHp) hitAt = g.now;
    }
    expect(hitAt).toBeGreaterThan(0);
    g.onMessage('a', 'action', { seq: 9, t: hitAt - 50, x: 0, y: 0, facing: 1, kind: 'backstep' });
    expect(sp.state.hp).toBe(sp.state.maxHp);
  });
  it('퇴장하면 상태에서 빠짐', () => {
    const { g } = setup();
    g.leave('b');
    run(g, 1);
    expect([...g.state.players.keys()]).toEqual(['a']);
  });
  it('상태 스키마는 직렬화된다 (본인 전용 필드 포함)', () => {
    const { g } = setup();
    run(g, 1);
    expect(() => Reflection.encode(g.state)).not.toThrow();
    expect(new DungeonState().encodeAll(false).length).toBeGreaterThan(0);
  });
});
