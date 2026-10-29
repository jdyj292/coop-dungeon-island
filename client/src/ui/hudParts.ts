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

/** 아래 끝에 붙는 묶음 판 (hud.md 1장): 반투명 판, 위·옆 테두리, 위 모서리 1px 깎음, 위쪽 1px 그림자, 안쪽 윗줄 광택. bottom = 화면 아래 */
export function cluster(g: G, x: number, y: number, w: number, bottom: number): void {
  const h = fx.hud, border = C('global.ui.panelBorder');
  dot(g, x + 2, y - 1, C('global.ui.cover'), w - 4, 1, h.clusterShadowAlpha);
  dot(g, x + 1, y + 1, C('global.ui.panel'), w - 2, bottom - y - 1, h.clusterAlpha);
  dot(g, x + 2, y, border, w - 4, 1);
  dot(g, x + 1, y + 1, border);
  dot(g, x + w - 2, y + 1, border);
  dot(g, x, y + 2, border, 1, bottom - y - 2);
  dot(g, x + w - 1, y + 2, border, 1, bottom - y - 2);
  dot(g, x + 2, y + 1, C('global.fx.flash'), w - 4, 1, h.clusterSheenAlpha);
}

/** 코인 아이콘 5×5 (승인 데모 아래 띠) */
export function coinIcon(g: G, x: number, y: number): void {
  dot(g, x, y, C('global.ui.coin'), 5, 5);
  dot(g, x + 1, y + 1, C('global.allyFx.gold'), 2, 2);
  dot(g, x + 4, y + 4, C('global.fx.smearEdge'), 1, 1);
}

/** 공동 금고(상자) 아이콘 9×8 (외곽선 포함, 승인 데모 island_hud_help.html 가방 아래 상자) */
export function vaultIcon(g: G, x: number, y: number): void {
  dot(g, x - 1, y - 1, C('global.outline'), 9, 8);
  dot(g, x, y, C('island.wood'), 7, 6);
  dot(g, x, y, C('global.ui.bagLight'), 7, 2);
  dot(g, x + 3, y + 2, C('global.ui.coin'), 1, 2);
}

/** 재료(버섯) 아이콘 5×5 (승인 데모 아래 띠) */
export function materialIcon(g: G, x: number, y: number): void {
  dot(g, x, y, C('floors.1.monster.mushroomCap'), 5, 3);
  dot(g, x + 1, y + 3, C('floors.1.monster.mushroomStem'), 3, 2);
}

/** 막대: 위 절반 밝은색·아래 절반 어두운색. trail = 줄어든 부분을 흰색으로 남길 비율, ticks = 1/ticks마다 눈금 (hud.md 1장) */
export function bar(g: G, x: number, y: number, w: number, h: number, f: number, light: string, dark: string, trail = f, ticks = 0): void {
  drawBar(g, x, y, w, h, f, light, dark, trail);
  for (let k = 1; k < ticks; k++) dot(g, x + Math.round(w * k / ticks), y, C('global.ui.panel'), 1, h, fx.hud.tickAlpha);
}

function drawBar(g: G, x: number, y: number, w: number, h: number, f: number, light: string, dark: string, trail: number): void {
  dot(g, x - 1, y - 1, C('global.ui.panelInner'), w + 2, h + 2);
  dot(g, x, y, C('global.ui.barTrack'), w, h);
  const tw = Math.round(w * Math.max(0, Math.min(1, trail)));
  if (tw > 0) dot(g, x, y, C('global.fx.flash'), tw, h);
  const fw = Math.round(w * Math.max(0, Math.min(1, f)));
  if (fw <= 0) return;
  dot(g, x, y, C(light), fw, Math.ceil(h / 2));
  dot(g, x, y + Math.ceil(h / 2), C(dark), fw, Math.floor(h / 2));
}

/** 16×16 아이콘 (hud_icons.json). gray = MP 부족 회색. inset = 가장자리를 이만큼 잘라 그림 (패널 줄 12×12 칸은 2) */
export function icon(g: G, name: string, x: number, y: number, gray = false, inset = 0): void {
  const rows = (icons.icons as Record<string, string[]>)[name];
  if (!rows) return;
  const pal = icons.palette as Record<string, string>, end = 16 - inset;
  rows.forEach((row, j) => [...row].forEach((ch, i) => {
    if (ch !== '.' && i >= inset && j >= inset && i < end && j < end) dot(g, x + i - inset, y + j - inset, C(gray ? 'global.ui.panelBorder' : pal[ch]!));
  }));
}

/** 무기 id → 슬롯 아이콘 이름 (hud_icons.json slots) */
export const weaponIcon = (weapon: string): string => (icons.slots as Record<string, string>)[weapon] ?? 'empty';

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

/** 장착 안 된 18×18 슬롯: 모서리 깎은 흐린 테두리와 키 글자만 (hud.md 1장) */
export function emptySlot(g: G, x: number, y: number, key: string): void {
  const c = C('global.ui.panelBorder'), a = fx.hud.emptySlotAlpha;
  dot(g, x + 1, y, c, 16, 1, a);
  dot(g, x + 1, y + 17, c, 16, 1, a);
  dot(g, x, y + 1, c, 1, 16, a);
  dot(g, x + 17, y + 1, c, 1, 16, a);
  drawText(g, key, x + 2, y + 2, { color: 'global.ui.panelBorder', outline: 'none' });
}
