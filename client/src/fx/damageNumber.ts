// 데미지 숫자: 3×5 도트 글꼴 + 외곽선, 크게 튀었다 작아지며 떠오르고 깜빡이며 사라짐 (motion.md 3장, art.md 7장)
import type { FxGrade } from '@game/shared';
import fx from '../../data/fx.json';
import { drawText, textWidth } from '../ui/pixelFont';
import type { Effect } from './layer';

/** 가운데 정렬된 왼쪽 위 x */
export const textLeft = (text: string, cx: number, scale: number) => Math.round(cx - textWidth(text, scale) / 2);

/** colorPath: 기본은 등급별 색, 플레이어가 맞은 숫자 등은 따로 */
export function damageNumber(value: number, x: number, y: number, grade: FxGrade, colorPath?: string): Effect {
  const n = fx.number, style = n[grade];
  const text = String(value);
  return {
    life: n.sec,
    total: n.sec,
    draw(g, k) {
      const e = (1 - k) * n.sec;
      if (k * n.sec < n.blinkLast && Math.floor(e / (2 * fx.frame)) % 2 === 0) return;
      const sc = e < n.popSec ? style.scale[0]! : style.scale[1]!;
      const top = Math.round(y - Math.min(1, e / n.riseSec) * n.rise);
      drawText(g, text, textLeft(text, x, sc), top, { color: colorPath ?? style.color, scale: sc, outline: 'four' });
    },
  };
}
