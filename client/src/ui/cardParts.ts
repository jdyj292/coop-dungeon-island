// 카드 창 그리기 부품 (hud.md 8장, 승인 데모 docs/refs/demos/card_window.html · card_redesign.html): 글자·판정 칸을 모아 두는 Painter, 카드 모양 24×29(계열 테두리 cardFrame.ts)·판·버튼·꺾쇠·자물쇠·별·꼬리표·조각 보석·그림
import type Phaser from 'phaser';
import { hexToInt } from '@game/shared';
import icons from '../../data/sprites/hud_icons.json';
import { dot } from '../fx/layer';
import { colorInt } from '../palette';
import { cardShell, type FrameStyle, type Paint } from './cardFrame';
import { tierPlate } from './cardTier';
import { koText, koWidth, type KoText } from './koText';
import type { FontKey } from './fonts';
import { drawText } from './pixelFont';

type G = Phaser.GameObjects.Graphics;
/** palette 경로 또는 #hex → 정수 색 (테두리 밝기·그늘은 섞은 hex) */
export const C = (path: string) => (path.startsWith('#') ? hexToInt(path) : colorInt(path));

/** 카드 창 색 (palette.json global.ui 등) */
export const SK = {
  title: 'global.ui.skillTitle', card: 'global.ui.skillCard', cardBd: 'global.ui.skillCardBorder', shade: 'global.ui.skillShade', lit: 'global.ui.skillLit',
  pick: 'global.ui.skillPick', on: 'global.ui.skillOn', hi: 'global.ui.offline', border: 'global.ui.panelBorder', panel: 'global.ui.panel',
  coin: 'global.ui.coin', key: 'global.ui.keyLabel', dim: 'global.ui.textDim', txt: 'global.ui.steelLight', track: 'global.ui.barTrack', off: 'global.ui.offline',
  heal: 'global.ui.hp', danger: 'global.semantic.danger', gold: 'global.allyFx.gold', white: 'global.allyFx.white', steel: 'global.materials.steel', cover: 'global.ui.cover',
  flash: 'global.fx.flash', spare: 'global.fx.fireDeep', sky: 'global.allyFx.sky', mp: 'global.ui.mp', mpDark: 'global.ui.mpDark',
} as const;

/** 글자(koText)·마우스 판정 칸을 모아 두고 한 번에 지운다. (ox, oy) = 그리는 원점 */
export class Painter<H> {
  ox = 0;
  oy = 0;
  private texts: KoText[] = [];
  private hits: { x: number; y: number; w: number; h: number; hit: H }[] = [];

  constructor(private scene: Phaser.Scene, readonly g: G, private depth: number) {}

  text(x: number, y: number, s: string, color: string, font: FontKey = 'koSmall', alpha = 1): number {
    this.texts.push(koText(this.scene, this.ox + x, this.oy + y, s, { color, font }).setScrollFactor(0).setDepth(this.depth + 1).setAlpha(alpha));
    return koWidth(s, font);
  }

  /** 가운데 맞춘 글자 (폭 w 안) */
  center(x: number, w: number, y: number, s: string, color: string, font: FontKey = 'koSmall', alpha = 1): void {
    this.text(x + Math.floor((w - koWidth(s, font)) / 2), y, s, color, font, alpha);
  }

  hit(x: number, y: number, w: number, h: number, hit: H): void {
    this.hits.push({ x, y, w, h, hit });
  }

  /** 화면 좌표 → 판정 (나중에 넣은 것이 위) */
  at(px: number, py: number): H | null {
    const x = px - this.ox, y = py - this.oy;
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const h = this.hits[i]!;
      if (x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h) return h.hit;
    }
    return null;
  }

  clear(): void {
    this.g.clear();
    this.texts.forEach((t) => t.destroy());
    this.texts = [];
    this.hits = [];
  }
}

export const R = (g: G, x: number, y: number, w: number, h: number, color: string, alpha = 1) => dot(g, x, y, C(color), w, h, alpha);
/** Graphics 붓 (cardFrame.ts) */
export const paintOf = (g: G): Paint => (x, y, w, h, c, a) => R(g, x, y, w, h, c, a ?? 1);

/** 카드 id → 16×16 아이콘 이름 (hud_icons.json slots) */
export const cardIconName = (id: string): string => (icons.slots as Record<string, string>)[id] ?? 'empty';

/** 16×16 아이콘. mono = 한 색(그림자), inset = 가장자리를 이만큼 잘라 그림 */
export function cardIcon(g: G, id: string, x: number, y: number, o: { mono?: string; alpha?: number; inset?: number } = {}): void {
  const rows = (icons.icons as Record<string, string[]>)[cardIconName(id)], pal = icons.palette as Record<string, string>;
  const ins = o.inset ?? 0, end = 16 - ins;
  rows?.forEach((row, j) => [...row].forEach((ch, i) => {
    if (ch !== '.' && i >= ins && j >= ins && i < end && j < end) dot(g, x + i - ins, y + j - ins, C(o.mono ?? pal[ch]!), 1, 1, o.alpha ?? 1);
  }));
}

/** maxW 안에 안 들어가면 끝을 '…'로 */
export function fitKo(s: string, maxW: number, font: FontKey = 'koSmall'): string {
  if (koWidth(s, font) <= maxW) return s;
  while (s.length > 1 && koWidth(`${s}…`, font) > maxW) s = s.slice(0, -1);
  return `${s}…`;
}

export function lockIcon(g: G, x: number, y: number, color: string): void {
  R(g, x + 1, y, 3, 1, color); R(g, x, y + 1, 1, 2, color); R(g, x + 4, y + 1, 1, 2, color);
  R(g, x, y + 3, 5, 4, color); R(g, x + 2, y + 4, 1, 2, SK.shade);
}

/** 고른 칸 모서리 꺾쇠 */
export function corners(g: G, x: number, y: number, w: number, h: number, color: string): void {
  for (const [cx, cy, sx, sy] of [[x - 2, y - 2, 1, 1], [x + w + 1, y - 2, -1, 1], [x - 2, y + h + 1, 1, -1], [x + w + 1, y + h + 1, -1, -1]] as const) {
    R(g, sx > 0 ? cx : cx - 2, cy, 3, 1, color);
    R(g, cx, sy > 0 ? cy : cy - 2, 1, 3, color);
  }
}

/** 판: 그림자 + 테두리 + 안 */
export function box(g: G, x: number, y: number, w: number, h: number, border: string = SK.border): void {
  R(g, x + 1, y + 1, w, h, SK.shade);
  R(g, x, y, w, h, border);
  R(g, x + 1, y + 1, w - 2, h - 2, SK.card);
}

/** 버튼 바탕 (글자는 부르는 쪽). hover = 금색, border = 테두리 색 (갈기 추천 주황·확인 빨강) */
export function buttonBox(g: G, x: number, y: number, w: number, s: { hover: boolean; border?: string }): void {
  R(g, x, y + 1, w, 12, SK.shade);
  R(g, x, y, w, 12, s.hover ? SK.coin : s.border ?? SK.border);
  R(g, x + 1, y + 1, w - 2, 10, s.hover ? SK.pick : SK.lit);
  R(g, x + 1, y + 1, w - 2, 1, s.hover ? SK.gold : SK.hi, s.hover ? 0.4 : 1);
}

/** 장착 꼬리표 (칸 왼쪽 아래): A S D F 글자, 패시브는 'P' = 초록 체크 */
export function keyTag(g: G, x: number, y: number, key: string): void {
  R(g, x, y, 7, 9, SK.shade);
  R(g, x, y, 6, 8, SK.border);
  R(g, x + 1, y + 1, 4, 6, SK.title);
  if (key !== 'P') return void drawText(g, key, x + 1, y + 2, { color: SK.flash, outline: 'none' });
  R(g, x + 1, y + 4, 1, 1, SK.heal); R(g, x + 2, y + 5, 1, 1, SK.heal); R(g, x + 3, y + 3, 1, 2, SK.heal); R(g, x + 4, y + 2, 1, 1, SK.heal);
}

/** 3×5 글자 ("Lv11", "+1") */
export const tiny = (g: G, s: string, x: number, y: number, color: string) => drawText(g, s, x, y, { color, outline: 'none' });
export const tinyW = (s: string) => s.length * 4 - 1;

/** 티어 별 3×3 십자 */
export function star(g: G, x: number, y: number, color: string): void {
  R(g, x + 1, y, 1, 3, color);
  R(g, x, y + 1, 3, 1, color);
}

/** 로마 숫자 Ⅰ·Ⅱ (높이 7, 글꼴에 없어 도트로) */
export function roman(g: G, n: number, x: number, y: number, color: string): void {
  for (let i = 0; i < n; i++) R(g, x + i * 3, y, 1, 7, color);
  R(g, x - 1, y, n * 3, 1, color);
  R(g, x - 1, y + 6, n * 3, 1, color);
}

/** 조각 보석 7×6 */
export function dustGem(g: G, x: number, y: number): void {
  R(g, x + 2, y, 3, 1, SK.sky); R(g, x + 1, y + 1, 5, 1, SK.sky); R(g, x, y + 2, 7, 1, SK.mp);
  R(g, x + 1, y + 3, 5, 1, SK.mpDark); R(g, x + 2, y + 4, 3, 1, SK.mpDark); R(g, x + 3, y + 5, 1, 1, SK.mpDark); R(g, x + 2, y + 1, 1, 1, SK.white);
}

/** 제목 카드 그림 8×10 */
export function titleCard(g: G, x: number, y: number): void {
  R(g, x, y, 8, 10, SK.border);
  R(g, x + 1, y + 1, 6, 8, SK.lit);
  R(g, x + 1, y + 1, 6, 1, SK.hi);
  star(g, x + 2, y + 3, SK.coin);
  R(g, x + 4, y + 5, 2, 2, SK.sky);
}

/** 카드 모양 크기 */
export const CW = 24, CH = 29;

/** 카드 모양 하나 (그리기용) */
export interface FaceLook {
  id: string;
  tier: number;
  /** 티어 색 (테두리 아님: 카드 상점 뒷면 빛·티어 3 이름 띠, cards.json tiers color) */
  tierColor: string;
  /** 계열 테두리 모양·색 */
  frame: FrameStyle;
  color: string;
  owned: boolean;
  enhanced: boolean;
  /** 같은 카드 3장 → 강화할 수 있음 (카드 아래 ▲, 상세 강화 버튼) */
  ready: boolean;
  /** 보관 장수 */
  count: number;
  /** 강화 뒤 남는 장수 */
  spare: number;
  /** 장착 숙련도 (모자라면 자물쇠) */
  equipLevel: number;
  locked: boolean;
  /** 장착 꼬리표 (A S D F 또는 P, 없으면 null) */
  tag: string | null;
}

/** 카드 24×29: 계열 테두리 · 티어 판 · 아이콘 · 자물쇠(장착 숙련도 모자람) · 꼬리표. 없는 카드는 같은 모양의 그림자.
 * 강화 반짝임·강화 가능 ▲은 움직여서 CardWindow가 따로 그림 (cardFrame.ts cardShine·readyMark). big = 상세 머리(꼬리표 없음). 몸통 시작 거리를 돌려줌 */
export function cardFace(g: G, f: FaceLook, x: number, y: number, o: { sel?: boolean; hov?: boolean; big?: boolean } = {}): number {
  const ins = cardShell(paintOf(g), f.frame, x, y, CH, f.color, f.owned);
  tierPlate(paintOf(g), x, y, CH, f.tier, f.tierColor, f.owned);
  if (!f.owned) cardIcon(g, f.id, x + 4, y + 7, { mono: SK.cardBd });
  else {
    cardIcon(g, f.id, x + 4, y + 7, { alpha: f.locked ? 0.25 : 1 });
    if (f.locked) lockIcon(g, x + 10, y + 12, SK.key);
  }
  if (!o.big && f.tag) keyTag(g, x - 2, y + CH - 8, f.tag);
  if (o.sel) corners(g, x, y, CW, CH, SK.coin);
  else if (o.hov) { R(g, x, y, CW, 1, SK.key); R(g, x, y + CH - 1, CW, 1, SK.key); R(g, x, y, 1, CH, SK.key); R(g, x + CW - 1, y, 1, CH, SK.key); }
  return ins;
}
