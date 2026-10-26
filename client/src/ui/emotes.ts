// 이모트 1~4 (hud.md 3장, combat.md 1장 키 1~4): 머리 위 말풍선 1.5초
// 1 = 엄지 척 (갈무리에 없는 그림이라 도트로 그림), 2 ! · 3 ? · 4 ^^ 는 글자
import type Phaser from 'phaser';
import { dot } from '../fx/layer';
import { color, colorInt } from '../palette';
import { ramp } from '../sprites/shade';

export const EMOTE_SEC = 1.5;

/** 엄지 척 9×9: o = 외곽선, s = 피부, d = 피부 그림자 (손가락 사이) */
const THUMBS_UP = [
  '...oo....',
  '..osso...',
  '..osso...',
  'ooosssooo',
  'ossssssso',
  'osssdddso',
  'ossssssso',
  'osssdddso',
  'ooooooooo',
];
export const ICON_SIZE = { w: THUMBS_UP[0]!.length, h: THUMBS_UP.length };

/** 글자 이모트 (1은 그림) */
export const EMOTE_TEXT: Record<number, string> = { 2: '!', 3: '?', 4: '^^' };

/** 엄지 척을 (x, y) 왼쪽 위에 */
export function drawThumbsUp(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
  const skin = color('global.player.skin');
  const fill: Record<string, number> = { o: colorInt('global.outline'), s: parseInt(skin.slice(1), 16), d: parseInt(ramp(skin)[2].slice(1), 16) };
  THUMBS_UP.forEach((row, j) => [...row].forEach((c, i) => { if (fill[c] !== undefined) dot(g, x + i, y + j, fill[c]!, 1, 1); }));
}
