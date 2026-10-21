import { describe, expect, it } from 'vitest';
import rules from '../../../tools/balance-check/rules.json';
import { SKILLS } from '../data/load';
import { budgetFactors, checkSkill } from './budget';

describe('스킬 예산 (balance.md 3장 검산 예시)', () => {
  it('올려베기 = 500 × launch 0.9 = 450, 통과', () => {
    const r = checkSkill(SKILLS.gs_launch!, rules);
    expect(r.factors).toEqual(['launch']);
    expect(r.budget).toBeCloseTo(450);
    expect(r.ok).toBe(true);
  });
  it('대지가르기 = 700 × 후딜 1.1 = 770, 통과', () => {
    const r = checkSkill(SKILLS.gs_earthsplit!, rules);
    expect(r.factors).toEqual(['longRecovery']);
    expect(r.budget).toBeCloseTo(770);
    expect(r.ok).toBe(true);
  });
  it('범위·원거리·선딜은 판정 모양과 구간에서 읽는다', () => {
    const s = { ...SKILLS.st_fireburst!, flags: [] };
    expect(budgetFactors(s, rules)).toEqual(['area', 'ranged', 'longWindup']);
    expect(checkSkill(s, rules).budget).toBeCloseTo(600 * 0.85 * 0.9 * 1.15);
  });
  it('±25% 밖이면 실패, note가 있으면 기록됨', () => {
    const s = SKILLS.st_icefield!;
    expect(budgetFactors(s, rules)).toEqual(['control', 'area']);
    const r = checkSkill(s, rules);
    expect([r.ok, r.noted]).toEqual([false, true]);
    expect(checkSkill({ ...s, note: undefined }, rules).noted).toBe(false);
  });
});
