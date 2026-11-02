// 장착: 액티브 4칸·패시브 비용 한도·장착 숙련도 (skills.md 1장)
import { describe, expect, it } from 'vitest';
import { checkEquip, defaultLoadout, equipCard, passiveUsed } from './equip';

const owned = {
  gs_launch: { count: 1, enhanced: false }, gs_earthsplit: { count: 1, enhanced: false }, gs_wave: { count: 1, enhanced: false },
  gs_quake: { count: 1, enhanced: false }, gs_heavyhand: { count: 0, enhanced: true }, gs_keenedge: { count: 1, enhanced: false },
  gs_honing: { count: 1, enhanced: false }, st_orb: { count: 1, enhanced: false },
};
const lo = defaultLoadout('greatsword');

describe('액티브 칸', () => {
  it('기본 배치 = A S 처음 카드', () => {
    expect(lo).toEqual({ active: ['gs_launch', 'gs_earthsplit', null, null], passive: [] });
  });

  it('그 칸 카드와 자리를 바꾸거나 빠짐, null = 비우기', () => {
    expect(equipCard(lo, 'active', 2, 'gs_wave').active).toEqual(['gs_launch', 'gs_earthsplit', 'gs_wave', null]);
    expect(equipCard(lo, 'active', 1, 'gs_launch').active).toEqual(['gs_earthsplit', 'gs_launch', null, null]);
    expect(equipCard(lo, 'active', 0, null).active).toEqual([null, 'gs_earthsplit', null, null]);
  });

  it('없는 칸·다른 무기·패시브·안 가진 카드·숙련도 모자람은 거절', () => {
    expect(checkEquip('greatsword', 1, owned, lo, 'active', 4, 'gs_wave')).toBe('slot');
    expect(checkEquip('greatsword', 1, owned, lo, 'active', 2, 'st_orb')).toBe('card');
    expect(checkEquip('greatsword', 1, owned, lo, 'active', 2, 'gs_heavyhand')).toBe('card');
    expect(checkEquip('greatsword', 1, owned, lo, 'active', 2, 'gs_whirl')).toBe('owned');
    expect(checkEquip('greatsword', 5, owned, lo, 'active', 2, 'gs_quake')).toBe('locked');
    expect(checkEquip('greatsword', 6, owned, lo, 'active', 2, 'gs_quake')).toBeNull();
    expect(checkEquip('greatsword', 1, owned, lo, 'active', 0, null)).toBeNull();
  });
});

describe('패시브 (비용 합계 한도)', () => {
  it('끝에 더하기·자리 바꾸기·옮기기·빼기', () => {
    let p = equipCard(lo, 'passive', 0, 'gs_keenedge');
    p = equipCard(p, 'passive', 1, 'gs_honing');
    expect(p.passive).toEqual(['gs_keenedge', 'gs_honing']);
    expect(equipCard(p, 'passive', 0, 'gs_heavyhand').passive).toEqual(['gs_heavyhand', 'gs_honing']);
    expect(equipCard(p, 'passive', 0, 'gs_honing').passive).toEqual(['gs_honing', 'gs_keenedge']);
    expect(equipCard(p, 'passive', 0, null).passive).toEqual(['gs_honing']);
  });

  it('한도를 넘으면 거절 (Lv1 한도 2, 강화해도 비용 그대로)', () => {
    const one = equipCard(lo, 'passive', 0, 'gs_keenedge'), two = equipCard(one, 'passive', 1, 'gs_honing');
    expect(checkEquip('greatsword', 1, owned, one, 'passive', 1, 'gs_heavyhand')).toBeNull();
    expect(checkEquip('greatsword', 1, owned, two, 'passive', 2, 'gs_heavyhand')).toBe('cap');
    expect(checkEquip('greatsword', 1, owned, two, 'passive', 0, 'gs_heavyhand')).toBeNull();
    expect(checkEquip('greatsword', 3, owned, two, 'passive', 2, 'gs_heavyhand')).toBeNull();
    expect(passiveUsed(['gs_keenedge', 'gs_heavyhand'])).toBe(2);
    expect(checkEquip('greatsword', 1, owned, one, 'passive', 2, 'gs_honing')).toBe('slot');
    expect(checkEquip('greatsword', 1, owned, one, 'passive', 1, null)).toBe('slot');
  });
});
