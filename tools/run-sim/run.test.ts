import { describe, expect, it } from 'vitest';
import { runOnce } from './run';

describe('run-sim (roadmap 3-9)', () => {
  it('2인 무적 봇: 1번 방부터 보스까지 막힘 없이 클리어, 코인·경험치가 한 판 목표 근처', () => {
    const r = runOnce(2, 1, true);
    expect(r.result).toBe('clear');
    expect(r.rooms.map((x) => x.id)).toEqual(['f1_r1', 'f1_r2', 'f1_r3', 'f1_r4', 'f1_r5', 'f1_boss']);
    expect(r.rooms.some((x) => x.stuck)).toBe(false);
    // 한 판 경험치 = 모든 웨이브 몬스터 경험치 합 (balance.md 7장 약 300), 코인 약 350
    expect(r.exp).toBeGreaterThan(250);
    expect(r.coins).toBeGreaterThan(280);
  }, 120_000);
});
