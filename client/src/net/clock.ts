// 서버 시계 맞추기 (docs/network.md 2장): 2초마다 ping, 서버 시각 − 내 시각(offset)을 이동 평균으로 추정
// 서버 시각 = 내 시각(ms) + offset
const SAMPLES = 8;

export class ServerClock {
  private samples: number[] = [];
  private offset: number | null = null;
  /** 최근 왕복 시간 ms (패널 표시용) */
  rtt = 0;

  /** now = 내 시각 (performance.now 기준 ms) */
  constructor(private now: () => number = () => performance.now()) {}

  get ready(): boolean {
    return this.offset !== null;
  }

  /** pong: sentAt = 보낸 내 시각, server = 서버가 받은 시각. 왕복의 절반을 더한다 */
  onPong(sentAt: number, server: number): void {
    const now = this.now(), rtt = Math.max(0, now - sentAt);
    this.rtt = rtt;
    this.samples.push(server + rtt / 2 - now);
    if (this.samples.length > SAMPLES) this.samples.shift();
    this.offset = this.samples.reduce((s, v) => s + v, 0) / this.samples.length;
  }

  /** ping 전에 첫 상태가 오면 그 시각으로 대충 맞춘다 (지연만큼 늦게 잡힌다) */
  hint(serverTime: number): void {
    if (this.offset === null) this.offset = serverTime - this.now();
  }

  serverNow(): number {
    return this.now() + (this.offset ?? 0);
  }
}
