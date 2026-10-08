import { describe, expect, it } from 'vitest';
import { color, colorInt, paletteNumber } from './palette';

describe('palette', () => {
  it('경로로 색을 읽음', () => {
    expect(color('global.outline')).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(colorInt('global.outline')).toBe(parseInt(color('global.outline').slice(1), 16));
    expect(color('global.playerColors.0')).toMatch(/^#/);
  });
  it('숫자 값', () => {
    expect(paletteNumber('global.blobShadow.opacity')).toBeGreaterThan(0);
  });
  it('없는 경로·색 아닌 값은 오류', () => {
    expect(() => color('global.nope')).toThrow();
    expect(() => color('floors.1.name')).toThrow();
    expect(() => paletteNumber('global.outline')).toThrow();
  });
});
