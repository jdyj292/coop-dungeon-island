// 히트스톱과 화면 흔들림 (시간 값 docs/combat.md 5장 → shared/data/combat.json)

/** 히트스톱: 남은 시간 동안 게임 시간(dt)을 0으로 */
export class HitStop {
  private left = 0;

  stop(sec: number): void {
    this.left = Math.max(this.left, sec);
  }

  get active(): boolean {
    return this.left > 0;
  }

  /** 실제 dt → 게임 dt */
  filter(dt: number): number {
    if (this.left <= 0) return dt;
    this.left -= dt;
    return 0;
  }
}

export type ShakeDir = 'vertical' | 'horizontal' | undefined;

/** 정수 픽셀 흔들림. 히트스톱 중에도 진행 (motion.md 3장) */
export class Shake {
  private left = 0;
  private px = 0;
  private dir: ShakeDir;

  start(sec: number, px: number, dir?: ShakeDir): void {
    if (sec <= 0 || px <= 0) return;
    if (px >= this.px || this.left <= 0) {
      this.px = px;
      this.dir = dir;
    }
    this.left = Math.max(this.left, sec);
  }

  update(dt: number): void {
    this.left = Math.max(0, this.left - dt);
  }

  /** 방향 지정이 없으면 가로 1px + 세로 px (승인 데모의 강 흔들림) */
  offset(rand = Math.random): { x: number; y: number } {
    if (this.left <= 0) return { x: 0, y: 0 };
    const sign = () => (rand() < 0.5 ? -1 : 1);
    if (this.dir === 'vertical') return { x: 0, y: sign() * this.px };
    if (this.dir === 'horizontal') return { x: sign() * this.px, y: 0 };
    return { x: sign() * Math.min(1, this.px), y: sign() * this.px };
  }
}
