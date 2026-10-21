// 개발용 네트워크 흉내 (docs/network.md 13장): 한 방향마다 지연(왕복의 절반) + 흔들림 + 손실
// WebSocket(TCP)은 패킷을 잃지 않고 재전송으로 늦게 보내므로, 손실 = 재전송 지연을 더하고 순서는 유지 (뒤 메시지도 밀림)
// 상태 패치는 변경분이라 버리면 상태가 깨진다 → 버리지 않는다
export interface NetSim {
  /** 왕복 지연 ms */
  lagMs: number;
  /** 한 방향 흔들림 ±ms */
  jitterMs: number;
  /** 손실 확률 0~1 (재전송 지연으로 흉내) */
  loss: number;
}

/** 손실된 패킷의 재전송 대기 (TCP 최소 RTO 근처) */
export const RETRANSMIT_MS = 200;

export class DelayLine {
  private lastAt = 0;

  constructor(
    private sim: () => NetSim,
    private schedule: (fn: () => void, ms: number) => void = (fn, ms) => { window.setTimeout(fn, ms); },
    private now: () => number = () => performance.now(),
    private rand: () => number = Math.random,
  ) {}

  push(fn: () => void): void {
    const { lagMs, jitterMs, loss } = this.sim();
    if (lagMs <= 0 && jitterMs <= 0 && loss <= 0 && this.lastAt <= this.now()) return fn();
    const now = this.now();
    let at = now + lagMs / 2 + (this.rand() * 2 - 1) * jitterMs;
    if (this.rand() < loss) at += RETRANSMIT_MS;
    // 순서 유지: 앞 메시지보다 먼저 도착하지 않는다
    at = Math.max(at, this.lastAt, now);
    this.lastAt = at;
    this.schedule(fn, at - now);
  }
}
