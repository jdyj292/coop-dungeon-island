import { describe, expect, it } from 'vitest';
import { damageOf, gradeTiming, hitTest } from './hit';

const box = { forward: 2, width: 18, depth: 13, z: 'both' as const };
const target = (x: number, y = 0, airborne = false) => ({ x, y, airborne, hurtbox: { width: 12, depth: 8 } });
const a = { x: 0, y: 0, facing: 1 };

describe('hitTest', () => {
  it('앞쪽만 맞는다', () => {
    expect(hitTest(a, box, target(14))).toBe(true);
    expect(hitTest(a, box, target(-14))).toBe(false);
    expect(hitTest({ ...a, facing: -1 }, box, target(-14))).toBe(true);
  });
  it('판정 끝에서 피격 상자 절반까지', () => {
    expect(hitTest(a, box, target(26))).toBe(true);
    expect(hitTest(a, box, target(26.1))).toBe(false);
  });
  it('깊이는 좁게: (13 + 8) / 2 = 10.5px 안', () => {
    expect(hitTest(a, box, target(14, 10.5))).toBe(true);
    expect(hitTest(a, box, target(14, 11))).toBe(false);
  });
  it('높이 조건', () => {
    expect(hitTest(a, { ...box, z: 'ground' }, target(14, 0, true))).toBe(false);
    expect(hitTest(a, { ...box, z: 'air' }, target(14))).toBe(false);
  });
});

describe('damageOf / gradeTiming', () => {
  it('ATK 10 × 계수', () => {
    expect([200, 350, 400].map((c) => damageOf(c))).toEqual([20, 35, 40]);
  });
  it('흔들림 없는 등급은 0초, 있으면 히트스톱 + 0.12초', () => {
    expect(gradeTiming('light')).toEqual({ hitstop: 0.05, shakePx: 0, shakeSec: 0 });
    expect(gradeTiming('heavy').shakeSec).toBeCloseTo(0.25);
  });
});
