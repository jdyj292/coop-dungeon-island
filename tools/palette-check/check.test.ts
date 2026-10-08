import { describe, expect, it } from 'vitest';
import { checkPalette, type Rules } from './check';

const rules: Rules = {
  ranges: {
    islandBg: { s: [20, 65], l: [40, 80] },
    dungeonBg: { s: [5, 45], l: [15, 45] },
    main: { s: [35, 90], l: [45, 85], brighterThanBg: 18 },
    effect: { s: [60, 100], l: [75, 100] },
  },
  roles: { islandBg: [], dungeonBg: ['floors.*.bg.*'], main: ['floors.*.monster.*'], effect: [] },
  warnOnly: ['floors.2'],
  nonColor: ['floors.*.name'],
};

const palette = (monster: string) => ({
  floors: {
    '1': { name: '숲', bg: { floor: '#5F7A47' }, monster: { a: monster } },
    '2': { name: '굴', bg: { floor: '#5F7A47' }, monster: { a: '#808080' } },
  },
});

describe('checkPalette', () => {
  it('규칙 안의 색은 오류 없음, MVP 밖 층은 경고', () => {
    const issues = checkPalette(palette('#E8834A'), rules);
    expect(issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(issues.some((i) => i.level === 'warn' && i.path === 'floors.2.monster.a')).toBe(true);
  });
  it('배경보다 충분히 밝지 않으면 오류', () => {
    const issues = checkPalette(palette('#6E9A55'), rules);
    expect(issues.some((i) => i.level === 'error' && /배경/.test(i.message))).toBe(true);
  });
  it('hex 형식 오류', () => {
    const issues = checkPalette(palette('orange'), rules);
    expect(issues.some((i) => /hex/.test(i.message))).toBe(true);
  });
  it('재질의 없는 경로', () => {
    const issues = checkPalette(palette('#E8834A'), rules, { shaded: { s: 'floors.1.nope', h: '$hairColor' } });
    expect(issues.map((i) => i.path)).toEqual(expect.arrayContaining(['materials.shaded.s']));
    expect(issues.some((i) => i.path === 'materials.shaded.h')).toBe(false);
  });
});
