// 스미어: 휘두른 궤적의 초승달 1장, 꼬리부터 사라짐 (motion.md 2장, art.md 7장)
import type { FxGrade } from '@game/shared';
import fx from '../../data/fx.json';
import { colorInt } from '../palette';
import { dot, type Effect } from './layer';

export interface SmearShape {
  /** 시작·끝 각도 (라디안, 오른쪽을 볼 때. 화면 y는 아래가 +) */
  a0: number;
  a1: number;
  /** 안쪽·바깥 반지름 (가운데 두께 = r2 - r1) */
  r1: number;
  r2: number;
  /** 아래에서 위로 휘두름 (꼬리가 반대쪽) */
  rev?: boolean;
}

export const smearShape = (pose: string): SmearShape | undefined =>
  (fx.smear.shapes as Record<string, SmearShape>)[pose];

/**
 * 초승달 픽셀 목록. 가운데가 두껍고 양 끝이 가늘다. k = 남은 비율 (꼬리부터 지움)
 * 바깥 1px 어두운 금색 → 금색 → 안쪽 흰색
 */
export function smearPixels(s: SmearShape, k: number): { dx: number; dy: number; tone: 0 | 1 | 2 }[] {
  const out: { dx: number; dy: number; tone: 0 | 1 | 2 }[] = [];
  for (let dy = -s.r2; dy <= s.r2; dy++) {
    for (let dx = -s.r2; dx <= s.r2; dx++) {
      const a = Math.atan2(dy, dx), d = Math.hypot(dx, dy);
      if (a < s.a0 || a > s.a1) continue;
      let f = (a - s.a0) / (s.a1 - s.a0);
      if (s.rev) f = 1 - f;
      if (f < 1 - k * 1.4) continue;
      const th = (s.r2 - s.r1) * Math.sin(f * Math.PI);
      if (d > s.r2 || d < s.r2 - th - 0.5) continue;
      out.push({ dx, dy, tone: d > s.r2 - 1 ? 2 : d > s.r2 - 2.2 ? 1 : 0 });
    }
  }
  return out;
}

/** (cx, cy) = 회전 중심, facing으로 좌우 반전, 강한 공격일수록 반지름을 키움 */
export function smear(cx: number, cy: number, facing: number, shape: SmearShape, grade: FxGrade): Effect {
  const grow = fx.smear.grow[grade];
  const s = { ...shape, r1: shape.r1 + grow, r2: shape.r2 + grow };
  const tones = ['global.allyFx.white', 'global.allyFx.gold', 'global.fx.smearEdge'].map(colorInt);
  return {
    life: fx.smear.sec,
    total: fx.smear.sec,
    draw(g, k) {
      for (const p of smearPixels(s, k)) dot(g, cx + p.dx * facing, cy + p.dy, tones[p.tone]!);
    },
  };
}
