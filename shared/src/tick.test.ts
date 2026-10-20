import { describe, expect, it } from 'vitest';
import { TICK } from './constants';
import { actionMoveDelta, weaponDef } from './actions';
import { moveSpeed, newRunState, stepRun } from './movement';
import { FixedStep } from './tick';

describe('FixedStep (1/60초)', () => {
  it('프레임 간격과 상관없이 같은 틱 수', () => {
    const a = new FixedStep(), b = new FixedStep();
    let na = 0, nb = 0;
    for (let i = 0; i < 60; i++) na += a.advance(1 / 60);
    for (let i = 0; i < 144; i++) nb += b.advance(1 / 144);
    expect(na).toBe(60);
    expect(nb).toBe(60);
  });
  it('남은 시간은 다음으로 넘기고, 너무 몰리면 최대 틱 수로 자름', () => {
    const s = new FixedStep();
    expect(s.advance(TICK * 1.5)).toBe(1);
    expect(s.alpha).toBeCloseTo(0.5);
    expect(s.advance(TICK * 0.5)).toBe(1);
    expect(s.advance(10)).toBe(s.maxSteps);
    expect(s.alpha).toBe(0);
  });
});

describe('달리기 (두 번 누르기)', () => {
  const run = (taps: [x: number, ticks: number][]) => {
    const s = newRunState();
    let r = false;
    for (const [x, n] of taps) for (let i = 0; i < n; i++) r = stepRun(s, x, TICK);
    return r;
  };
  it('0.25초 안에 같은 방향 두 번 → 달림', () => {
    expect(run([[1, 4], [0, 4], [1, 2]])).toBe(true);
  });
  it('너무 늦게 두 번, 반대 방향, 한 번 꾹 → 걷기', () => {
    expect(run([[1, 4], [0, 20], [1, 2]])).toBe(false);
    expect(run([[1, 4], [0, 4], [-1, 2]])).toBe(false);
    expect(run([[1, 60]])).toBe(false);
  });
  it('좌우를 떼면 해제', () => {
    expect(run([[1, 4], [0, 4], [1, 10], [0, 1]])).toBe(false);
  });
  it('속도는 기본 × 무기 배율', () => {
    expect(moveSpeed(true, 0.9)).toEqual({ x: 108, y: 67.5 });
    expect(moveSpeed(false)).toEqual({ x: 60, y: 40 });
  });
});

describe('행동 중 이동', () => {
  const dash = weaponDef('greatsword').dash;
  const [w, a] = [dash.phases.windup, dash.phases.active];
  it('distance형: 해당 구간 동안 고르게, 합은 distance', () => {
    expect(actionMoveDelta(dash, 0, w)).toBe(0);
    expect(actionMoveDelta(dash, w, w + a / 2)).toBeCloseTo(16);
    let sum = 0;
    for (let t = 0; t < 1; t += TICK) sum += actionMoveDelta(dash, t, t + TICK);
    expect(sum).toBeCloseTo(32);
  });
  it('speed형: maxDistance까지 일정 속도', () => {
    const def = { phases: { windup: 0.5, active: 1, recovery: 0 }, move: { speed: 100, maxDistance: 60, during: 'active' as const } };
    expect(actionMoveDelta(def, 0.5, 0.6)).toBeCloseTo(10);
    expect(actionMoveDelta(def, 0.5, 2)).toBeCloseTo(60);
    expect(actionMoveDelta(def, 1.2, 1.4)).toBe(0);
  });
  it('이동 없는 행동은 0', () => {
    expect(actionMoveDelta(weaponDef('greatsword').basic[0]!, 0, 1)).toBe(0);
  });
});
