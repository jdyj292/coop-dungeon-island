// 섬 바닥 = 승인 데모 바닥 (island_screen_hud_mockup.html의 GT, 위 140줄)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { demoLines, runDemoScript, type FakeCanvas } from '../sprites/fakeCanvas';
import { groundHeight, paintGround } from './islandGround';

const html = readFileSync(new URL('../../../docs/refs/demos/island_screen_hud_mockup.html', import.meta.url), 'utf8');
// 16~21행 램프, 41~42행 난수·램프 상수, 63~70행 바닥
const { GT } = runDemoScript(['const LW=288,LH=162;', demoLines(html, 16, 21), demoLines(html, 41, 42), demoLines(html, 63, 70)].join('\n'), ['GT']) as { GT: FakeCanvas };

/** 데모 길: 가로 x 40~263·y 70~79, 세로 x 144~159·y 70~109 */
const demoPath = (x: number, y: number) => (y >= 70 && y < 80 && x >= 40 && x < 264) || (x >= 144 && x < 160 && y >= 70 && y < 110);

describe('섬 바닥', () => {
  it('데모 값이면 데모와 픽셀 단위로 같다 (잔디·점·풀·길·모래·절벽·물)', () => {
    const W = 288, H = groundHeight(110);
    expect(H).toBe(140);
    const ours: string[] = Array(W * H).fill('');
    paintGround({ width: W, grassH: 110, seed: 3, path: demoPath }, (x, y, c) => {
      if (x >= 0 && y >= 0 && x < W && y < H) ours[y * W + x] = c.toLowerCase();
    });
    const diff: string[] = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (ours[y * W + x] !== GT.at(x, y)) diff.push(`(${x},${y}) ${ours[y * W + x]} ≠ ${GT.at(x, y)}`);
    expect(diff.slice(0, 5)).toEqual([]);
  });

  it('물 둘째 프레임은 물 줄만 다르다', () => {
    const W = 64, H = groundHeight(30);
    const a: string[] = [], b: string[] = [];
    paintGround({ width: W, grassH: 30, seed: 1, path: () => false }, (x, y, c) => { a[y * W + x] = c; }, 0);
    paintGround({ width: W, grassH: 30, seed: 1, path: () => false }, (x, y, c) => { b[y * W + x] = c; }, 1);
    const changed = new Set<number>();
    for (let i = 0; i < W * H; i++) if (a[i] !== b[i]) changed.add(Math.floor(i / W));
    expect([...changed].every((y) => y >= H - 12)).toBe(true);
    expect(changed.size).toBeGreaterThan(0);
  });
});
