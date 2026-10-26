import { describe, expect, it } from 'vitest';
import { spriteData } from '../sprites/data';
import { HAIR_NAMES, HAIR_STYLES, hairOfLook } from './look';
import { LOOK } from '@game/shared';

describe('외형 번호', () => {
  it('던전 look 문자열 → 머리 (없거나 잘못되면 기본)', () => {
    expect(hairOfLook('beginner:2:3:1')).toEqual({ style: 2, color: 3 });
    expect(hairOfLook('')).toEqual({ style: 0, color: 0 });
    expect(hairOfLook(undefined)).toEqual({ style: 0, color: 0 });
  });
  it('머리 모양 목록 = 서버 개수 = 스프라이트 데이터', () => {
    expect(HAIR_STYLES.length).toBe(LOOK.hairStyles);
    expect(HAIR_NAMES.length).toBe(LOOK.hairStyles);
    for (const h of HAIR_STYLES) expect(spriteData().base.hairStyles[h]).toBeDefined();
  });
});
