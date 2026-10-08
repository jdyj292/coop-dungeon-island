import { describe, expect, it } from 'vitest';
import { leaves, matchPath, resolvePath } from './palettePath';

const data = { _note: 'x', a: { b: '#111111', list: ['#222222'] }, n: 1 };

describe('palettePath', () => {
  it('resolvePath', () => {
    expect(resolvePath(data, 'a.b')).toBe('#111111');
    expect(resolvePath(data, 'a.list.0')).toBe('#222222');
    expect(resolvePath(data, 'a.zz')).toBeUndefined();
    expect(resolvePath(data, 'n.x')).toBeUndefined();
  });
  it('leaves는 _ 키를 건너뜀', () => {
    expect([...leaves(data)]).toEqual([
      ['a.b', '#111111'],
      ['a.list.0', '#222222'],
      ['n', 1],
    ]);
  });
  it('matchPath', () => {
    expect(matchPath('floors.*.bg.*', 'floors.1.bg.floor')).toBe(true);
    expect(matchPath('floors.*.bg.*', 'floors.1.monster.boar')).toBe(false);
    expect(matchPath('floors.*.bg', 'floors.1.bg.floor')).toBe(false);
  });
});
