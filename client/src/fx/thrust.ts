// 찌르기 스미어: 앞으로 뻗는 공격(대시 등)의 직선 궤적. 칼날 줄을 따라 뒤가 가늘고 앞이 두꺼움, 꼬리부터 사라짐 (motion.md 2장)
import type { FxGrade } from '@game/shared';
import fx from '../../data/fx.json';
import { colorInt } from '../palette';
import { dot, type Effect } from './layer';

export interface ThrustShape {
  /** 칼날 줄 높이 (발밑 기준, 위가 -) */
  y: number;
  /** 시작(꼬리)·끝(앞) x (발밑 기준, 바라보는 방향 +) */
  x0: number;
  x1: number;
}

/** 스미어를 찌르기로 그리는 행동 id 목록 (fx.json smear.thrust.actions) */
export const isThrust = (actionId: string): boolean => fx.smear.thrust.actions.includes(actionId);

/** 픽셀 목록. 가운데 줄 흰색, 위아래 줄 금색(앞쪽 절반만), 맨 끝 어두운 금색. k = 남은 비율 */
export function thrustPixels(s: ThrustShape, k: number, grow = 0): { dx: number; dy: number; tone: 0 | 1 | 2 }[] {
  const out: { dx: number; dy: number; tone: 0 | 1 | 2 }[] = [];
  if (k <= 0) return out;
  const x1 = s.x1 + grow;
  for (let dx = s.x0; dx <= x1; dx++) {
    const f = (dx - s.x0) / (x1 - s.x0);
    if (f < 1 - k * 1.4) continue;
    out.push({ dx, dy: s.y, tone: dx === x1 ? 2 : 0 });
    if (f > 0.4 && dx < x1) {
      out.push({ dx, dy: s.y - 1, tone: 1 }, { dx, dy: s.y + 1, tone: 1 });
    }
  }
  return out;
}

/** at() = 지금 발밑 화면 좌표·방향 (돌진하며 찌르므로 매 프레임 캐릭터를 따라감) */
export function thrust(at: () => { sx: number; sy: number; facing: number }, grade: FxGrade): Effect {
  const s = fx.smear.thrust as ThrustShape;
  const grow = fx.smear.grow[grade];
  const tones = ['global.allyFx.white', 'global.allyFx.gold', 'global.fx.smearEdge'].map(colorInt);
  return {
    life: fx.smear.sec,
    total: fx.smear.sec,
    draw(g, k) {
      const { sx, sy, facing } = at();
      for (const p of thrustPixels(s, k, grow)) dot(g, sx + p.dx * facing, sy + p.dy, tones[p.tone]!);
    },
  };
}
