// 공격 리듬의 위치 보정: 준비 때 뒤로, 타격 때 앞으로 (motion.md 1장). 연출용, 판정에는 영향 없음
import type { FighterEvent, Strength } from '@game/shared';
import fx from '../../data/fx.json';

export class Rhythm {
  /** 바라보는 방향 기준 px (+ = 앞) */
  offset = 0;

  onEvent(e: FighterEvent): void {
    const r = fx.rhythm;
    if (e.type === 'start') this.offset -= r.back;
    if (e.type === 'active') this.offset += r.forward[(e.run.def.strength ?? 'light') as Strength];
  }

  /** 행동이 끝나 있으면 제자리로 돌아온다 */
  update(dt: number, acting: boolean): void {
    if (acting || this.offset === 0) return;
    this.offset -= this.offset * Math.min(1, (dt / fx.rhythm.returnSec) * 3);
    if (Math.abs(this.offset) < 0.5) this.offset = 0;
  }

  get px(): number {
    return Math.round(this.offset);
  }
}
