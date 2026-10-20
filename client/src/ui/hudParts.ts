// HUD 그리기 부품: 패널·막대·슬롯·아이콘 (승인 데모 floor1_room_hud_mockup.html의 panel/bar/slot/icon과 같은 모양, hud.md 1장)
import type Phaser from 'phaser';
import icons from '../../data/sprites/hud_icons.json';
import fx from '../../data/fx.json';
import { dot } from '../fx/layer';
import { colorInt } from '../palette';
import { drawText } from './pixelFont';

type G = Phaser.GameObjects.Graphics;
const C = (path: string) => colorInt(path);

/** 3겹 테두리 패널: 바깥 panelBorder → panelInner → 안 panel */
export function panel(g: G, x: number, y: number, w: number, h: number): void {
  dot(g, x, y, C('global.ui.panelBorder'), w, h);
  dot(g, x + 1, y + 1, C('global.ui.panelInner'), w - 2, h - 2);
  dot(g, x + 2, y + 2, C('global.ui.panel'), w - 4, h - 4);
}

/** 막대: 위 절반 밝은색·아래 절반 어두운색. trail = 줄어든 부분을 흰색으로 남길 비율 (hud.md 1장) */
export function bar(g: G, x: number, y: number, w: number, h: number, f: number, light: string, dark: string, trail = f): void {
  dot(g, x - 1, y - 1, C('global.ui.panelInner'), w + 2, h + 2);
  dot(g, x, y, C('global.ui.barTrack'), w, h);
  const tw = Math.round(w * Math.max(0, Math.min(1, trail)));
  if (tw > 0) dot(g, x, y, C('global.fx.flash'), tw, h);
  const fw = Math.round(w * Math.max(0, Math.min(1, f)));
  if (fw <= 0) return;
  dot(g, x, y, C(light), fw, Math.ceil(h / 2));
  dot(g, x, y + Math.ceil(h / 2), C(dark), fw, Math.floor(h / 2));
}

/** 16×16 아이콘 (hud_icons.json). gray = MP 부족 회색 */
export function icon(g: G, name: string, x: number, y: number, gray = false): void {
  const rows = (icons.icons as Record<string, string[]>)[name];
  if (!rows) return;
  const pal = icons.palette as Record<string, string>;
  rows.forEach((row, j) => [...row].forEach((ch, i) => {
    if (ch !== '.') dot(g, x + i, y + j, C(gray ? 'global.ui.panelBorder' : pal[ch]!));
  }));
}

export interface SlotLook {
  icon: string;
  key: string;
  /** 시전 중: 금색 테두리 */
  casting?: boolean;
  /** 방금 사용 가능해짐: 흰 테두리 */
  ready?: boolean;
  /** 금색 테두리 깜빡임의 켜짐 쪽 (필살기 100) */
  glow?: boolean;
  /** 쿨타임 덮개 0~1 (위에서부터, 시간이 지날수록 위로 걷힘) */
  cover?: number;
  /** MP 부족: 아이콘 회색 */
  gray?: boolean;
  /** 장착 안 됨: 흐리게 */
  dim?: boolean;
  /** 아래에서 위로 채우는 게이지 0~1 (필살기) */
  fill?: number;
}

/** 18×18 슬롯. 키 글자는 왼쪽 위 */
export function slot(g: G, x: number, y: number, s: SlotLook): void {
  const h = fx.hud;
  const border = s.ready ? 'global.fx.flash' : s.glow ? 'global.allyFx.gold' : s.casting ? 'global.materials.gold' : 'global.ui.panelBorder';
  dot(g, x, y, C(border), 18, 18);
  dot(g, x + 1, y + 1, C('global.ui.panelInner'), 16, 16);
  dot(g, x + 2, y + 2, C('global.ui.panel'), 14, 14);
  if (s.fill) {
    const fh = Math.round(14 * Math.min(1, s.fill));
    dot(g, x + 2, y + 16 - fh, C('global.allyFx.gold'), 14, fh, h.ultFillAlpha);
  }
  icon(g, s.icon, x + 1, y + 1, s.gray);
  if (s.cover) dot(g, x + 2, y + 2, C('global.ui.cover'), 14, Math.round(14 * Math.min(1, s.cover)), h.coverAlpha);
  if (s.dim) dot(g, x + 2, y + 2, C('global.ui.panel'), 14, 14, h.dimAlpha);
  drawText(g, s.key, x + 2, y + 2, { color: 'global.ui.keyLabel', outline: 'none' });
}
