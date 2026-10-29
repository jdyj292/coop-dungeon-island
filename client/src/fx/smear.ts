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
  /** 세로 납작 비율 (가로베기: 깊이 방향으로 도는 궤적을 납작한 타원으로) */
  flat?: number;
  /** 회전 중심 (발밑 기준). 없으면 smear.center */
  center?: number[];
}

export const smearShape = (pose: string): SmearShape | undefined =>
  (fx.smear.shapes as Record<string, SmearShape>)[pose];

/** 등급별 유지 시간: 강한 공격일수록 궤적이 오래 남는다 */
export const smearSec = (grade: FxGrade): number => fx.smear.sec[grade];

/**
 * 초승달 픽셀 목록. 가운데가 두껍고 양 끝이 가늘다. k = 남은 비율 (꼬리부터 지움)
 * 바깥 1px 어두운 금색 → 금색 → 안쪽 흰색
 */
export function smearPixels(s: SmearShape, k: number): { dx: number; dy: number; tone: 0 | 1 | 2 }[] {
  const out: { dx: number; dy: number; tone: 0 | 1 | 2 }[] = [];
  const flat = s.flat ?? 1;
  const ry = Math.ceil(s.r2 * flat);
  for (let dy = -ry; dy <= ry; dy++) {
    for (let dx = -s.r2; dx <= s.r2; dx++) {
      const uy = dy / flat;
      const a = Math.atan2(uy, dx), d = Math.hypot(dx, uy);
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

/** (sx, sy) = 발밑, facing으로 좌우 반전, 강한 공격일수록 반지름을 키움 */
export function smear(sx: number, sy: number, facing: number, shape: SmearShape, grade: FxGrade): Effect {
  const grow = fx.smear.grow[grade];
  const s = { ...shape, r1: shape.r1 + grow, r2: shape.r2 + grow };
  const [ox = 0, oy = 0] = shape.center ?? fx.smear.center;
  const cx = sx + ox * facing, cy = sy + oy;
  const tones = ['global.allyFx.white', 'global.allyFx.gold', 'global.fx.smearEdge'].map(colorInt);
  const sec = smearSec(grade);
  return {
    life: sec,
    total: sec,
    draw(g, k) {
      for (const p of smearPixels(s, k)) dot(g, cx + p.dx * facing, cy + p.dy, tones[p.tone]!);
    },
  };
}
