// 스태프 마법 도트 그리기 공용 (art.md 7장): 색, 4×4 바둑판(Bayer) 사라짐, 3단 구슬, 4방향 별, 타원 둘레 점
import type Phaser from 'phaser';
import { DEPTH_RATIO } from '@game/shared';
import { colorInt } from '../palette';
import { dot } from './layer';

type G = Phaser.GameObjects.Graphics;

export const life = (sec: number) => ({ life: sec, total: sec });
/** 마법 색: 아군 이펙트 3색 + 보조색 (테두리 진한 하늘·폭발 바깥 주황빛 금색) */
export const col = () => ({
  sky: colorInt('global.allyFx.sky'), white: colorInt('global.allyFx.white'), gold: colorInt('global.allyFx.gold'),
  deep: colorInt('global.fx.spellDeep'), amber: colorInt('global.fx.fireDeep'),
});
export const easeOut = (t: number) => 1 - (1 - t) ** 3;
export const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** 진하기 a(0~1)일 때 이 픽셀을 찍는가: 투명도 대신 바둑판으로 사라진다 */
export function shown(x: number, y: number, a: number): boolean {
  if (a >= 1) return true;
  return a * 16 > BAYER[((Math.round(y) & 3) << 2) | (Math.round(x) & 3)]!;
}

/** 바둑판 진하기로 1px */
export function px(g: G, x: number, y: number, color: number, a = 1): void {
  if (shown(x, y, a)) dot(g, x, y, color);
}

/** 3단 구슬: 흰 심 → 하늘 → 진한 테두리, 왼쪽 위 흰 하이라이트 */
export function orb(g: G, x: number, y: number, r: number, a = 1): void {
  const c = col();
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const d = Math.hypot(dx, dy);
    if (d > r) continue;
    px(g, x + dx, y + dy, d <= r * 0.5 ? c.white : d <= r - 0.5 ? c.sky : c.deep, a);
  }
  if (r >= 2) px(g, x - 1, y - 1, c.white, a);
}

/** 4방향 별: 팔 끝으로 갈수록 바깥색, 가운데 2px는 안쪽색 */
export function star4(g: G, x: number, y: number, r: number, inner: number, outer: number, a = 1): void {
  px(g, x, y, inner, a);
  for (let i = 1; i <= r; i++) {
    const c = i <= Math.max(1, r / 2) ? inner : outer;
    px(g, x + i, y, c, a); px(g, x - i, y, c, a); px(g, x, y + i, c, a); px(g, x, y - i, c, a);
  }
}

/** 바닥 타원 둘레를 따라 점 (rot = 회전 rad, every = 몇 점마다 하나 찍을지) */
export function ellipseDots(g: G, x: number, y: number, r: number, rot: number, color: number, a = 1, every = 1): void {
  const n = Math.max(8, Math.round(Math.PI * 2 * r));
  for (let i = 0; i < n; i += every) {
    const t = rot + (i / n) * Math.PI * 2;
    px(g, x + Math.cos(t) * r, y + Math.sin(t) * r * DEPTH_RATIO, color, a);
  }
}

/** 0~1 사이 고정 난수 (같은 i면 같은 값: 매 프레임 다시 그려도 안 떨림) */
export const hash = (i: number) => {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
