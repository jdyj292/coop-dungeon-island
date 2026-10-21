// 한 판의 끝과 쓰러짐 (docs/dungeon.md 3장, combat.md 4장): 동료 부활(E 2초), 귀환 지점(전원 3초), 전멸·보스 처치 → 결과
// 부활 요청은 E를 누르는 동안 interact 'revive:<pid>'가 계속 온다. 끊기면(HOLD_GRACE) 진행도는 0으로
import { COMBAT, mapOf, PLAYER, revivePlayer, TICK, type RoomDef, type RoomSim } from '@game/shared';
import type { RunEnd } from './settle';

/** 마지막 E 요청 뒤 이 시간 안이면 누르고 있는 것으로 (클라이언트는 150ms마다 보냄) */
const HOLD_GRACE_MS = 300;

export interface RunTick {
  /** 대상 pid → 부활 진행도 0~1 */
  revive: Map<string, number>;
  /** 귀환 남은 초 (0 = 진행 안 함) */
  returnLeft: number;
  /** 결과가 정해졌으면 (결과 지연이 끝난 틱에만) */
  end: RunEnd | null;
  /** 이번 틱에 일어난 사람 */
  revived: string[];
}

export class RunFlow {
  /** 대상 pid → { 진행 초, 마지막 요청 시각 } */
  private holds = new Map<string, { sec: number; at: number }>();
  private returnLeft = 0;
  private pending: { kind: RunEnd; left: number } | null = null;

  /** E 누름 (부활): 살아 있는 사람이 가까운 쓰러진 동료에게 */
  hold(sim: RoomSim, reviver: string, target: string, now: number): void {
    const a = sim.players.get(reviver)?.state, b = sim.players.get(target)?.state;
    if (!a || !b || a.downed || !b.downed || reviver === target) return;
    if (Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y) > COMBAT.interactRange) return;
    const h = this.holds.get(target);
    this.holds.set(target, { sec: h?.sec ?? 0, at: now });
  }

  /** 방이 바뀌면 귀환·부활 진행은 처음부터 */
  resetRoom(): void {
    this.holds.clear();
    this.returnLeft = 0;
  }

  tick(sim: RoomSim, room: RoomDef, cleared: boolean, isLast: boolean, now: number): RunTick {
    const dt = TICK;
    const out: RunTick = { revive: new Map(), returnLeft: 0, end: null, revived: [] };
    // 부활
    for (const [pid, h] of this.holds) {
      const p = sim.players.get(pid)?.state;
      if (!p?.downed || now - h.at > HOLD_GRACE_MS) {
        this.holds.delete(pid);
        continue;
      }
      h.sec += dt;
      if (h.sec >= PLAYER.revive.holdSec) {
        revivePlayer(p);
        this.holds.delete(pid);
        out.revived.push(pid);
      } else out.revive.set(pid, h.sec / PLAYER.revive.holdSec);
    }
    const alive = [...sim.players.values()].filter((sp) => !sp.state.downed);
    // 결과 대기 중이면 기다렸다가 끝
    if (this.pending) {
      this.pending.left -= dt;
      if (this.pending.left <= 0) out.end = this.pending.kind;
      return out;
    }
    if (sim.players.size && !alive.length) this.pending = { kind: 'wipe', left: COMBAT.resultDelaySec };
    else if (isLast && cleared) this.pending = { kind: 'clear', left: COMBAT.resultDelaySec };
    // 귀환 지점: 클리어 뒤 살아 있는 전원이 고리 안에 returnSec 동안
    const ring = mapOf(room).returnPoint;
    const inRing = !!ring && cleared && alive.length > 0
      && alive.every((sp) => Math.hypot(sp.state.pos.x - ring.x, sp.state.pos.y - ring.y) <= COMBAT.interactRange);
    if (!inRing) this.returnLeft = 0;
    else {
      this.returnLeft = this.returnLeft > 0 ? this.returnLeft - dt : COMBAT.returnSec;
      if (this.returnLeft <= 0) {
        out.end = 'return';
        this.returnLeft = 0;
      }
    }
    out.returnLeft = this.returnLeft;
    return out;
  }
}
