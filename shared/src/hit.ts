// 공격 판정과 데미지 (docs/combat.md 2장, 공식 docs/balance.md 1장)
import combatData from '../data/combat.json';
import type { FxGrade, Hitbox } from './actions';

export interface Attacker {
  x: number;
  y: number;
  /** 1 = 오른쪽, -1 = 왼쪽 */
  facing: number;
}

export interface HitTarget {
  x: number;
  y: number;
  airborne: boolean;
  hurtbox: { width: number; depth: number };
}

/** 사각형 판정: 바라보는 방향으로 forward부터 width 길이(뒤로 back 추가), 깊이는 판정·피격 상자 겹침 */
export function hitTest(a: Attacker, box: Hitbox, t: HitTarget): boolean {
  if (box.z === 'ground' && t.airborne) return false;
  if (box.z === 'air' && !t.airborne) return false;
  const rel = (t.x - a.x) * a.facing;
  const half = t.hurtbox.width / 2;
  if (rel + half < box.forward - (box.back ?? 0) || rel - half > box.forward + box.width) return false;
  return Math.abs(t.y - a.y) <= (box.depth + t.hurtbox.depth) / 2;
}

/** 최종 데미지 = ATK × 계수 (레벨·피해 증가·상황 보정은 M1 이후) */
export const damageOf = (coef: number, atk = combatData.baseAtk): number => Math.round((atk * coef) / 100);

/** 연출 등급별 히트스톱·흔들림 시간 (combat.md 5장). 흔들림은 히트스톱 + shakeAfterHitstop 동안 */
export function gradeTiming(grade: FxGrade): { hitstop: number; shakePx: number; shakeSec: number } {
  const g = combatData.grades[grade];
  return { hitstop: g.hitstop, shakePx: g.shake, shakeSec: g.shake ? g.hitstop + combatData.shakeAfterHitstop : 0 };
}
