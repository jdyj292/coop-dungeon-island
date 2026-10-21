// 스냅샷 보간 (docs/network.md 8장): 받은 상태를 서버 시각과 함께 쌓고, 과거 시점 t를 두 스냅샷 사이에서 보간
// 버퍼가 비면(지연 급증) 마지막 속도로 최대 extrapolateMs까지 외삽 후 멈춤
import { NET } from '@game/shared';

/** 보간할 숫자 값 (위치·높이) */
export interface Pos {
  x: number;
  y: number;
  z: number;
}

export interface Snapshot<T> {
  t: number;
  /** 엔티티 id → 값 */
  items: Map<string, T>;
}

const KEEP_MS = 1000;

export class SnapshotBuffer<T extends Pos> {
  private list: Snapshot<T>[] = [];

  push(s: Snapshot<T>): void {
    const last = this.list.at(-1);
    if (last && s.t <= last.t) return; // 같은 시각·뒤바뀐 패치는 무시
    this.list.push(s);
    while (this.list.length > 2 && this.list[1]!.t < s.t - KEEP_MS) this.list.shift();
  }

  get latest(): Snapshot<T> | undefined {
    return this.list.at(-1);
  }

  clear(): void {
    this.list = [];
  }

  /** 시점 t의 엔티티들. 위치는 보간, 나머지 값은 t 직전 스냅샷 것 */
  sample(t: number): Map<string, T> {
    const L = this.list;
    if (!L.length) return new Map();
    let i = L.length - 1;
    while (i > 0 && L[i]!.t > t) i--;
    const a = L[i]!, b = L[i + 1];
    const out = new Map<string, T>();
    if (b) {
      // a ≤ t < b: 둘 다 있는 엔티티는 보간, a에만 있으면 그대로
      const k = Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t)));
      for (const [id, va] of a.items) {
        const vb = b.items.get(id);
        out.set(id, vb ? { ...va, x: lerp(va.x, vb.x, k), y: lerp(va.y, vb.y, k), z: lerp(va.z, vb.z, k) } : va);
      }
      return out;
    }
    if (t <= a.t) return new Map(a.items);
    // t가 마지막보다 뒤: 직전 두 스냅샷 속도로 외삽 (최대 extrapolateMs)
    const prev = L[i - 1];
    const ahead = Math.min(t - a.t, NET.extrapolateMs);
    for (const [id, va] of a.items) {
      const vp = prev?.items.get(id);
      if (!vp || !prev) {
        out.set(id, va);
        continue;
      }
      const dt = a.t - prev.t;
      out.set(id, {
        ...va,
        x: va.x + ((va.x - vp.x) / dt) * ahead, y: va.y + ((va.y - vp.y) / dt) * ahead, z: va.z + ((va.z - vp.z) / dt) * ahead,
      });
    }
    return out;
  }
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
