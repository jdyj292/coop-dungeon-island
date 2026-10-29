import { describe, expect, it } from 'vitest';
import fx from '../../data/fx.json';
import { crackPixels } from './groundImpact';
import { smearPixels, smearShape } from './smear';

describe('대검 이펙트 모양', () => {
  it('대검 평타·스킬 active 포즈마다 스미어 모양이 있다', () => {
    for (const pose of ['slash', 'sweep', 'rise', 'upslash', 'slam']) expect(smearShape(pose), pose).toBeDefined();
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
});
