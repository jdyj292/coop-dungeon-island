// 스킬 예산 (docs/balance.md 3장): 예산 계수 = 기준 쿨(초) × 100 × 보정들. 보정은 데이터에서 판단한다
import type { Skill } from '../data/schema';

export interface BudgetRules {
  /** 통과 오차 (0.25 = ±25%) */
  tolerance: number;
  /** 보정 배율 (balance.md 3장 표) */
  factors: Record<'launch' | 'hold' | 'pull' | 'control' | 'area' | 'ranged' | 'movement' | 'superArmor' | 'longWindup' | 'longRecovery', number>;
  /** 이 거리(px) 이상 떨어진 곳을 치면 원거리 (4타일) */
  rangedPx: number;
  /** 선딜·후딜이 이 초 이상이면 리스크 보정 */
  longPhaseSec: number;
}

export interface BudgetResult {
  id: string;
  name: string;
  coef: number;
  budget: number;
  /** 붙은 보정 이름 (보고용) */
  factors: string[];
  /** 실제 ÷ 예산 − 1 */
  diff: number;
  ok: boolean;
  /** 벗어났지만 skills.json note에 이유가 있음 */
  noted: boolean;
}

/** 이 스킬에 붙는 보정 이름 목록 */
export function budgetFactors(s: Skill, r: BudgetRules): (keyof BudgetRules['factors'])[] {
  const out: (keyof BudgetRules['factors'])[] = [];
  const flags = s.flags ?? [];
  for (const f of ['launch', 'hold', 'pull'] as const) if (flags.includes(f)) out.push(f);
  // 제어: 빙결·정지(경직 연장 포함). 감속은 제외 (balance.md 3장 "빙결·정지·경직 연장")
  if (s.status && s.status.type !== 'slow') out.push('control');
  // 넓은 범위: 원·사각·부채꼴 판정 (문서 검산 예시의 화염 폭발 = 범위와 맞춤)
  if (s.area || s.zone) out.push('area');
  const reach = Math.max(s.hitbox?.forward ?? 0, s.area?.at[0] ?? 0, s.projectile?.range ?? 0);
  if (reach >= r.rangedPx) out.push('ranged');
  if (s.move) out.push('movement');
  if (s.phases.windup >= r.longPhaseSec) out.push('longWindup');
  if (s.phases.recovery >= r.longPhaseSec) out.push('longRecovery');
  return out;
}

export function checkSkill(s: Skill, r: BudgetRules): BudgetResult {
  const names = budgetFactors(s, r);
  const budget = names.reduce((b, n) => b * r.factors[n], s.cooldown * 100);
  const diff = s.coef / budget - 1;
  const ok = Math.abs(diff) <= r.tolerance;
  return { id: s.id, name: s.name, coef: s.coef, budget, factors: names, diff, ok, noted: !ok && !!s.note };
}
