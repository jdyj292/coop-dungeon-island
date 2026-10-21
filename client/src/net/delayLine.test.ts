import { describe, expect, it } from 'vitest';
import { DelayLine, RETRANSMIT_MS, type NetSim } from './delayLine';

/** 가짜 시계·타이머로 도착 시각 기록 */
function line(sim: NetSim, rands: number[]) {
  let now = 0;
  const arrived: { id: number; at: number }[] = [];
  const timers: { at: number; fn: () => void }[] = [];
  const d = new DelayLine(() => sim, (fn, ms) => timers.push({ at: now + ms, fn }), () => now, () => rands.shift() ?? 0.5);
  return {
    send(id: number, at: number) {
      now = at;
      d.push(() => arrived.push({ id, at: now }));
    },
    flush() {
      timers.sort((a, b) => a.at - b.at).forEach((t) => { now = t.at; t.fn(); });
      return arrived;
    },
  };
}

describe('DelayLine (network.md 13장)', () => {
  it('설정이 0이면 바로 전달', () => {
    const l = line({ lagMs: 0, jitterMs: 0, loss: 0 }, []);
    l.send(1, 0);
    expect(l.flush()).toEqual([{ id: 1, at: 0 }]);
  });
  it('한 방향 = 왕복의 절반 + 흔들림, 순서는 유지', () => {
    // rand 0 → −jitter, 1 → +jitter. 손실 판정 rand는 0.99 (손실 아님)
    const l = line({ lagMs: 100, jitterMs: 20, loss: 0.01 }, [1, 0.99, 0, 0.99]);
    l.send(1, 0);   // 50 + 20 = 70
    l.send(2, 10);  // 10 + 50 − 20 = 40 → 앞 메시지(70)보다 먼저 못 옴
    expect(l.flush()).toEqual([{ id: 1, at: 70 }, { id: 2, at: 70 }]);
  });
  it('손실 = 재전송 지연, 뒤 메시지도 밀림', () => {
    const l = line({ lagMs: 100, jitterMs: 0, loss: 0.05 }, [0.5, 0.01, 0.5, 0.99]);
    l.send(1, 0);
    l.send(2, 16);
    expect(l.flush()).toEqual([{ id: 1, at: 50 + RETRANSMIT_MS }, { id: 2, at: 50 + RETRANSMIT_MS }]);
  });
});
