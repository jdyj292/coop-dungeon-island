// 데미지 숫자: 3×5 도트 글꼴 + 외곽선, 크게 튀었다 작아지며 떠오르고 깜빡이며 사라짐 (motion.md 3장, art.md 7장)
import type Phaser from 'phaser';
import type { FxGrade } from '@game/shared';
import fx from '../../data/fx.json';
import { colorInt } from '../palette';
import { dot, type Effect } from './layer';

/** 승인 데모(tools/motion-preview/reference.html)의 3×5 숫자 글꼴 */
const DIGITS: Record<string, string[]> = {
  0: ['111', '101', '101', '101', '111'], 1: ['110', '010', '010', '010', '111'],
  2: ['111', '001', '111', '100', '111'], 3: ['111', '001', '111', '001', '111'],
  4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'], 7: ['111', '001', '010', '010', '010'],
  8: ['111', '101', '111', '101', '111'], 9: ['111', '101', '111', '001', '111'],
};

/** 글자 칸 너비 4 (글자 3 + 간격 1). 가운데 정렬된 왼쪽 위 x */
export const textLeft = (text: string, cx: number, scale: number) =>
  Math.round(cx - (text.length * 4 * scale - scale) / 2);

export function damageNumber(value: number, x: number, y: number, grade: FxGrade): Effect {
  const n = fx.number, style = n[grade];
  const text = String(value);
  const fill = colorInt(style.color), outline = colorInt('global.outline');
  const draw = (g: Phaser.GameObjects.Graphics, left: number, top: number, sc: number, col: number, ox: number, oy: number) =>
    [...text].forEach((ch, i) => DIGITS[ch]?.forEach((row, j) => [...row].forEach((b, k) => {
      if (b === '1') dot(g, left + i * 4 * sc + k * sc + ox, top + j * sc + oy, col, sc, sc);
    })));
  return {
    life: n.sec,
    total: n.sec,
    draw(g, k) {
      const e = (1 - k) * n.sec;
      if (k * n.sec < n.blinkLast && Math.floor(e / (2 * fx.frame)) % 2 === 0) return;
      const sc = e < n.popSec ? style.scale[0]! : style.scale[1]!;
      const top = Math.round(y - Math.min(1, e / n.riseSec) * n.rise);
      const left = textLeft(text, x, sc);
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) draw(g, left, top, sc, outline, ox, oy);
      draw(g, left, top, sc, fill, 0, 0);
    },
  };
}
