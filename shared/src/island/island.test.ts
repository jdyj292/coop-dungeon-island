import { describe, expect, it } from 'vitest';
import { ISLAND } from '../data/load';
import { TICK, TILE } from '../constants';
import { hitsBlock } from '../map/collision';
import { playerHalf } from '../movement';
import { newWalker, stepWalker } from './walker';
import { footOf, islandBounds, nearFacility, spawnPos } from './world';

describe('섬 공간', () => {
  const b = islandBounds();

  it('입장 자리(선착장·우물 앞)는 걷는 영역 안, 시설과 겹치지 않음', () => {
    for (const kind of ['login', 'return'] as const) {
      for (let i = 0; i < 4; i++) {
        const p = spawnPos(i, kind);
        expect(p.x).toBeGreaterThanOrEqual(b.minX);
        expect(p.x).toBeLessThanOrEqual(b.maxX);
        expect(p.y).toBeLessThanOrEqual(b.maxY);
        expect(hitsBlock(p, playerHalf(), b)).toBe(false);
      }
    }
    // 선착장은 걷는 영역 맨 앞 줄 (물가 바로 위)
    expect(ISLAND.spawn.login.y).toBe(ISLAND.walk.y + ISLAND.walk.h - 1);
  });

  it('시설은 놓는 영역 안, 서로 겹치지 않고 우물 주변 1칸 비움 (island.md 3장)', () => {
    const P = ISLAND.place, fs = ISLAND.facilities;
    for (const f of fs) {
      expect(f.x >= P.x && f.y >= P.y && f.x + f.w <= P.x + P.w && f.y + f.h <= P.y + P.h).toBe(true);
    }
    const well = fs.find((f) => f.id === 'well')!;
    for (const f of fs) {
      if (f === well) continue;
      const gapX = Math.max(well.x - (f.x + f.w), f.x - (well.x + well.w)), gapY = Math.max(well.y - (f.y + f.h), f.y - (well.y + well.h));
      expect(Math.max(gapX, gapY)).toBeGreaterThanOrEqual(1);
    }
  });

  it('시설에 막히고, 우물 앞에서 우물을 찾는다', () => {
    const well = ISLAND.facilities.find((f) => f.id === 'well')!;
    const w = newWalker({ x: footOf(well).x, y: (well.y + well.h + 1) * TILE });
    for (let i = 0; i < 120; i++) stepWalker(w, { mx: 0, my: -1, run: false }, TICK, b);
    expect(w.pos.y).toBeGreaterThanOrEqual((well.y + well.h) * TILE);
    expect(nearFacility(w.pos)).toBe('well');
    expect(nearFacility(spawnPos(0))).toBe(null);
    expect(nearFacility(spawnPos(0, 'return'))).toBe(null);
  });

  it('걷기: 방향, 달리기가 더 빠름, 경계에서 멈춤', () => {
    const a = newWalker(spawnPos(0)), r = newWalker(spawnPos(0));
    for (let i = 0; i < 30; i++) {
      stepWalker(a, { mx: -1, my: 0, run: false }, TICK, b);
      stepWalker(r, { mx: -1, my: 0, run: true }, TICK, b);
    }
    expect(a.facing).toBe(-1);
    expect(a.moving).toBe(true);
    expect(r.pos.x).toBeLessThan(a.pos.x);
    for (let i = 0; i < 2000; i++) stepWalker(a, { mx: -1, my: 1, run: true }, TICK, b);
    expect(a.pos.x).toBe(b.minX);
    expect(a.pos.y).toBe(b.maxY);
    expect(a.moving).toBe(false);
  });
});
