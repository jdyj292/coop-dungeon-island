// 데미지와 연출 등급 시간 (공식 docs/balance.md 1장, 시간 docs/combat.md 5장). 판정 모양은 shapes.ts
import type { FxGrade } from './actions';
import { COMBAT } from './data/load';

/** 숙련도 레벨의 ATK = baseAtk × (1 + atkPerLevel × (Lv − 1)) (balance.md 1장, 섬 연마 보너스는 MVP 이후) */
export const atkFor = (level: number): number => COMBAT.baseAtk * (1 + COMBAT.atkPerLevel * (level - 1));

/** 최종 데미지 = ATK × 계수 (스킬 레벨·피해 증가·상황 보정은 이후) */
export const damageOf = (coef: number, atk = COMBAT.baseAtk): number => Math.round((atk * coef) / 100);

/** 연출 등급별 히트스톱·흔들림 시간 (combat.md 5장). 흔들림은 히트스톱 + shakeAfterHitstop 동안 */
export function gradeTiming(grade: FxGrade): { hitstop: number; shakePx: number; shakeSec: number } {
  const g = COMBAT.grades[grade];
  return { hitstop: g.hitstop, shakePx: g.shake, shakeSec: g.shake ? g.hitstop + COMBAT.shakeAfterHitstop : 0 };
}
