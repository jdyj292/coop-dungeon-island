import { describe, expect, it } from 'vitest';
import { weaponPixels, type Pixel } from './weapon';

const fmt = (pixels: Pixel[]) => pixels.map(([x, y, ch]) => `${x},${y}${ch}`);

describe('weaponPixels', () => {
  it('홀수 폭: 가로 방향이면 세로로, 가운데 정렬', () => {
    const p = weaponPixels({ type: 't', parts: [{ at: 2, mat: 'y', width: 3 }] }, [0, 0], [1, 0]);
    expect(fmt(p)).toEqual(['2,-1y', '2,0y', '2,1y']);
  });
  it('홀수 폭: 대각선이면 수직 대각선', () => {
    const p = weaponPixels({ type: 't', parts: [{ at: 2, mat: 'y', width: 3 }] }, [0, 0], [-1, -1]);
    expect(fmt(p)).toEqual(['-3,-1y', '-2,-2y', '-1,-3y']);
  });
  it('짝수 폭: 대각선이면 가로 이웃을 한 칸 더', () => {
    const p = weaponPixels({ type: 't', parts: [{ at: 3, mat: 'm', width: 2 }] }, [0, 0], [1, -1]);
    expect(fmt(p)).toEqual(['3,-3m', '4,-3m', '5,-3m']);
  });
  it('짝수 폭: 곧은 방향이면 수직 이웃', () => {
    const p = weaponPixels({ type: 't', parts: [{ at: 3, mat: 'm', width: 2 }] }, [0, 0], [1, 0]);
    expect(fmt(p)).toEqual(['3,0m', '3,1m']);
  });
  it('from~to, 음수 at', () => {
    const p = weaponPixels({ type: 't', parts: [{ at: -1, mat: 'y' }, { from: 1, to: 2, mat: 'w' }] }, [5, 5], [0, -1]);
    expect(fmt(p)).toEqual(['5,6y', '5,4w', '5,3w']);
  });
  it('block: 음수 방향 축은 반대쪽으로', () => {
    const p = weaponPixels({ type: 't', parts: [{ at: 1, mat: 'o', block: 2 }] }, [0, 0], [1, -1]);
    expect(fmt(p)).toEqual(['1,-2o', '2,-2o', '1,-1o', '2,-1o']);
  });
});
