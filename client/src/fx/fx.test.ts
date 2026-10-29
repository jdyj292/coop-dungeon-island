import { describe, expect, it } from 'vitest';
import { textLeft } from './damageNumber';
import { smearPixels, smearShape } from './smear';
import { thrustPixels } from './thrust';
import { HitStop, Shake } from './timing';

describe('HitStop', () => {
  it('남은 시간 동안 게임 dt = 0, 끝나면 그대로', () => {
    const s = new HitStop();
    s.stop(0.05);
    expect(s.filter(0.03)).toBe(0);
    expect(s.filter(0.03)).toBe(0);
    expect(s.filter(0.016)).toBe(0.016);
  });
  it('겹치면 긴 쪽', () => {
    const s = new HitStop();
    s.stop(0.13);
    s.stop(0.05);
    s.filter(0.1);
    expect(s.active).toBe(true);
  });
});

describe('Shake', () => {
  it('정수 픽셀, 방향 지정', () => {
    const s = new Shake();
    s.start(0.2, 2, 'vertical');
    expect(s.offset(() => 0)).toEqual({ x: 0, y: -2 });
    s.update(0.3);
    expect(s.offset()).toEqual({ x: 0, y: 0 });
  });
  it('0px·0초는 무시', () => {
    const s = new Shake();
    s.start(0, 0);
    expect(s.offset()).toEqual({ x: 0, y: 0 });
  });
});

describe('smearPixels', () => {
  const shape = smearShape('slash')!;
  it('가운데가 두껍고 양 끝이 가늘다', () => {
    const px = smearPixels(shape, 1);
    const thickAt = (a: number) => px.filter((p) => Math.abs(Math.atan2(p.dy, p.dx) - a) < 0.08).length;
    const mid = (shape.a0 + shape.a1) / 2;
    expect(thickAt(mid)).toBeGreaterThan(thickAt(shape.a0 + 0.1));
    expect(thickAt(mid)).toBeGreaterThan(thickAt(shape.a1 - 0.1));
  });
  it('꼬리부터 사라진다', () => {
    expect(smearPixels(shape, 0.3).length).toBeLessThan(smearPixels(shape, 1).length);
    expect(smearPixels(shape, 0).length).toBe(0);
  });
  it('세 가지 색 층', () => {
    expect(new Set(smearPixels(shape, 1).map((p) => p.tone))).toEqual(new Set([0, 1, 2]));
  });
});

describe('textLeft', () => {
  it('가운데 정렬 (글자 3 + 간격 1)', () => {
    expect(textLeft('42', 100, 1)).toBe(97);
    expect(textLeft('42', 100, 2)).toBe(93);
  });
});

describe('thrustPixels (찌르기 스미어)', () => {
  const s = { y: -6, x0: -2, x1: 19 };
  it('직선: 앞으로 갈수록 두꺼움(1 → 3 → 5줄), 꼬리부터 사라짐', () => {
    const px = thrustPixels(s, 1);
    expect(new Set(px.map((p) => p.dy))).toEqual(new Set([-8, -7, -6, -5, -4]));
    expect(px.filter((p) => p.dx === 15).length).toBe(5);
    expect(px.filter((p) => p.dx === s.x0).length).toBe(1);
    expect(thrustPixels(s, 0.3).length).toBeLessThan(px.length);
    expect(thrustPixels(s, 0).length).toBe(0);
  });
});
