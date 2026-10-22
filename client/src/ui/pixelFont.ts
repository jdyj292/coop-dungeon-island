// 3×5 도트 글꼴 (art.md 7장, hud.md 7장). 글자 모양은 승인 데모(floor1_room_hud_mockup.html, motion-preview/reference.html)와 같다
import type Phaser from 'phaser';
import { colorInt } from '../palette';
import { dot } from '../fx/layer';

export const GLYPHS: Record<string, string[]> = {
  0: ['111', '101', '101', '101', '111'], 1: ['110', '010', '010', '010', '111'],
  2: ['111', '001', '111', '100', '111'], 3: ['111', '001', '111', '001', '111'],
  4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'], 7: ['111', '001', '010', '010', '010'],
  8: ['111', '101', '111', '101', '111'], 9: ['111', '101', '111', '001', '111'],
  H: ['101', '101', '111', '101', '101'], I: ['111', '010', '010', '010', '111'], T: ['111', '010', '010', '010', '010'],
  L: ['100', '100', '100', '100', '111'], V: ['101', '101', '101', '101', '010'], C: ['111', '100', '100', '100', '111'],
  E: ['111', '100', '111', '100', '111'], A: ['010', '101', '111', '101', '101'], R: ['110', '101', '110', '101', '101'],
  x: ['000', '101', '010', '101', '000'], '!': ['010', '010', '010', '000', '010'],
  J: ['001', '001', '001', '101', '111'], U: ['101', '101', '101', '101', '111'],
  O: ['111', '101', '101', '101', '111'], P: ['111', '101', '111', '100', '100'],
  Z: ['111', '001', '010', '100', '111'], X: ['101', '101', '010', '101', '101'],
  // 출구 인원 '1/2' (roadmap 3-3, 데모에 없던 글자를 같은 3×5 규칙으로)
  '/': ['001', '001', '010', '100', '100'],
  // 콤보 코인 보너스 '+5%' (roadmap 3-4, 같은 규칙)
  '+': ['000', '010', '111', '010', '000'], '%': ['101', '001', '010', '100', '101'],
  // 정산 화면 RETURN·WIPE·잃은 코인 (roadmap 3-5, 같은 규칙)
  N: ['101', '111', '111', '111', '101'], W: ['101', '101', '111', '111', '101'], '-': ['000', '000', '111', '000', '000'],
  '>': ['100', '010', '001', '010', '100'],
  // 보스 이름 띠 BOSS (roadmap 3-6, 같은 규칙)
  B: ['110', '101', '110', '101', '110'], S: ['111', '100', '111', '001', '111'],
  // 섬 HUD 게시판 버튼 M (roadmap 4-5, 승인 데모 island_screen_hud_mockup.html 글꼴 그대로)
  M: ['101', '111', '111', '101', '101'],
};

/** 외곽선: 4방향(데미지 숫자, motion 데모) / 5방향(HUD 데모, 오른쪽 아래 그림자 포함) / 없음 */
export type Outline = 'four' | 'five' | 'none';
const OUTLINE: Record<Outline, [number, number][]> = {
  four: [[1, 0], [-1, 0], [0, 1], [0, -1]],
  five: [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1]],
  none: [],
};

/** 글자 칸 너비 4 (글자 3 + 간격 1) */
export const textWidth = (s: string, scale = 1) => s.length * 4 * scale - scale;

export interface TextStyle {
  /** palette 경로 또는 색 정수 */
  color: string | number;
  scale?: number;
  outline?: Outline;
  align?: 'left' | 'center' | 'right';
  alpha?: number;
}

export function drawText(g: Phaser.GameObjects.Graphics, s: string, x: number, y: number, st: TextStyle): void {
  const sc = st.scale ?? 1;
  const w = textWidth(s, sc);
  const left = Math.round(st.align === 'center' ? x - w / 2 : st.align === 'right' ? x - w : x);
  const fill = typeof st.color === 'number' ? st.color : colorInt(st.color);
  const paint = (col: number, ox: number, oy: number) => [...s].forEach((ch, i) => GLYPHS[ch]?.forEach((row, j) =>
    [...row].forEach((b, k) => { if (b === '1') dot(g, left + i * 4 * sc + k * sc + ox, y + j * sc + oy, col, sc, sc, st.alpha ?? 1); })));
  const ol = colorInt('global.outline');
  for (const [ox, oy] of OUTLINE[st.outline ?? 'five']) paint(ol, ox, oy);
  paint(fill, 0, 0);
}
