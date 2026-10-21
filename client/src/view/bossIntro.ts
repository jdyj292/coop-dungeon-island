// 보스 등장 연출 (hud.md 5장, art.md 1장 카메라): 카메라가 보스 쪽으로 panSec 이동 → 이름 띠 holdSec → backSec 동안 돌아옴
// 연출 동안 내 조작은 멈춘다 (보스는 아직 감지 전). 시간 값 fx.json bossIntro
import fx from '../../data/fx.json';

const ease = (k: number) => k * k * (3 - 2 * k);

export class BossIntro {
  private t = 0;

  /** from = 내 위치 x, to = 보스 x */
  constructor(private from: number, private to: number) {}

  get done(): boolean {
    const b = fx.bossIntro;
    return this.t >= b.panSec + b.holdSec + b.backSec;
  }

  /** 이번 프레임 카메라 중심 x와 이름 띠 표시 여부 */
  update(dt: number, from = this.from): { camX: number; band: boolean } {
    this.t += dt;
    const b = fx.bossIntro, t = this.t;
    if (t < b.panSec) return { camX: from + (this.to - from) * ease(t / b.panSec), band: false };
    if (t < b.panSec + b.holdSec) return { camX: this.to, band: true };
    const k = Math.min(1, (t - b.panSec - b.holdSec) / b.backSec);
    return { camX: this.to + (from - this.to) * ease(k), band: false };
  }
}
