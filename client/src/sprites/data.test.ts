import { describe, expect, it } from 'vitest';
import base from '../../data/sprites/character/base.json';
import outfits from '../../data/sprites/character/outfits.json';
import materials from '../../data/sprites/materials.json';
import poses from '../../data/sprites/poses.json';
import monsters from '../../data/sprites/monsters.json';
import weapons from '../../data/sprites/weapons_visual.json';
import gameMonsters from '../../../shared/data/monsters.json';
import { parseSpriteData, spriteData } from './data';

const raw = () => structuredClone({ base, outfits, poses, weapons, materials, monsters });

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
  it('몬스터: 없는 프레임을 가리키는 상태', () => {
    const r = raw();
    r.monsters.boar.states.idle = ['idle1', 'nope'];
    expect(() => parseSpriteData(r)).toThrow(/없는 프레임/);
  });
  it('몬스터: 격자 밖 발밑', () => {
    const r = raw();
    r.monsters.boar.frames.idle1.foot = [99, 0];
    expect(() => parseSpriteData(r)).toThrow(/격자 밖/);
  });
  it('게임 데이터의 몬스터 sprite가 모두 있음', () => {
    const { monsters } = spriteData();
    for (const [id, m] of Object.entries(gameMonsters)) {
      if (id.startsWith('_')) continue;
      expect(monsters[(m as { sprite: string }).sprite], id).toBeDefined();
    }
  });
  it('잘못된 층 이름', () => {
    const r = raw();
    (r.base.parts[0] as { layer: string }).layer = 'body';
    expect(() => parseSpriteData(r)).toThrow();
  });
});
