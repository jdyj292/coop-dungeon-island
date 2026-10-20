// 데미지와 연출 등급 시간 (공식 docs/balance.md 1장, 시간 docs/combat.md 5장). 판정 모양은 shapes.ts
import type { FxGrade } from './actions';
import { COMBAT } from './data/load';

/** 최종 데미지 = ATK × 계수 (레벨·피해 증가·상황 보정은 M1 이후) */
export const damageOf = (coef: number, atk = COMBAT.baseAtk): number => Math.round((atk * coef) / 100);

/** 연출 등급별 히트스톱·흔들림 시간 (combat.md 5장). 흔들림은 히트스톱 + shakeAfterHitstop 동안 */
export function gradeTiming(grade: FxGrade): { hitstop: number; shakePx: number; shakeSec: number } {
  const g = COMBAT.grades[grade];
  return { hitstop: g.hitstop, shakePx: g.shake, shakeSec: g.shake ? g.hitstop + COMBAT.shakeAfterHitstop : 0 };
}
