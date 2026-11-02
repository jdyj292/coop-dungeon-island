// 보유 카드: 받기(3장이면 바로 강화, 강화한 카드는 갈림)·남은 장수 조각으로·지정 구매·변형 (skills.md 1장, balance.md 7장 카드 경제)
import { describe, expect, it } from 'vitest';
import { craftPriceOf, dustOf, passiveCap, passiveCost } from './catalog';
import { addCards, checkCraft, checkVariant, grindSpares, owns, receiveCards, starterCollection } from './collection';

describe('티어별 값', () => {
  it('조각·지정 구매·패시브 비용 (= 티어)·패시브 한도', () => {
    expect([dustOf('gs_whirl'), dustOf('gs_quake'), dustOf('gs_crush')]).toEqual([5, 20, 100]);
    expect([craftPriceOf('gs_whirl'), craftPriceOf('gs_quake'), craftPriceOf('gs_crush')]).toEqual([40, 100, 400]);
    expect([passiveCost('gs_heavyhand'), passiveCost('gs_stomp'), passiveCost('gs_giant')]).toEqual([1, 2, 3]);
    expect([passiveCap(1), passiveCap(2), passiveCap(3), passiveCap(19), passiveCap(20)]).toEqual([2, 2, 3, 11, 11]);
  });
});

describe('강화 (3장이 모이면 바로)', () => {
  it('3장째에서 강화(3장 소모), 그 뒤 같은 카드는 갈림, 모르는 카드는 버림', () => {
    const r = receiveCards({ gs_whirl: { count: 1, enhanced: false } }, ['gs_whirl', 'gs_wave', 'gs_whirl', 'gs_whirl', 'nope']);
    expect(r.merged).toEqual([false, false, true, false, false]);
    expect(r.ground).toEqual([0, 0, 0, 5, 0]);
    expect(r.cards.gs_whirl).toEqual({ count: 0, enhanced: true });
    expect(r.cards.gs_wave).toEqual({ count: 1, enhanced: false });
    expect(r.cards.nope).toBeUndefined();
    expect(addCards({}, ['nope'])).toEqual({});
  });

  it('처음 카드 = 무기별 기본 스킬 1장씩', () => {
    expect(starterCollection(['greatsword'])).toEqual({ gs_launch: { count: 1, enhanced: false }, gs_earthsplit: { count: 1, enhanced: false } });
  });
});

describe('남은 장수·지정 구매·변형', () => {
  const c = { gs_whirl: { count: 2, enhanced: false }, gs_launch: { count: 0, enhanced: true, variant: 'double' } };

  it('강화한 카드에 남은 보관 장수만 조각으로 (강화 전 카드는 그대로)', () => {
    const g = grindSpares({ ...c, gs_quake: { count: 2, enhanced: true } });
    expect(g.dust).toBe(40);
    expect(g.ids).toEqual(['gs_quake']);
    expect(g.cards.gs_quake).toEqual({ count: 0, enhanced: true });
    expect(g.cards.gs_whirl).toEqual(c.gs_whirl);
    expect(owns(g.cards, 'gs_quake')).toBe(true);
    expect(grindSpares(c).dust).toBe(0);
  });

  it('지정 구매는 조각만 보고 숙련도는 안 봄, 이미 강화한 카드는 못 삼', () => {
    expect(checkCraft(c, 'gs_crush', 399)).toBe('dust');
    expect(checkCraft(c, 'gs_crush', 400)).toBeNull();
    expect(checkCraft(c, 'x', 9999)).toBe('card');
    expect(checkCraft(c, 'gs_launch', 9999)).toBe('done');
  });

  it('팩 카드: 이미 강화한 카드는 갈려 조각, 3장째는 강화, 나머지는 보관', () => {
    const r = receiveCards(c, ['gs_launch', 'gs_whirl', 'gs_launch', 'gs_quake']);
    expect(r.ground).toEqual([5, 0, 5, 0]);
    expect(r.merged).toEqual([false, true, false, false]);
    expect(r.cards.gs_launch).toEqual(c.gs_launch);
    expect(r.cards.gs_whirl).toEqual({ count: 0, enhanced: true });
    expect(r.cards.gs_quake).toEqual({ count: 1, enhanced: false });
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
