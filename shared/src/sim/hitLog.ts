// 플레이어 피격 기록 (docs/network.md 9장 "내 회피 판정"): 피격 직전 상태를 historyMs까지 보관하고,
// 백스텝 입력 시각 뒤 backstepGraceMs 안에 처리된 피격은 취소한다 (가장 이른 피격 직전 상태로 되돌림)
import { NET } from '../constants';
import type { PlayerState } from '../player';

type Saved = Pick<PlayerState, 'pos' | 'hp' | 'hurt' | 'downed' | 'feathers' | 'invuln' | 'ult' | 'fighter' | 'backstep'> & { running: boolean };

export class HitLog {
  private list: { t: number; before: Saved }[] = [];

  /** 피격 처리 직전에 (t = 시뮬레이션 시각, 초) */
  save(t: number, p: PlayerState): void {
    const f = p.fighter;
    this.list.push({ t, before: {
      pos: { ...p.pos }, hp: p.hp, hurt: p.hurt && { ...p.hurt, push: p.hurt.push && { ...p.hurt.push } }, downed: p.downed, feathers: p.feathers, invuln: p.invuln, ult: p.ult,
      fighter: { ...f, run: f.run && { ...f.run } }, backstep: p.backstep && { ...p.backstep }, running: p.run.running,
    } });
    const keep = t - NET.historyMs / 1000;
    while (this.list.length && this.list[0]!.t < keep) this.list.shift();
  }

  /** inputT 이후 grace 안의 피격을 취소. 취소한 피격 수 */
  cancelSince(p: PlayerState, inputT: number): number {
    const grace = NET.backstepGraceMs / 1000;
    const hits = this.list.filter((h) => h.t >= inputT && h.t <= inputT + grace);
    if (!hits.length) return 0;
    const { running, ...rest } = hits[0]!.before;
    Object.assign(p, rest);
    p.run.running = running;
    this.list = this.list.filter((h) => !hits.includes(h));
    return hits.length;
  }
}
