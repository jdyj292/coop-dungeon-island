import { describe, expect, it } from 'vitest';
import { bossLines } from './hudBoss';

describe('보스 HP 줄 (hud.md 2장: 한 줄 = 최대 체력 1/12)', () => {
  it('가득 = 12줄 꽉 참, 0.38 = 5줄째 56%, 0 = 0줄', () => {
    expect(bossLines(1)).toEqual({ left: 12, frac: 1 });
    const m = bossLines(0.38);
    expect(m.left).toBe(5);
    expect(m.frac).toBeCloseTo(0.56);
    expect(bossLines(0)).toEqual({ left: 0, frac: 0 });
  });
  it('줄 경계: 정확히 11/12면 11줄 꽉 참', () => {
    expect(bossLines(11 / 12).left).toBe(11);
    expect(bossLines(11 / 12).frac).toBeCloseTo(1);
  });
});
