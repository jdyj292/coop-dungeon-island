import { describe, expect, it } from 'vitest';
import fx from '../../data/fx.json';
import { crackPixels, fanLines, radialLines } from './groundImpact';
import { smearPixels, smearShape } from './smear';

describe('대검 이펙트 모양', () => {
  it('대검 평타·스킬 active 포즈마다 스미어 모양이 있다', () => {
    for (const pose of ['slash', 'sweep', 'rise', 'upslash', 'slam', 'cleave', 'throwRelease']) expect(smearShape(pose), pose).toBeDefined();
  });
  it('지진 사방 균열: 줄 수만큼 한 바퀴에 고르게, 길이 = 반지름 − forward', () => {
    const lines = radialLines(40);
    expect(lines).toHaveLength(fx.smear.radial.lines);
    expect(lines[0]!.length).toBe(40 - fx.smear.ground.forward);
    expect(lines[1]!.rot - lines[0]!.rot).toBeCloseTo((Math.PI * 2) / lines.length);
  });
  it('가로베기는 납작하다 (세로 폭 < 가로 폭)', () => {
    const px = smearPixels(smearShape('sweep')!, 1);
    const span = (v: number[]) => Math.max(...v) - Math.min(...v);
    expect(span(px.map((p) => p.dy))).toBeLessThan(span(px.map((p) => p.dx)));
  });
  it('균열은 발 앞 forward부터 length까지, 위아래 2px 안', () => {
    const g = fx.smear.ground, px = crackPixels();
    expect(Math.min(...px.map((p) => p.dx))).toBe(g.forward);
    expect(Math.max(...px.filter((p) => p.tone === 0 && Math.abs(p.dy) <= 1).map((p) => p.dx))).toBeGreaterThanOrEqual(g.forward + g.length);
    expect(px.every((p) => Math.abs(p.dy) <= 4)).toBe(true);
  });
  it('부채꼴 균열은 판정 각도 안에 대칭으로, 길이는 반지름까지', () => {
    const lines = fanLines({ radius: 40, angle: 70 }), half = (35 * Math.PI) / 180;
    expect(lines).toHaveLength(fx.smear.ground.fan.lines);
    expect(lines[0]!.rot).toBeCloseTo(-half);
    expect(lines.at(-1)!.rot).toBeCloseTo(half);
    expect(lines.every((l) => l.length === 40 - fx.smear.ground.forward)).toBe(true);
  });
});
