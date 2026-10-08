import { describe, expect, it } from 'vitest';
import base from '../../data/sprites/character/base.json';
import outfits from '../../data/sprites/character/outfits.json';
import materials from '../../data/sprites/materials.json';
import poses from '../../data/sprites/poses.json';
import weapons from '../../data/sprites/weapons_visual.json';
import { parseSpriteData, spriteData } from './data';

const raw = () => structuredClone({ base, outfits, poses, weapons, materials });

describe('parseSpriteData', () => {
  it('확정 데이터 통과', () => {
    expect(() => spriteData()).not.toThrow();
  });
  it('행 길이 불일치', () => {
    const r = raw();
    r.base.faces.normal.rows[0] += '.';
    expect(() => parseSpriteData(r)).toThrow(/길이/);
  });
  it('정의되지 않은 글자', () => {
    const r = raw();
    r.base.faces.normal.rows[0] = r.base.faces.normal.rows[0]!.replace('E', 'Z');
    expect(() => parseSpriteData(r)).toThrow(/정의되지 않은/);
  });
  it('8방향이 아닌 dir', () => {
    const r = raw();
    r.poses.greatsword.slash.weapons[0]!.dir = [2, 0];
    expect(() => parseSpriteData(r)).toThrow();
  });
  it('잘못된 층 이름', () => {
    const r = raw();
    (r.base.parts[0] as { layer: string }).layer = 'body';
    expect(() => parseSpriteData(r)).toThrow();
  });
});
