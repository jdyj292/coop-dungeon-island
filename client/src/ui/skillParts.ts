// 스킬 창 그리기 부품 (hud.md 8장, 승인 데모 docs/refs/demos/skill_window.html): 글자·판정 칸을 모아 두는 Painter, 칸·카드·버튼·꺾쇠·자물쇠·포인트 점·그림
import type Phaser from 'phaser';
import icons from '../../data/sprites/hud_icons.json';
import { dot } from '../fx/layer';
import { colorInt } from '../palette';
import { koText, koWidth, type KoText } from './koText';
import type { FontKey } from './fonts';
import { drawText } from './pixelFont';

type G = Phaser.GameObjects.Graphics;
export const C = (path: string) => colorInt(path);

/** 스킬 창 색 (palette.json global.ui 등) */
export const SK = {
  title: 'global.ui.skillTitle', card: 'global.ui.skillCard', cardBd: 'global.ui.skillCardBorder', shade: 'global.ui.skillShade', lit: 'global.ui.skillLit',
  pick: 'global.ui.skillPick', on: 'global.ui.skillOn', hi: 'global.ui.offline', border: 'global.ui.panelBorder', panel: 'global.ui.panel',
  coin: 'global.ui.coin', key: 'global.ui.keyLabel', dim: 'global.ui.textDim', txt: 'global.ui.steelLight', track: 'global.ui.barTrack', off: 'global.ui.offline',
  heal: 'global.ui.hp', danger: 'global.semantic.danger', gold: 'global.allyFx.gold', white: 'global.allyFx.white', steel: 'global.materials.steel', cover: 'global.ui.cover',
  flash: 'global.fx.flash',
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

/** 안 배운 패시브 회색: 밝은 글자 → keyLabel, 나머지 → offline */
const LIGHT = new Set(['w', 'l', 'y', 'k', 'a', 'r']);

/** 16×16 HUD 아이콘 (hud_icons.json icons) */
function hudIcon(g: G, name: string, x: number, y: number, gray: boolean, alpha: number): void {
  const rows = (icons.icons as Record<string, string[]>)[name], pal = icons.palette as Record<string, string>;
  rows?.forEach((row, j) => [...row].forEach((ch, i) => {
    if (ch !== '.') dot(g, x + i, y + j, C(gray ? (LIGHT.has(ch) ? SK.key : SK.off) : pal[ch]!), 1, 1, alpha);
  }));
}

/** 노드 id → 아이콘 (hud_icons.json slots, 공용 패시브는 무기 이름을 뺀 id) */
const slotIcon = (id: string): string | undefined => (icons.slots as Record<string, string>)[id.replace(/^\w+\./, '')];

/** 노드 그림 16×16을 size 칸 가운데에. 없으면 false (부르는 쪽이 이름 첫 글자). gray = 안 배운 패시브 */
export function nodeArt(g: G, id: string, x: number, y: number, size: number, gray: boolean, alpha: number): boolean {
  const ic = slotIcon(id);
  if (!ic) return false;
  const o = Math.floor((size - 16) / 2);
  hudIcon(g, ic, x + o, y + o, gray, alpha);
  return true;
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

/** 카드: 테두리 + 안 + 윗줄 광택 + 아랫줄 그림자 */
export function card(g: G, x: number, y: number, w: number, h: number, border: string = SK.cardBd): void {
  R(g, x + 1, y + 1, w, h, SK.shade);
  R(g, x, y, w, h, border);
  R(g, x + 1, y + 1, w - 2, h - 2, SK.card);
  R(g, x + 1, y + 1, w - 2, 1, SK.flash, 0.05);
}

/** 버튼 바탕 (글자는 부르는 쪽). hover = 금색, on = 초록(켜짐), dis = 흐림 */
export function buttonBox(g: G, x: number, y: number, w: number, s: { hover: boolean; on?: boolean }): void {
  R(g, x, y + 1, w, 12, SK.shade);
  R(g, x, y, w, 12, s.hover ? SK.coin : s.on ? SK.heal : SK.border);
  R(g, x + 1, y + 1, w - 2, 10, s.hover ? SK.pick : s.on ? SK.on : SK.lit);
  R(g, x + 1, y + 1, w - 2, 1, s.hover ? SK.gold : SK.hi, s.hover ? 0.4 : 1);
}

/** 포인트 점 n개 (p개 채움): 3×3 십자 + 그림자 */
export function dots(g: G, x: number, y: number, n: number, p: number, color: string): void {
  for (let i = 0; i < n; i++) {
    const px = x + i * 4, c = i < p ? color : SK.track;
    R(g, px, y, 3, 3, SK.shade);
    R(g, px + 1, y, 1, 3, c);
    R(g, px, y + 1, 3, 1, c);
  }
}

/** 장착 키 꼬리표 (칸 왼쪽 아래) */
export function keyTag(g: G, x: number, y: number, key: string): void {
  R(g, x, y, 7, 9, SK.shade);
  R(g, x, y, 6, 8, SK.border);
  R(g, x + 1, y + 1, 4, 6, SK.title);
  drawText(g, key, x + 1, y + 1, { color: 'global.fx.flash', outline: 'none' });
}

/** 3×5 글자 (잠긴 칸 "Lv6") */
export const tiny = (g: G, s: string, x: number, y: number, color: string) => drawText(g, s, x, y, { color, outline: 'none' });

/** SP 보석 (5×5) */
export function gem(g: G, x: number, y: number): void {
  for (const [a, b, w] of [[2, 0, 1], [1, 1, 3], [0, 2, 5], [1, 3, 3], [2, 4, 1]] as const) R(g, x + a, y + b, w, 1, b < 2 ? SK.gold : SK.coin);
}

/** 제목 별 (7×7) */
export function star(g: G, x: number, y: number): void {
  const P = [[3, 0], [3, 1], [2, 2], [3, 2], [4, 2], [0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [2, 5], [3, 5], [4, 5], [1, 6], [2, 6], [4, 6], [5, 6]];
  for (const [a, b] of P) R(g, x + a!, y + b!, 1, 1, b! < 3 ? SK.gold : SK.coin);
}
