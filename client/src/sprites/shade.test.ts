import { describe, expect, it } from 'vitest';
import { ramp, shade } from './shade';

const lum = (hex: string) =>
  parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);

describe('ramp', () => {
  it('기본색은 그대로, 밝음 > 기본 > 그림자 > 가장 어두움', () => {
    const [light, basic, dark, darkest] = ramp('#C9734B');
    expect(basic).toBe('#C9734B');
    expect(lum(light)).toBeGreaterThan(lum(basic));
    expect(lum(dark)).toBeLessThan(lum(basic));
    expect(lum(darkest)).toBeLessThan(lum(dark));
  });
});

describe('shade', () => {
  const R = ramp('#C9734B');
  const base = { shaded: { t: R }, fixed: { E: '#000001' }, outline: '#2A2540' };
  const at = (s: ReturnType<typeof shade>, x: number, y: number) => s.pixels[y * s.width + x];

  it('외곽선: 위·왼쪽은 재질의 가장 어두움, 아래·오른쪽은 공통 외곽선', () => {
    const s = shade({ ...base, rows: ['tt', 'tt'] });
    expect([s.width, s.height]).toEqual([4, 4]);
    expect(at(s, 1, 0)).toBe(R[3]);
    expect(at(s, 0, 1)).toBe(R[3]);
    expect(at(s, 1, 3)).toBe('#2A2540');
    expect(at(s, 3, 1)).toBe('#2A2540');
    expect(at(s, 0, 0)).toBeNull();
  });
  it('윗면은 밝음, 아랫면은 그림자', () => {
    const s = shade({ ...base, rows: ['ttt', 'ttt', 'ttt'] });
    expect(at(s, 2, 1)).toBe(R[0]);
    expect(at(s, 2, 3)).toBe(R[2]);
  });
  it('고정색은 그대로, 그 외곽선은 공통색', () => {
    const s = shade({ ...base, rows: ['E'] });
    expect(at(s, 1, 1)).toBe('#000001');
    expect(at(s, 1, 0)).toBe('#2A2540');
  });
  it('외곽선 덮어쓰기', () => {
    const s = shade({ ...base, rows: ['t'], outlineOverride: '#F5C542' });
    expect(s.pixels.filter((p) => p === '#F5C542')).toHaveLength(4);
  });
  it('색이 없는 재질은 오류', () => {
    expect(() => shade({ ...base, rows: ['z'] })).toThrow();
  });
});
