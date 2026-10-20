import { describe, expect, it } from 'vitest';
import { actionHits, areaHits, hitboxHits, projectileHits, zoneContains } from './shapes';

const box = { forward: 2, width: 18, depth: 13, z: 'both' as const };
const target = (x: number, y = 0, airborne = false) => ({ x, y, airborne, hurtbox: { width: 12, depth: 8 } });
const o = { x: 0, y: 0, facing: 1 };

describe('hitbox', () => {
  it('앞쪽만 맞는다', () => {
    expect(hitboxHits(o, box, target(14))).toBe(true);
    expect(hitboxHits(o, box, target(-14))).toBe(false);
    expect(hitboxHits({ ...o, facing: -1 }, box, target(-14))).toBe(true);
  });
  it('판정 끝에서 피격 상자 절반까지, back은 뒤쪽 추가', () => {
    expect(hitboxHits(o, box, target(26))).toBe(true);
    expect(hitboxHits(o, box, target(26.1))).toBe(false);
    expect(hitboxHits(o, { ...box, back: 10 }, target(-14))).toBe(true);
  });
  it('깊이는 좁게: (13 + 8) / 2 = 10.5px 안', () => {
    expect(hitboxHits(o, box, target(14, 10.5))).toBe(true);
    expect(hitboxHits(o, box, target(14, 11))).toBe(false);
  });
  it('높이 조건', () => {
    expect(hitboxHits(o, { ...box, z: 'ground' }, target(14, 0, true))).toBe(false);
    expect(hitboxHits(o, { ...box, z: 'air' }, target(14))).toBe(false);
    expect(hitboxHits(o, { ...box, z: 'air' }, target(14, 0, true))).toBe(true);
  });
});

describe('area', () => {
  const circle = { shape: 'circle' as const, at: [20, 0] as [number, number], radius: 24, z: 'ground' as const };
  it('circle: 중심은 바라보는 방향 기준, 피격 상자와 겹치면 적중', () => {
    expect(areaHits(o, circle, target(50))).toBe(true); // 중심 20, 상자 왼쪽 끝 44
    expect(areaHits(o, circle, target(51))).toBe(false);
    expect(areaHits({ ...o, facing: -1 }, circle, target(-50))).toBe(true);
    expect(areaHits(o, circle, target(20, 0, true))).toBe(false);
  });
  it('rect: 너비·깊이 상자 겹침', () => {
    const rect = { shape: 'rect' as const, at: [48, 0] as [number, number], width: 48, depth: 32, z: 'both' as const };
    expect(areaHits(o, rect, target(78, 20))).toBe(true);
    expect(areaHits(o, rect, target(78, 21))).toBe(false);
  });
  it('fan: 반지름 안 + 바라보는 방향 기준 각도 안', () => {
    const fan = { shape: 'fan' as const, at: [0, 0] as [number, number], radius: 40, angle: 70, z: 'ground' as const };
    expect(areaHits(o, fan, target(30, 10))).toBe(true);
    expect(areaHits(o, fan, target(10, 30))).toBe(false); // 약 72° 바깥
    expect(areaHits(o, fan, target(-30, 0))).toBe(false);
  });
});

describe('projectile · zone · actionHits', () => {
  it('투사체는 원과 피격 상자 겹침, 공중도 맞음', () => {
    expect(projectileHits(0, 0, 4, target(10, 0, true))).toBe(true);
    expect(projectileHits(0, 0, 4, target(10.1))).toBe(false);
  });
  it('장판은 발 위치가 안에 있을 때만, 공중이면 밖', () => {
    const zone = { shape: 'circle' as const, at: [0, 0] as [number, number], radius: 40, duration: 6, effect: { type: 'slow' as const } };
    expect(zoneContains(o, zone, target(30, 20))).toBe(true);
    expect(zoneContains(o, zone, target(30, 30))).toBe(false);
    expect(zoneContains(o, zone, target(0, 0, true))).toBe(false);
  });
  it('행동의 hitbox·area로 판정, 둘 다 없으면 false', () => {
    expect(actionHits(o, { hitbox: box }, target(14))).toBe(true);
    expect(actionHits(o, {}, target(14))).toBe(false);
  });
});
