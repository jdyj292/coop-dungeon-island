// 지연 보정 (docs/network.md 9장): 백스텝은 입력 시각 뒤 짧은 피격을 취소하고,
// 공격은 그 플레이어가 본 시점(action.t − 보간 지연, 최대 150ms 전)의 몬스터 위치로 판정. 공격자 위치는 12px 안이면 클라이언트 값
import { NET, type C2SMessage, type RoomSim, type SimPlayer } from '@game/shared';

/** now = 서버 시각 ms */
export function lagCompensate(sim: RoomSim, sp: SimPlayer, msg: C2SMessage<'action'>, now: number): void {
  if (msg.kind === 'backstep') {
    sim.cancelHitsSince(sp.pid, msg.t / 1000);
    return;
  }
  const back = now - (msg.t - NET.interpDelayMs);
  sp.rewind = Math.min(NET.rewindMaxMs, Math.max(0, back)) / 1000;
  const p = sp.state;
  if (!p.fighter.run && Math.hypot(msg.x - p.pos.x, msg.y - p.pos.y) <= NET.attackerTrustPx) {
    const b = sim.bounds;
    p.pos = { x: Math.min(b.maxX, Math.max(b.minX, msg.x)), y: Math.min(b.maxY, Math.max(b.minY, msg.y)) };
  }
}
