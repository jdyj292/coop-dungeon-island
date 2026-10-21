// 몬스터 위치 기록 (docs/network.md 9장 지연 보정): 서버는 틱마다 위치를 historyMs까지 보관하고,
// 플레이어가 본 시점(되감기)의 위치로 그 플레이어의 공격을 판정한다
import { NET } from '../constants';

export interface PastPos {
  x: number;
  y: number;
  z: number;
  airborne: boolean;
}

export class PositionHistory {
  /** 시각(초) 순서 */
  private frames: { t: number; items: Map<number, PastPos> }[] = [];

  record(t: number, items: Map<number, PastPos>): void {
    this.frames.push({ t, items });
    const keep = t - NET.historyMs / 1000;
    while (this.frames.length > 1 && this.frames[0]!.t < keep) this.frames.shift();
  }

  /** 시각 t의 위치 (두 기록 사이는 보간, 기록 밖이면 가장 가까운 기록). 기록이 없으면 undefined */
  at(id: number, t: number): PastPos | undefined {
    const F = this.frames;
    let i = F.length - 1;
    while (i > 0 && F[i]!.t > t) i--;
    const a = F[i]?.items.get(id), b = F[i + 1]?.items.get(id);
    if (!a) return b;
    if (!b || t <= F[i]!.t) return a;
    const k = (t - F[i]!.t) / (F[i + 1]!.t - F[i]!.t);
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k, airborne: k < 0.5 ? a.airborne : b.airborne };
  }
}
