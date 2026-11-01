// 보유 카드: 3장 합치기·갈기·지정 구매·변형 (skills.md 1장, balance.md 7장 카드 경제)
import { describe, expect, it } from 'vitest';
import { craftPriceOf, dustOf, passiveCap, passiveCost } from './catalog';
import { addCards, canEnhance, checkCraft, checkEnhance, checkGrind, checkVariant, enhanceCard, grindCards, owns, spareCount, starterCollection } from './collection';
import { checkEnhanceCap } from './equip';

describe('티어별 값', () => {
  it('조각·지정 구매·패시브 비용 (강화 +1)·패시브 한도', () => {
    expect([dustOf('gs_whirl'), dustOf('gs_quake'), dustOf('gs_crush')]).toEqual([5, 20, 100]);
    expect([craftPriceOf('gs_whirl'), craftPriceOf('gs_quake'), craftPriceOf('gs_crush')]).toEqual([40, 100, 400]);
    expect([passiveCost('gs_heavyhand', false), passiveCost('gs_heavyhand', true), passiveCost('gs_giant', false)]).toEqual([1, 2, 3]);
    expect([passiveCap(1), passiveCap(2), passiveCap(3), passiveCap(19), passiveCap(20)]).toEqual([2, 2, 3, 11, 11]);
  });
});

describe('강화 (직접)', () => {
  it('카드를 더해도 저절로 강화되지 않음, 강화하면 3장 소모 · 그 뒤 카드는 보관만', () => {
    const r = addCards({ gs_whirl: { count: 1, enhanced: false } }, ['gs_whirl', 'gs_wave', 'gs_whirl', 'gs_whirl']);
    expect(r.gs_whirl).toEqual({ count: 4, enhanced: false });
    expect(r.gs_wave).toEqual({ count: 1, enhanced: false });
    expect(canEnhance(r, 'gs_whirl')).toBe(true);
    expect(checkEnhance(r, 'gs_wave')).toBe('merge');
    expect(checkEnhance(r, 'gs_crush')).toBe('owned');
    expect(checkEnhance(r, 'nope')).toBe('card');
    const e = enhanceCard(r, 'gs_whirl');
    expect(e.gs_whirl).toEqual({ count: 1, enhanced: true });
    expect(spareCount(e, 'gs_whirl')).toBe(1);
    expect(checkEnhance(e, 'gs_whirl')).toBe('merge');
    expect(addCards({}, ['nope'])).toEqual({});
  });

  it('끼운 패시브를 강화하면 비용 +1, 한도를 넘으면 cap', () => {
    const c = enhanceCard({ gs_heavyhand: { count: 3, enhanced: false }, gs_steadfast: { count: 1, enhanced: false } }, 'gs_heavyhand');
    expect(checkEnhanceCap(1, c, { active: [], passive: ['gs_heavyhand', 'gs_steadfast'] })).toBe('cap');
    expect(checkEnhanceCap(3, c, { active: [], passive: ['gs_heavyhand', 'gs_steadfast'] })).toBeNull();
  });

  it('처음 카드 = 무기별 기본 스킬 1장씩', () => {
    expect(starterCollection(['greatsword'])).toEqual({ gs_launch: { count: 1, enhanced: false }, gs_earthsplit: { count: 1, enhanced: false } });
  });
});

describe('갈기·지정 구매·변형', () => {
  const c = { gs_whirl: { count: 2, enhanced: false }, gs_launch: { count: 0, enhanced: true, variant: 'double' } };

  it('보관 장수만큼, 장착한 기본 카드의 마지막 장은 못 갊', () => {
    expect(checkGrind(c, 'gs_whirl', 3, false)).toBe('owned');
    expect(checkGrind(c, 'gs_whirl', 2, true)).toBe('equipped');
    expect(checkGrind(c, 'gs_whirl', 2, false)).toBeNull();
    expect(checkGrind(c, 'gs_launch', 1, false)).toBe('owned');
    const g = grindCards(c, 'gs_whirl', 2);
    expect(g.dust).toBe(10);
    expect(owns(g.cards, 'gs_whirl')).toBe(false);
  });

  it('지정 구매는 조각만 보고 숙련도는 안 봄', () => {
    expect(checkCraft('gs_crush', 399)).toBe('dust');
    expect(checkCraft('gs_crush', 400)).toBeNull();
    expect(checkCraft('x', 9999)).toBe('card');
  });

  it('변형은 강화한 액티브만, null = 기본 동작', () => {
    expect(checkVariant(c, 'gs_launch', 'wind')).toBeNull();
    expect(checkVariant(c, 'gs_launch', null)).toBeNull();
    expect(checkVariant(c, 'gs_launch', 'zzz')).toBe('variant');
    expect(checkVariant(c, 'gs_whirl', 'rush')).toBe('variant');
    expect(checkVariant(c, 'gs_heavyhand', null)).toBe('card');
    expect(checkVariant(c, 'gs_wave', 'big')).toBe('owned');
  });
});
