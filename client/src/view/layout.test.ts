import { describe, expect, it } from 'vitest';
import { TILE } from '@game/shared';
import { FLOOR_TOP, followCamera, project } from './layout';

describe('project', () => {
  it('깊이 1타일 = 화면 10px, 높이는 위로', () => {
    expect(project(0, 0)).toEqual({ sx: 0, sy: FLOOR_TOP });
    expect(project(5, TILE)).toEqual({ sx: 5, sy: FLOOR_TOP + 10 });
    expect(project(5, TILE, 4)).toEqual({ sx: 5, sy: FLOOR_TOP + 6 });
  });
  it('9타일 깊이가 바닥 90px (50~140)', () => {
    expect(project(0, 9 * TILE).sy).toBe(140);
  });
  it('정수 픽셀', () => {
    expect(Number.isInteger(project(3.4, 7.3, 0.2).sy)).toBe(true);
  });
});

describe('followCamera', () => {
  const DZ = 2 * TILE;
  it('데드존 안에서는 움직이지 않음', () => {
    expect(followCamera(200, 220, DZ, 288, 640).center).toBe(200);
  });
  it('데드존을 넘으면 따라감', () => {
    expect(followCamera(200, 250, DZ, 288, 640)).toEqual({ center: 218, scrollX: 74 });
  });
  it('방 경계에서 멈춤', () => {
    expect(followCamera(200, 0, DZ, 288, 640).scrollX).toBe(0);
    expect(followCamera(200, 640, DZ, 288, 640).scrollX).toBe(640 - 288);
  });
  it('방이 화면보다 좁으면 가운데', () => {
    expect(followCamera(0, 50, DZ, 320, 300).scrollX).toBe(-10);
  });
});
