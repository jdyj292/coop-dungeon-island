import { describe, expect, it } from 'vitest';
import { applyHit, canBeHit, newBody, stepBody, type Body, type BodyEvent } from './body';

const DT = 1 / 120;
function simulate(b: Body, sec: number): BodyEvent[] {
  const out: BodyEvent[] = [];
  for (let t = 0; t < sec; t += DT) out.push(...stepBody(b, DT, 0, 1000));
  return out;
}

describe('경직·밀림 (combat.md 3장)', () => {
  it('약: 0.3초 경직, 6px 밀림', () => {
    const b = newBody(100, 0, 'light');
    applyHit(b, { dir: 1, strength: 'light' });
    expect(b.state).toBe('hitstun');
    simulate(b, 0.29);
    expect(b.state).toBe('hitstun');
    simulate(b, 0.02);
    expect(b.state).toBe('idle');
    expect(b.x).toBeCloseTo(106, 1);
  });
  it('무게 보정: heavy는 절반', () => {
    const b = newBody(100, 0, 'heavy');
    applyHit(b, { dir: -1, strength: 'heavy' });
    simulate(b, 1);
    expect(b.x).toBeCloseTo(88, 1);
  });
  it('knockback으로 벽에 닿으면 벽꿍 + 경직 0.3초 추가', () => {
    const b = newBody(995, 0, 'light');
    applyHit(b, { dir: 1, strength: 'heavy', flags: ['knockback'] });
    const ev = simulate(b, 0.1);
    expect(ev).toContain('wall');
    expect(b.timer).toBeGreaterThan(0.6 + 0.3 - 0.11);
  });
});

describe('띄우기 → 바운드 → 다운 → 기상', () => {
  it('launch vz 220: 약 0.7초 체공 뒤 바운드 1회, 약 0.3초 뒤 다운', () => {
    const b = newBody(100, 0, 'light');
    applyHit(b, { dir: 1, strength: 'medium', flags: ['launch'], launchVz: 220 });
    expect(b.state).toBe('air');
    expect(simulate(b, 0.7)).toEqual([]);
    expect(simulate(b, 0.06)).toEqual(['bounce']);
    expect(simulate(b, 0.2)).toEqual([]);
    expect(simulate(b, 0.1)).toEqual(['down']);
    expect(canBeHit(b)).toBe(false);
    expect(canBeHit(b, ['downhit'])).toBe(true);
    expect(simulate(b, 0.8)).toEqual(['getup']);
    expect(canBeHit(b)).toBe(false);
    simulate(b, 0.5);
    expect(b.state).toBe('idle');
  });
  it('공중 피격: 재부양, 중력 ×1.1 누적, down 플래그는 바운드 생략', () => {
    const b = newBody(100, 0, 'light');
    applyHit(b, { dir: 1, strength: 'light', flags: ['launch'] });
    simulate(b, 0.5);
    applyHit(b, { dir: 1, strength: 'light' });
    expect(b.vz).toBeGreaterThanOrEqual(60);
    expect(b.gravityMul).toBeCloseTo(1.1);
    applyHit(b, { dir: 1, strength: 'light', flags: ['down'] });
    expect(simulate(b, 2)).toEqual(['down', 'getup']);
  });
  it('fixed 무게는 경직만 받고 밀림·띄우기 무시', () => {
    const b = newBody(100, 0, 'fixed');
    applyHit(b, { dir: 1, strength: 'heavy', flags: ['launch', 'knockback'] });
    expect(b.state).toBe('hitstun');
    expect(b.timer).toBeCloseTo(0.6);
    simulate(b, 1);
    expect(b.x).toBe(100);
  });
  it('boss 무게는 띄우기·경직 무시', () => {
    const b = newBody(100, 0, 'boss');
    applyHit(b, { dir: 1, strength: 'heavy', flags: ['launch'] });
    expect(b.state).toBe('idle');
  });
});
