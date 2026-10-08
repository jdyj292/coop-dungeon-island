import { describe, expect, it } from 'vitest';
import { computeView } from './scale';

describe('computeView', () => {
  it('1920×1080 → 6배, 시야 320×180', () => {
    expect(computeView(1920, 1080)).toEqual({ scale: 6, width: 320, height: 180 });
  });
  it('1152×648 → 4배, 정확히 288×162', () => {
    expect(computeView(1152, 648)).toEqual({ scale: 4, width: 288, height: 162 });
  });
  it('작은 창도 최소 2배, 최소 288×162', () => {
    expect(computeView(400, 200)).toEqual({ scale: 2, width: 288, height: 162 });
  });
  it('배율은 항상 정수', () => {
    for (let w = 300; w < 4000; w += 37) {
      expect(Number.isInteger(computeView(w, 900).scale)).toBe(true);
    }
  });
});
