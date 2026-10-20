import { describe, expect, it } from 'vitest';
import { damageOf, gradeTiming } from './hit';

describe('damageOf / gradeTiming', () => {
  it('ATK 10 × 계수', () => {
    expect([200, 350, 400].map((c) => damageOf(c))).toEqual([20, 35, 40]);
  });
  it('흔들림 없는 등급은 0초, 있으면 히트스톱 + 0.12초', () => {
    expect(gradeTiming('light')).toEqual({ hitstop: 0.05, shakePx: 0, shakeSec: 0 });
    expect(gradeTiming('heavy').shakeSec).toBeCloseTo(0.25);
  });
});
