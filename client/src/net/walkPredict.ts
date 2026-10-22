// 섬 걷기 예측·보정 (docs/network.md 7장 규칙을 걷기에만): 같은 공유 함수(stepWalker)로 바로 움직이고,
// 서버 패치가 오면 lastInputSeq 이하를 지우고 서버 위치에서 남은 입력을 다시 적용 → 차이를 무시·부드럽게·즉시 보정
import { cloneWalker, NET, newWalker, stepWalker, type Bounds, type Vec2, type WalkInput, type Walker } from '@game/shared';

export type Correction = 'none' | 'ignore' | 'smooth' | 'snap';

export class WalkPredictor {
  state: Walker;
  /** 화면 위치 = state.pos + offset */
  offset: Vec2 = { x: 0, y: 0 };
  private pending: { seq: number; input: WalkInput }[] = [];
  private smoothLeft = 0;

  constructor(private bounds: Bounds, start: Vec2) {
    this.state = newWalker(start);
  }

  /** 장식이 바뀌면 걷기 장애물을 바꾼다 */
  setBounds(b: Bounds): void {
    this.bounds = b;
  }

  get display(): Vec2 {
    return { x: this.state.pos.x + this.offset.x, y: this.state.pos.y + this.offset.y };
  }

  /** 1/60초 한 틱. seq = 지금까지 보낸 마지막 입력 번호 */
  tick(input: WalkInput, dt: number, seq: number): void {
    this.pending.push({ seq, input });
    stepWalker(this.state, input, dt, this.bounds);
    if (this.smoothLeft > 0) {
      // 남은 차이를 smoothMs에 걸쳐 0으로
      const k = Math.min(1, (dt * 1000) / this.smoothLeft);
      this.offset = { x: this.offset.x * (1 - k), y: this.offset.y * (1 - k) };
      this.smoothLeft = Math.max(0, this.smoothLeft - dt * 1000);
    }
  }

  /** 서버 위치 (lastSeq까지 처리됨) */
  reconcile(server: Vec2, lastSeq: number, dt: number): Correction {
    this.pending = this.pending.filter((p) => p.seq > lastSeq);
    const shown = this.display;
    const w = cloneWalker(this.state);
    w.pos = { ...server };
    for (const p of this.pending) stepWalker(w, p.input, dt, this.bounds);
    const dx = shown.x - w.pos.x, dy = shown.y - w.pos.y, d = Math.hypot(dx, dy);
    this.state = w;
    if (d <= NET.correctIgnorePx) {
      // 작은 차이는 화면 위치를 그대로 두고 상태만 맞춘다 (흔들림 방지): 남은 차이를 offset으로
      this.offset = { x: dx, y: dy };
      return d === 0 ? 'none' : 'ignore';
    }
    if (d <= NET.correctSnapPx) {
      this.offset = { x: dx, y: dy };
      this.smoothLeft = NET.correctSmoothMs;
      return 'smooth';
    }
    this.offset = { x: 0, y: 0 };
    this.smoothLeft = 0;
    return 'snap';
  }
}
