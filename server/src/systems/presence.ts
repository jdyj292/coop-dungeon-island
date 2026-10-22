// 접속 끊김 (docs/network.md 10장): 파티원은 30초, 솔로는 60초 재접속 대기. 전원 끊기면 60초 뒤 방 종료
// 끊긴 사람은 제자리에 멈추고 무적·대상 제외 (RoomSim away). 솔로·전원 끊김이면 시뮬레이션을 멈춘다
const PARTY_WAIT_MS = 30_000;
const SOLO_WAIT_MS = 60_000;
const ALL_AWAY_MS = 60_000;

export class Presence {
  /** pid → 이탈 처리 시각 (ms) */
  private deadline = new Map<string, number>();
  /** 전원 끊김이 된 시각 + 대기 (방 종료 시각) */
  private endAt: number | null = null;

  /** 끊김. members = 지금 방 인원 (끊긴 사람 포함). 반환 = 기다릴 초 (Colyseus 재접속 허용 시간) */
  disconnect(pid: string, now: number, members: number): number {
    const wait = members <= 1 ? SOLO_WAIT_MS : PARTY_WAIT_MS;
    this.deadline.set(pid, now + wait);
    if (this.deadline.size >= members) this.endAt ??= now + ALL_AWAY_MS;
    return Math.ceil(Math.max(wait, this.endAt ? this.endAt - now : 0) / 1000);
  }

  reconnect(pid: string): void {
    this.deadline.delete(pid);
    this.endAt = null;
  }

  /** 이탈(정상 종료 포함) 뒤 기록 지우기 */
  forget(pid: string): void {
    this.deadline.delete(pid);
  }

  isAway(pid: string): boolean {
    return this.deadline.has(pid);
  }

  /** 전원 끊김이거나 솔로 끊김이면 멈춤 */
  paused(members: number): boolean {
    return members > 0 && this.deadline.size >= members;
  }

  /** 이번에 시간이 다 된 사람 (전원 끊김 대기 중에는 각자 시간 대신 방 종료 시각) */
  expired(now: number): string[] {
    if (this.endAt !== null) return now >= this.endAt ? [...this.deadline.keys()] : [];
    return [...this.deadline].filter(([, at]) => now >= at).map(([pid]) => pid);
  }
}
