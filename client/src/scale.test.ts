import { describe, expect, it } from 'vitest';
import { computeView, MIN_VIEW_HEIGHT } from './scale';

describe('computeView', () => {
  it('던전 바닥 끝 + HUD 띠가 들어가는 최소 높이 186', () => {
    expect(MIN_VIEW_HEIGHT).toBe(186);
  });
  it('1920×1080 → 5배, 시야 384×216', () => {
    expect(computeView(1920, 1080)).toEqual({ scale: 5, width: 384, height: 216 });
  });
  it('1920×950 (브라우저 창) → 5배, 높이 190', () => {
    expect(computeView(1920, 950)).toEqual({ scale: 5, width: 384, height: 190 });
  });
  it('높이가 모자라면 배율을 낮춘다: 1920×900 → 4배', () => {
    expect(computeView(1920, 900)).toEqual({ scale: 4, width: 480, height: 225 });
  });
  it('1536×864 → 4배, 정확히 384×216', () => {
    expect(computeView(1536, 864)).toEqual({ scale: 4, width: 384, height: 216 });
  });
  it('작은 창도 최소 2배, 최소 384×186', () => {
    expect(computeView(400, 200)).toEqual({ scale: 2, width: 384, height: 186 });
  });
  it('배율은 항상 정수', () => {
    for (let w = 300; w < 4000; w += 37) {
      expect(Number.isInteger(computeView(w, 900).scale)).toBe(true);
    }
  });
});
