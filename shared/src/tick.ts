// 고정 간격 진행: 실제 경과 시간을 1/60초 틱으로 나눈다 (docs/network.md 12장). 클라이언트·서버 공용
import { TICK } from './constants';

/** 부동소수 오차로 1틱이 모자라 보이는 것을 막는 여유 */
const EPS = 1e-9;

export class FixedStep {
  private acc = 0;

  /** maxSteps: 한 번에 돌릴 최대 틱 수 (탭 전환 등으로 시간이 몰리면 버린다) */
  constructor(readonly step = TICK, readonly maxSteps = 8) {}

  /** 경과 시간을 더하고 이번에 돌릴 틱 수를 돌려준다 */
  advance(dt: number): number {
    this.acc += dt;
    let n = Math.floor((this.acc + EPS) / this.step);
    if (n > this.maxSteps) {
      n = this.maxSteps;
      this.acc = 0;
    } else {
      this.acc = Math.max(0, this.acc - n * this.step);
    }
    return n;
  }

  /** 다음 틱까지 진행 비율 (0~1, 보간용) */
  get alpha(): number {
    return this.acc / this.step;
  }

  reset(): void {
    this.acc = 0;
  }
}
