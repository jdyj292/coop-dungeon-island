import { describe, expect, it } from 'vitest';
import { hexToHsl, hexToInt, isHex } from './color';

describe('color', () => {
  it('isHex', () => {
    expect(isHex('#2A2540')).toBe(true);
    expect(isHex('#fff')).toBe(false);
    expect(isHex('2A2540')).toBe(false);
    expect(isHex(42)).toBe(false);
  });
  it('hexToInt', () => {
    expect(hexToInt('#FF5A3C')).toBe(0xff5a3c);
    expect(() => hexToInt('red')).toThrow();
  });
  it('hexToHsl 기본색', () => {
    expect(hexToHsl('#FFFFFF')).toEqual({ h: 0, s: 0, l: 100 });
    expect(hexToHsl('#000000')).toEqual({ h: 0, s: 0, l: 0 });
    expect(hexToHsl('#FF0000')).toEqual({ h: 0, s: 100, l: 50 });
    expect(hexToHsl('#00FF00').h).toBe(120);
    expect(hexToHsl('#0000FF').h).toBe(240);
  });
  it('hexToHsl 중간색', () => {
    const { s, l } = hexToHsl('#5F7A47');
    expect(s).toBeCloseTo(26.4, 1);
    expect(l).toBeCloseTo(37.8, 1);
  });
});
