import { describe, expect, it } from 'vitest';
import { DEPTH_RATIO, TILE, VIEW_HEIGHT, VIEW_WIDTH } from './constants';

describe('constants', () => {
  it('내부 가로는 18타일', () => {
    expect(VIEW_WIDTH / TILE).toBe(18);
  });
  it('내부 해상도 16:9', () => {
    expect(VIEW_WIDTH * 9).toBe(VIEW_HEIGHT * 16);
  });
  it('바닥 타일 화면 높이 10px', () => {
    expect(TILE * DEPTH_RATIO).toBe(10);
  });
});
