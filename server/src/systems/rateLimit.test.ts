import { describe, expect, it } from 'vitest';
import { RateLimit } from './rateLimit';

describe('RateLimit', () => {
  it('창 안에 max회까지, 창이 지나면 다시 허용', () => {
    const r = new RateLimit({ chat: [3000, 3] });
    expect([0, 100, 200, 300].map((t) => r.allow('chat', t))).toEqual([true, true, true, false]);
    expect(r.allow('chat', 3001)).toBe(true);
    expect(r.allow('ping', 0)).toBe(true);
  });
});
