// 카드 상점 화면 그리기 도구 (hud.md 8장 카드 상점, 승인 데모 docs/refs/demos/card_shop.html): 384×216 캔버스에 매 프레임 픽셀로 그린다
// (팩 흔들기·뒤집기·빛·입자가 계속 움직여 Graphics + 글자 객체 대신 캔버스 텍스처 하나). 글자 = 갈무리 비트맵(paintText), 색 = palette.json
import icons from '../../data/sprites/hud_icons.json';
import { color } from '../palette';
import { glyphFont, type FontKey } from './fonts';
import { measureText, paintText } from './glyphFont';
import { GLYPHS } from './pixelFont';

/** palette 경로 → hex (한 번 읽은 값은 기억) */
const memo = new Map<string, string>();
export const hx = (path: string): string => {
  let v = memo.get(path);
  if (!v) memo.set(path, (v = path.startsWith('#') ? path : color(path)));
  return v;
};

/** 두 색 섞기 (t = 0 → a, 1 → b). 빛·그늘 단계에만 쓴다 */
export function mix(a: string, b: string, t: number): string {
  const A = hexRgb(hx(a)), B = hexRgb(hx(b));
  return `#${A.map((v, i) => Math.round(v + (B[i]! - v) * t).toString(16).padStart(2, '0')).join('')}`;
}
const hexRgb = (h: string): number[] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** 상점 화면 색 (palette.json global.ui 등, 카드 창과 같은 판 색) */
export const SC = {
  title: 'global.ui.skillTitle', card: 'global.ui.skillCard', cardBd: 'global.ui.skillCardBorder', shade: 'global.ui.skillShade', lit: 'global.ui.skillLit',
  pick: 'global.ui.skillPick', border: 'global.ui.panelBorder', panel: 'global.ui.panel', hi: 'global.ui.offline', coin: 'global.ui.coin', coinShade: 'global.ui.coinShade',
  key: 'global.ui.keyLabel', txt: 'global.ui.steelLight', track: 'global.ui.barTrack', off: 'global.ui.offline', heal: 'global.ui.hp', danger: 'global.semantic.danger',
  gold: 'global.allyFx.gold', white: 'global.allyFx.white', sky: 'global.allyFx.sky', flash: 'global.fx.flash', mp: 'global.ui.mp', mpDark: 'global.ui.mpDark',
  outline: 'global.outline', cover: 'global.ui.cover', dust: 'global.fx.dustLight',
} as const;

/** 픽셀 붓: 사각형·글자·아이콘 + 마우스 판정 칸 */
export class Pix<H> {
  hits: { x: number; y: number; w: number; h: number; hit: H }[] = [];
  /** 버튼 위 마우스 (금색) */
  hoverBtn: string | null = null;

  constructor(public ctx: CanvasRenderingContext2D) {}

  R(x: number, y: number, w: number, h: number, c: string, alpha = 1): void {
    if (alpha <= 0 || w <= 0 || h <= 0) return;
    const ctx = this.ctx;
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.fillStyle = hx(c);
    ctx.fillRect(Math.round(x), Math.round(y), w, h);
    ctx.globalAlpha = 1;
  }

  hit(x: number, y: number, w: number, h: number, hit: H): void {
    this.hits.push({ x, y, w, h, hit });
  }

  at(x: number, y: number): H | null {
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const h = this.hits[i]!;
      if (x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h) return h.hit;
    }
    return null;
  }

  /** 글자 (sc = 배율, 티어 3 이름은 2배). 폭을 돌려준다 */
  text(s: string, x: number, y: number, c: string, font: FontKey = 'koSmall', alpha = 1, sc = 1): number {
    const f = glyphFont(font);
    if (!f) return 0;
    const ctx = this.ctx;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = hx(c);
    paintText(f, s, (px, py) => ctx.fillRect(Math.round(x) + px * sc, Math.round(y) + py * sc, sc, sc));
    ctx.globalAlpha = 1;
    return measureText(f, s) * sc;
  }

  width(s: string, font: FontKey = 'koSmall'): number {
    const f = glyphFont(font);
    return f ? measureText(f, s) : 0;
  }

  center(s: string, x: number, w: number, y: number, c: string, font: FontKey = 'koSmall', alpha = 1, sc = 1): void {
    this.text(s, x + Math.floor((w - this.width(s, font) * sc) / 2), y, c, font, alpha, sc);
  }

  /** 폭 안에 안 들어가면 끝을 '…'로 */
  fit(s: string, maxW: number, font: FontKey = 'koSmall'): string {
    if (this.width(s, font) <= maxW) return s;
    while (s.length > 1 && this.width(`${s}…`, font) > maxW) s = s.slice(0, -1);
    return `${s}…`;
  }

  /** 낱말 단위 줄 나눔 (긴 낱말은 글자 단위) */
  wrap(s: string, maxW: number, font: FontKey = 'koSmall'): string[] {
    const out: string[] = [];
    for (const para of s.split('\n')) {
      let line = '';
      for (const word of para.split(' ')) {
        const t = line ? `${line} ${word}` : word;
        if (this.width(t, font) <= maxW) { line = t; continue; }
        if (line) out.push(line);
        line = '';
        for (const ch of word) {
          if (this.width(line + ch, font) > maxW) { out.push(line); line = ''; }
          line += ch;
        }
      }
      if (line) out.push(line);
    }
    return out;
  }

  /** 3×5 숫자·영문 (가격·NEW) */
  tiny(s: string, x: number, y: number, c: string): void {
    [...s].forEach((ch, i) => GLYPHS[ch]?.forEach((row, j) => [...row].forEach((b, k) => { if (b === '1') this.R(x + i * 4 + k, y + j, 1, 1, c); })));
  }

  /** 카드 아이콘 16×16 (sc 배율, mono = 한 색) */
  icon(id: string, x: number, y: number, o: { sc?: number; mono?: string; alpha?: number } = {}): void {
    const name = (icons.slots as Record<string, string>)[id.replace(/^\w+\./, '')] ?? 'empty';
    const rows = (icons.icons as Record<string, string[]>)[name], pal = icons.palette as Record<string, string>, sc = o.sc ?? 1;
    rows?.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== '.') this.R(x + i * sc, y + j * sc, sc, sc, o.mono ?? pal[ch]!, o.alpha ?? 1); }));
  }

  star(x: number, y: number, c: string, alpha = 1): void {
    this.R(x + 1, y, 1, 3, c, alpha);
    this.R(x, y + 1, 3, 1, c, alpha);
  }

  lock(x: number, y: number, c: string): void {
    this.R(x + 1, y, 3, 1, c); this.R(x, y + 1, 1, 2, c); this.R(x + 4, y + 1, 1, 2, c); this.R(x, y + 3, 5, 4, c); this.R(x + 2, y + 4, 1, 2, SC.shade);
  }

  corners(x: number, y: number, w: number, h: number, c: string, alpha = 1): void {
    for (const [cx, cy, sx, sy] of [[x - 2, y - 2, 1, 1], [x + w + 1, y - 2, -1, 1], [x - 2, y + h + 1, 1, -1], [x + w + 1, y + h + 1, -1, -1]] as const) {
      this.R(sx > 0 ? cx : cx - 2, cy, 3, 1, c, alpha);
      this.R(cx, sy > 0 ? cy : cy - 2, 1, 3, c, alpha);
    }
  }

  dustGem(x: number, y: number): void {
    this.R(x + 2, y, 3, 1, SC.sky); this.R(x + 1, y + 1, 5, 1, SC.sky); this.R(x, y + 2, 7, 1, SC.mp);
    this.R(x + 1, y + 3, 5, 1, SC.mpDark); this.R(x + 2, y + 4, 3, 1, SC.mpDark); this.R(x + 3, y + 5, 1, 1, SC.mpDark); this.R(x + 2, y + 1, 1, 1, SC.white);
  }

  coin(x: number, y: number): void {
    this.R(x + 1, y, 4, 1, SC.coin); this.R(x, y + 1, 6, 4, SC.coin); this.R(x, y + 4, 6, 1, SC.coinShade); this.R(x + 1, y + 5, 4, 1, SC.coinShade); this.R(x + 2, y + 2, 2, 1, SC.flash);
  }

  /** 버튼 (w×12). ico = 코인·조각 그림, bd = 테두리 색. 막힘이면 흐리고 판정 없음 */
  button(id: string, label: string, x: number, y: number, w: number, hit: H, o: { off?: boolean; ico?: 'coin' | 'dust'; bd?: string } = {}): void {
    const hv = this.hoverBtn === id && !o.off;
    this.R(x, y + 1, w, 12, SC.shade);
    this.R(x, y, w, 12, hv ? SC.coin : o.bd ?? SC.border);
    this.R(x + 1, y + 1, w - 2, 10, hv ? SC.pick : SC.lit);
    this.R(x + 1, y + 1, w - 2, 1, hv ? SC.gold : SC.hi, hv ? 0.4 : 1);
    const a = o.off ? 0.35 : 1, tw = this.width(label) + (o.ico ? 10 : 0);
    let tx = x + Math.floor((w - tw) / 2);
    if (o.ico === 'coin') this.coin(tx, y + 3);
    else if (o.ico === 'dust') this.dustGem(tx, y + 3);
    if (o.ico) tx += 10;
    this.text(label, tx, y + 1, hv ? SC.coin : SC.txt, 'koSmall', a);
    if (!o.off) this.hit(x, y, w, 12, hit);
  }
}
