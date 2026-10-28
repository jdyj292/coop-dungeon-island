import { describe, expect, it } from 'vitest';
import { COMBAT } from '../data/load';
import { AttackTokens } from './tokens';

describe('공격 토큰', () => {
  it('솔로: 하나 내준 뒤 tokenGap초 동안 다음 몬스터는 못 받음', () => {
    const t = new AttackTokens(1);
    expect(t.gap).toBe(COMBAT.tokenGap[0]);
    expect(t.gap).toBeGreaterThan(0);
    expect(t.tryTake(1)).toBe(true);
    expect(t.available(1)).toBe(true); // 가진 몬스터는 그대로
    expect(t.tryTake(2)).toBe(false);
    t.step(t.gap - 0.01);
    expect(t.available(2)).toBe(false);
    t.step(0.02);
    expect(t.tryTake(2)).toBe(true);
    t.step(t.gap);
    expect(t.tryTake(3)).toBe(false); // 수(2) 꽉 참
    t.release(1);
    expect(t.tryTake(3)).toBe(true);
  });
  it('간격 0이면 수만큼 바로 받음', () => {
    const t = new AttackTokens(2);
    expect(t.gap).toBe(COMBAT.tokenGap[1]);
    for (let i = 0; i < t.count; i++) expect(t.tryTake(i)).toBe(true);
  });
});
