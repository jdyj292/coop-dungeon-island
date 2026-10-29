import { describe, expect, it } from 'vitest';
import { ISLAND, ITEMS } from '../data/load';
import { TILE } from '../constants';
import { canMoveFacility, canPlace, footprint, placedAt, placementBlocks, reservedCells, type Placed } from './placement';
import { defaultFacilities, facilitiesWith } from './world';

const well = ISLAND.facilities.find((f) => f.id === 'well')!;
const P = ISLAND.place;
const free = { x: P.x + 1, y: P.y + 1 };

describe('장식 배치 규칙', () => {
  it('회전하면 칸이 바뀐다 (벤치 2×1 → 1×2)', () => {
    expect(footprint('bench', 5, 5, 0)).toEqual({ x: 5, y: 5, w: 2, h: 1 });
    expect(footprint('bench', 5, 5, 1)).toEqual({ x: 5, y: 5, w: 1, h: 2 });
  });

  it('빈 칸은 놓을 수 있고, 영역 밖·시설·우물 주변·시설 입구는 안 됨', () => {
    expect(canPlace('fence', free.x, free.y, 0, [])).toBeNull();
    expect(canPlace('fence', P.x - 1, free.y, 0, [])).toBe('outside');
    expect(canPlace('bench', P.x + P.w - 1, free.y, 0, [])).toBe('outside');
    expect(canPlace('fence', well.x, well.y, 0, [])).toBe('facility');
    expect(canPlace('fence', well.x - 1, well.y, 0, [])).toBe('clearance');
    const shop = ISLAND.facilities.find((f) => f.id === 'shop')!;
    expect(canPlace('fence', shop.x, shop.y + shop.h, 0, [])).toBe('clearance');
    expect(reservedCells().length).toBe(ISLAND.facilities.length + 2);
    expect(canPlace('fence', ISLAND.spawn.return.x, ISLAND.spawn.return.y, 0, [])).toBe('clearance');
    expect(canPlace('nope', free.x, free.y, 0, [])).toBe('unknown');
  });

  it('섬 기본 장식은 모두 놓을 수 있는 자리 (서로 겹치지 않음, island.md 7장)', () => {
    const placed: Placed[] = [];
    for (const [i, d] of ISLAND.starterDecor.entries()) {
      expect([d.itemId, canPlace(d.itemId, d.x, d.y, d.rot, placed)]).toEqual([d.itemId, null]);
      placed.push({ id: String(i), itemId: d.itemId, x: d.x, y: d.y, rot: d.rot });
    }
  });

  it('다른 장식과 겹치면 안 됨, 옮기는 자기 자신은 무시', () => {
    const placed: Placed[] = [{ id: 'a', itemId: 'bench', x: free.x, y: free.y, rot: 0 }];
    expect(canPlace('fence', free.x + 1, free.y, 0, placed)).toBe('overlap');
    expect(canPlace('bench', free.x + 1, free.y, 0, placed, [], 'a')).toBeNull();
    expect(placedAt(placed, free.x + 1, free.y)?.id).toBe('a');
    expect(placedAt(placed, free.x + 2, free.y)).toBeUndefined();
  });

  it('걸을 수 없는 장식은 주민이 선 칸에 못 놓음, 걸을 수 있는 것은 됨', () => {
    const someone = [{ x: (free.x + 0.5) * TILE, y: (free.y + 0.5) * TILE }];
    expect(canPlace('fence', free.x, free.y, 0, [], someone)).toBe('occupied');
    expect(canPlace('flowerBed', free.x, free.y, 0, [], someone)).toBeNull();
  });

  it('장애물은 걸을 수 없는 장식만', () => {
    const blocks = placementBlocks([
      { id: 'a', itemId: 'fence', x: 6, y: 6, rot: 0 }, { id: 'b', itemId: 'flowerBed', x: 8, y: 6, rot: 0 },
    ]);
    expect(blocks).toEqual([{ x0: 96, y0: 96, x1: 112, y1: 112, kind: 'fence' }]);
  });

  it('시설 옮기기: 우물은 고정, 빈 곳은 됨, 영역 밖·다른 시설·입구 막힘·사람 위는 안 됨 (island.md 2장)', () => {
    const facs = defaultFacilities();
    expect(canMoveFacility('well', free.x, free.y, facs, [])).toBe('fixed');
    expect(canMoveFacility('nope', free.x, free.y, facs, [])).toBe('unknown');
    expect(canMoveFacility('shop', free.x, free.y, facs, [])).toBeNull();
    // 입구 줄(맨 아래 + 1)도 영역 안이어야 함
    expect(canMoveFacility('shop', free.x, P.y + P.h - 2, facs, [])).toBe('outside');
    expect(canMoveFacility('shop', well.x, well.y, facs, [])).toBe('facility');
    expect(canMoveFacility('shop', well.x + well.w, well.y, facs, [])).toBe('clearance');
    // 몸에 장식 → overlap, 입구에 장식 → entrance
    expect(canMoveFacility('shop', free.x, free.y, facs, [{ id: 'a', itemId: 'flowerBed', x: free.x + 1, y: free.y + 1, rot: 0 }])).toBe('overlap');
    expect(canMoveFacility('shop', free.x, free.y, facs, [{ id: 'a', itemId: 'flowerBed', x: free.x, y: free.y + 2, rot: 0 }])).toBe('entrance');
    expect(canMoveFacility('shop', free.x, free.y, facs, [], [{ x: (free.x + 0.5) * TILE, y: (free.y + 0.5) * TILE }])).toBe('occupied');
    // 제자리 (자기 자신은 무시)
    const shop = facs.find((f) => f.id === 'shop')!;
    expect(canMoveFacility('shop', shop.x, shop.y, facs, [])).toBeNull();
  });

  it('옮긴 시설 기준으로 장식 규칙 (원래 자리는 비고, 새 자리·입구는 막힘)', () => {
    const shop = ISLAND.facilities.find((f) => f.id === 'shop')!;
    const facs = facilitiesWith([{ id: 'shop', x: free.x, y: free.y }, { id: 'well', x: 1, y: 1 }]);
    expect(facs.find((f) => f.id === 'well')).toMatchObject({ x: well.x, y: well.y });
    expect(canPlace('fence', shop.x, shop.y, 0, [], [], undefined, facs)).toBeNull();
    expect(canPlace('fence', free.x, free.y, 0, [], [], undefined, facs)).toBe('facility');
    expect(canPlace('fence', free.x, free.y + shop.h, 0, [], [], undefined, facs)).toBe('clearance');
  });

  it('가입 선물은 있는 장식만', () => {
    for (const id of Object.keys(ITEMS.starter)) expect(ITEMS.decorations[id]).toBeDefined();
  });
});
