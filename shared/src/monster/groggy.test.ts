import { describe, expect, it } from 'vitest';
import { enterGroggy, recordGroggyHit } from './groggy';
import { newMonster } from './state';

describe('보스 졸음 연장 (dungeon.md 3장)', () => {
  const bear = () => {
    const m = newMonster(1, 'mossbear', 100, 50);
    enterGroggy(m, 3);
    return m;
  };
  it('솔로: 한 사람이 15히트를 채우면 +1초, 한 번만', () => {
    const m = bear();
    for (let i = 0; i < 14; i++) expect(recordGroggyHit(m, 'a', false)).toBe(false);
    expect(recordGroggyHit(m, 'a', false)).toBe(true);
    expect(m.timer).toBe(4);
    for (let i = 0; i < 30; i++) recordGroggyHit(m, 'a', false);
    expect(m.timer).toBe(4);
  });
  it('파티: 서로 다른 2명이 때리면 +1초 (한 사람이 많이 때려도 아님)', () => {
    const m = bear();
    for (let i = 0; i < 20; i++) expect(recordGroggyHit(m, 'a', true)).toBe(false);
    expect(recordGroggyHit(m, 'b', true)).toBe(true);
    expect(m.timer).toBe(4);
  });
  it('졸음이 아니면 기록하지 않음, 졸음에 다시 들어가면 처음부터', () => {
    const m = newMonster(1, 'mossbear', 100, 50);
    expect(recordGroggyHit(m, 'a', true)).toBe(false);
    enterGroggy(m, 3);
    recordGroggyHit(m, 'a', true);
    recordGroggyHit(m, 'b', true);
    enterGroggy(m, 3);
    expect([m.groggyExtended, m.groggyHits]).toEqual([0, {}]);
  });
});
