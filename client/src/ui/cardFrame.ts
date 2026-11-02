// 카드 테두리 (hud.md 8장, 승인 데모 docs/refs/demos/card_redesign.html): 계열마다 모양·색이 다르다. 티어는 카드 아래 판(cardTier.ts) (테두리 색 아님)
// 기본·공용 = 얇은 강철 / 대검 A 파쇄 = 두꺼운 돌(깎인 모서리·금·아래 묵직) / B 검기 = 왼쪽 위·오른쪽 아래 사선 + 칼끝 /
// 스태프 A 원소 = 위 불꽃 혀·아래 불씨 / B 중력 = 이중 테두리 + 모서리 밖 별. 없는 카드는 같은 모양의 그림자.
// 강화 = 몸통 위로 지나가는 빛줄기 + 반짝이는 별 (금테 없음). 붓(Paint)만 받아 카드 창(Graphics)·카드 상점(캔버스)이 같이 쓴다
import { mix } from './shopPix';

export type FrameStyle = 'base' | 'gsA' | 'gsB' | 'stA' | 'stB';
/** 사각형 붓 (색 = palette 경로 또는 #hex) */
export type Paint = (x: number, y: number, w: number, h: number, color: string, alpha?: number) => void;

/** 무기·계열 → 테두리 모양 (모양 없는 무기·기본·공용은 강철) */
const STYLES: Record<string, Partial<Record<string, FrameStyle>>> = { greatsword: { A: 'gsA', B: 'gsB' }, staff: { A: 'stA', B: 'stB' } };
export const frameStyle = (weapon: string, branch: string): FrameStyle => STYLES[weapon]?.[branch] ?? 'base';

/** 카드 폭 (논리 px, 큰 카드는 배율로) */
const W = 24;
const SHADE = 'global.ui.skillShade', NONE = 'global.ui.skillCardBorder', DARK = 'global.ui.skillTitle';
const EMBER = 'global.allyFx.gold', FLASH = 'global.fx.flash', COIN = 'global.ui.coin', OUT = 'global.outline';

/** 테두리 안쪽 몸통이 시작하는 거리 */
export const frameInset = (s: FrameStyle): number => (s === 'gsA' || s === 'stB' ? 3 : 2);

/** 배율 붓: 논리 좌표 (x, y)를 k배로 */
export const scaled = (R: Paint, ox: number, oy: number, k: number): Paint => (x, y, w, h, c, a) => R(ox + (x - ox) * k, oy + (y - oy) * k, w * k, h * k, c, a);

const slash = (R: Paint, x: number, y: number, w: number, h: number, cut: number, c: string) => {
  for (let j = 0; j < h; j++) {
    const l = Math.max(0, cut - j), r = Math.max(0, j - (h - 1 - cut));
    R(x + l, y + j, w - l - r, 1, c);
  }
};
const chunk = (R: Paint, x: number, y: number, w: number, h: number, c: string) => {
  R(x + 2, y, w - 4, h, c); R(x, y + 2, w, h - 4, c); R(x + 1, y + 1, w - 2, h - 2, c);
};

/** 카드 껍데기 (그림자 + 계열 테두리 + 몸통) 24×h. col = 계열 색, own = 가진 카드 (아니면 그림자 색). 몸통 시작 거리를 돌려줌 */
export function cardShell(R: Paint, s: FrameStyle, x: number, y: number, h: number, col: string, own: boolean): number {
  const c = own ? col : NONE, dk = own ? mix(col, OUT, 0.45) : DARK, lt = own ? mix(col, FLASH, 0.45) : NONE, P = (px: number, py: number, pc: string) => R(px, py, 1, 1, pc);
  if (s === 'gsA') chunk(R, x + 1, y + 1, W, h, SHADE);
  else if (s === 'gsB') slash(R, x + 1, y + 1, W, h, 3, SHADE);
  else R(x + 1, y + 1, W, h, SHADE);
  if (s === 'gsA') {
    chunk(R, x, y, W, h, c); R(x + 2, y + 2, W - 4, h - 4, dk); R(x + 2, y + h - 3, W - 4, 1, c);
    for (const i of [2, 3, 9, 17, 18]) P(x + i, y, lt);
    P(x, y + 10, dk); P(x + 1, y + 11, dk); P(x, y + 12, dk);
    P(x + W - 1, y + h - 12, dk); P(x + W - 2, y + h - 11, dk); P(x + W - 1, y + h - 10, dk);
    R(x + 14, y, 2, 1, dk); P(x + 15, y + 1, dk);
  } else if (s === 'gsB') {
    slash(R, x, y, W, h, 3, c); slash(R, x + 1, y + 1, W - 2, h - 2, 3, dk);
    for (let i = 0; i < 4; i++) { P(x + 3 - i, y + i, lt); P(x + W - 4 + i, y + h - 1 - i, lt); }
    P(x + W, y - 1, lt); P(x + W + 1, y - 2, c); P(x - 1, y + h, lt); P(x - 2, y + h + 1, c);
  } else if (s === 'stA') {
    R(x, y, W, h, c); R(x + 1, y + 1, W - 2, h - 2, dk);
    const fl = own ? EMBER : NONE;
    for (const [i, th] of [[3, 1], [7, 2], [11, 1], [15, 2], [19, 1]] as const) { R(x + i, y - th, 1, th, th > 1 ? fl : c); if (th > 1) P(x + i + 1, y - 1, c); }
    P(x + 2, y + h - 3, fl); P(x + W - 3, y + h - 3, fl); P(x + W - 5, y + h - 2, c);
  } else if (s === 'stB') {
    R(x, y, W, h, c); R(x + 1, y + 1, W - 2, h - 2, SHADE); R(x + 2, y + 2, W - 4, h - 4, c);
    P(x - 1, y - 1, own ? mix(col, FLASH, 0.6) : NONE); P(x + W, y + h, own ? mix(col, FLASH, 0.6) : NONE); P(x + W, y - 1, dk); P(x - 1, y + h, dk);
    P(x + W / 2, y, lt); P(x + W / 2, y + h - 1, lt);
  } else {
    R(x, y, W, h, c); R(x + 1, y + 1, W - 2, h - 2, dk);
  }
  const ins = frameInset(s), bx = x + ins, by = y + ins, bw = W - ins * 2, bh = h - ins * 2;
  R(bx, by, bw, bh, own ? 'global.ui.skillLit' : DARK);
  if (own) R(bx, by, bw, 1, 'global.ui.offline');
  if (s === 'gsB') { P(bx, by, dk); P(bx + 1, by, dk); P(bx, by + 1, dk); P(bx + bw - 1, by + bh - 1, dk); P(bx + bw - 2, by + bh - 1, dk); P(bx + bw - 1, by + bh - 2, dk); }
  return ins;
}

/** 강화 표시 (몸통 bx, by, bw, bh 안): 움직임 없이 고정된 별 두 개. t·ph는 받기만 함 (호출부 모양 유지) */
export function cardShine(R: Paint, bx: number, by: number, bw: number, bh: number, _t: number, _ph: number): void {
  for (const [dx, dy] of [[bw - 4, 3], [3, bh - 5]] as const) {
    const cx = bx + dx, cy = by + dy;
    R(cx, cy, 1, 1, FLASH);
    R(cx - 1, cy, 1, 1, COIN); R(cx + 1, cy, 1, 1, COIN); R(cx, cy - 1, 1, 1, COIN); R(cx, cy + 1, 1, 1, COIN);
  }
}

/** 강화 가능 (같은 카드 3장): 카드 아래 가운데 금색 ▲, 0.4초마다 깜빡 */
export function readyMark(R: Paint, x: number, y: number, h: number, t: number): void {
  if (Math.floor(t * 2.5) % 2) return;
  const cx = x + W / 2;
  R(cx - 3, y + h - 2, 7, 4, SHADE);
  R(cx, y + h - 1, 1, 1, COIN); R(cx - 1, y + h, 3, 1, COIN); R(cx - 2, y + h + 1, 5, 1, COIN);
}

/** 카드마다 반짝임 어긋남 (같은 카드는 늘 같게) */
export const shinePhase = (id: string): number => ([...id].reduce((s, ch) => s + ch.charCodeAt(0), 0) % 10) * 0.26;
