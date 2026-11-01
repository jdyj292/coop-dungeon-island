// 카드팩 굴림: 티어 확률·마지막 장·천장·티어 3이 없는 무기 (balance.md 7장 카드 경제)
import { describe, expect, it } from 'vitest';
import { packOpen, tierOf } from './catalog';
import { lastOddsOf, rollPack } from './pack';
import { PACKS } from '../data/load';

/** 같은 순서로 도는 난수 (mulberry32) */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('카드팩', () => {
  it('팩 1: 4장, 그 무기 카드, 마지막 장은 티어 2, 티어 1~3번째 장 약 80%', () => {
    const rng = seeded(1);
    let t1 = 0, n = 0;
    for (let i = 0; i < 2000; i++) {
      const r = rollPack('greatsword', 1, 0, rng);
      expect(r.cards).toHaveLength(4);
      expect(r.tiers[3]).toBe(2);
      expect(r.cards.map(tierOf)).toEqual(r.tiers);
      expect(r.opened).toBe(0);
      for (const t of r.tiers.slice(0, 3)) { n++; if (t === 1) t1++; }
      expect(r.cards.every((id) => id.startsWith('gs_') || id === 'greatsword.quickrise')).toBe(true);
    }
    expect(t1 / n).toBeGreaterThan(0.77);
    expect(t1 / n).toBeLessThan(0.83);
  });

  it('팩 2 마지막 장 확률 = lastOdds, 팩 1은 odds에서 다시 나눔', () => {
    expect(lastOddsOf(PACKS['2']!)).toEqual([80, 20]);
    expect(lastOddsOf(PACKS['1']!)).toEqual([20]);
  });

  it('천장: 10팩째까지 티어 3이 없으면 10팩째 마지막 장 = 티어 3, 나오면 0으로', () => {
    const never = () => 0;
    const r9 = rollPack('greatsword', 2, 8, never);
    expect(r9.tiers).toEqual([1, 1, 1, 2]);
    expect(r9.opened).toBe(9);
    const r10 = rollPack('greatsword', 2, 9, never);
    expect(r10.tiers).toEqual([1, 1, 1, 3]);
    expect(r10.opened).toBe(0);
  });

  it('티어 3 카드가 없는 무기(스태프)는 티어 2로, 천장 없음', () => {
    const top = () => 0.9999;
    const r = rollPack('staff', 2, 9, top);
    expect(r.tiers).toEqual([2, 2, 2, 2]);
    expect(r.opened).toBe(0);
  });

  it('열리는 숙련도', () => {
    expect([packOpen(1, 1), packOpen(2, 5), packOpen(2, 6), packOpen(9, 99)]).toEqual([true, false, true, false]);
  });
});
