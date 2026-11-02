// 카드 상점 카드·팩 그림 (hud.md 8장 카드 상점, 승인 데모 card_shop.html · card_redesign.html): 작은 카드 24×29(카드 창과 같은 계열 테두리), 큰 카드 앞면 48×64(같은 테두리 2배)·뒷면,
// 강화 = 반짝임 + 이름 뒤 금색 +, 뒤집기(가로로 줄였다 폄), 뒷면 티어 빛, 카드팩(팩 번호 색, 위아래 톱니·카드 문장)·찢긴 윗부분
import { cardShell, cardShine, frameInset, readyMark, scaled, shinePhase, type Paint } from './cardFrame';
import type { CardInfo } from './cardTypes';
import { mix, Pix, SC } from './shopPix';

export const CW = 24, CH = 29, BW = 48, BH = 64;

/** 캔버스 붓 */
const paint = (p: Pix<unknown>): Paint => (x, y, w, h, c, a) => p.R(x, y, w, h, c, a ?? 1);

/** 작은 카드 (지정 구매 목록, 카드 창과 같은 모양): 계열 테두리·별·아이콘, 강화 = 반짝임, 3장 모임 = ▲, 없는 카드는 그림자. dim = 강화를 마침. t = 초 */
export function smallCard(p: Pix<unknown>, f: CardInfo, x: number, y: number, t: number, o: { sel?: boolean; hov?: boolean; dim?: boolean } = {}): void {
  const P = paint(p), ins = cardShell(P, f.frame, x, y, CH, f.color, f.owned);
  for (let i = 0; i < f.tier; i++) p.star(x + ins + 1 + i * 4, y + ins + 1, f.owned ? SC.txt : SC.cardBd);
  p.icon(f.id, x + 4, y + 7, f.owned ? {} : { mono: SC.cardBd });
  if (f.owned && f.enhanced) cardShine(P, x + ins, y + ins, CW - ins * 2, CH - ins * 2, t, shinePhase(f.id));
  if (f.ready) readyMark(P, x, y, CH, t);
  if (o.dim) p.R(x, y, CW, CH, SC.shade, 0.55);
  if (o.sel) p.corners(x, y, CW, CH, SC.coin);
  else if (o.hov) { p.R(x, y, CW, 1, SC.key); p.R(x, y + CH - 1, CW, 1, SC.key); p.R(x, y, 1, CH, SC.key); p.R(x + CW - 1, y, 1, CH, SC.key); }
}

/** 큰 카드 앞면 48×64: 작은 카드와 같은 계열 테두리 2배(24×32) + 별 + 아이콘 2배 + 이름(강화 = 금색 +). 패시브는 오른쪽 위 P. 반짝임은 bigShine */
export function bigFace(p: Pix<unknown>, f: CardInfo, x: number, y: number): void {
  const ins = cardShell(scaled(paint(p), x, y, 2), f.frame, x, y, BH / 2, f.color, true) * 2;
  for (let i = 0; i < f.tier; i++) p.star(x + ins + 2 + i * 4, y + ins + 2, SC.txt);
  if (!f.active) { p.R(x + BW - ins - 8, y + ins + 2, 6, 5, SC.title); p.tiny('P', x + BW - ins - 7, y + ins + 2, SC.heal); }
  p.R(x + 7, y + 10, 34, 34, SC.title);
  p.icon(f.id, x + 8, y + 11, { sc: 2 });
  const name = p.fit(f.name, BW - (f.enhanced ? 16 : 10)), nw = p.width(name) + (f.enhanced ? p.width('+') + 1 : 0), nx = x + Math.floor((BW - nw) / 2);
  p.text(name, nx, y + 45, SC.txt);
  if (f.enhanced) p.text('+', nx + p.width(name) + 1, y + 45, SC.coin);
}

/** 큰 카드 강화 반짝임 (앞면 위에 매 프레임) */
export function bigShine(p: Pix<unknown>, f: CardInfo, x: number, y: number, t: number): void {
  if (!f.enhanced) return;
  const ins = frameInset(f.frame) * 2;
  cardShine(paint(p), x + ins, y + ins, BW - ins * 2, BH - ins * 2, t, shinePhase(f.id));
}

/** 카드 뒷면 48×64: 어두운 격자 + 팩 색 마름모 */
export function bigBack(p: Pix<unknown>, x: number, y: number, packColor: string): void {
  p.R(x, y, BW, BH, SC.outline);
  p.R(x + 1, y + 1, BW - 2, BH - 2, SC.cardBd);
  p.R(x + 3, y + 3, BW - 6, BH - 6, SC.card);
  for (let j = 0; j < BH - 8; j++) for (let i = 0; i < BW - 8; i++) if ((i + j) % 6 === 0 || (i - j + 600) % 6 === 0) p.R(x + 4 + i, y + 4 + j, 1, 1, SC.title);
  p.R(x + 1, y + 1, BW - 2, 1, SC.hi);
  const cx = x + BW / 2, cy = y + BH / 2, dim = mix(packColor, SC.title, 0.45);
  for (let k = 0; k < 9; k++) { p.R(cx - k, cy - 9 + k, 2 * k, 1, packColor); p.R(cx - k, cy + 8 - k, 2 * k, 1, packColor); }
  for (let k = 1; k < 6; k++) { p.R(cx - k, cy - 5 + k, 2 * k, 1, dim); p.R(cx - k, cy + 4 - k, 2 * k, 1, dim); }
  p.star(cx - 1, cy - 1, SC.flash);
}

/** 큰 카드 그림 캐시 (뒤집기 때 가로로 줄여 그림) */
const cache = new Map<string, HTMLCanvasElement>();
function offscreen(key: string, draw: (p: Pix<unknown>) => void): HTMLCanvasElement {
  let c = cache.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = BW;
    c.height = BH;
    draw(new Pix(c.getContext('2d')!));
    cache.set(key, c);
  }
  return c;
}
export const faceImage = (f: CardInfo) => offscreen(`f|${f.id}|${f.enhanced ? 1 : 0}`, (p) => bigFace(p, f, 0, 0));
export const backImage = (packColor: string) => offscreen(`b|${packColor}`, (p) => bigBack(p, 0, 0, packColor));

/** 뒤집기 단계 s (0 = 뒷면, 1 = 앞면, f 없으면 뒷면만): 가운데 cx 기준 가로 축소. 다 뒤집힌 강화 카드는 반짝임 (t = 초) */
export function drawFlip(p: Pix<unknown>, cx: number, y: number, s: number, f: CardInfo | null, packColor: string, t: number): void {
  const w = Math.max(1, Math.round(BW * Math.abs(Math.cos(s * Math.PI))));
  p.R(cx - w / 2 + 1, y + 2, w, BH, SC.shade);
  p.ctx.drawImage(s < 0.5 || !f ? backImage(packColor) : faceImage(f), Math.round(cx - w / 2), Math.round(y), w, BH);
  if (f && s >= 1) bigShine(p, f, Math.round(cx - BW / 2), y, t);
}

/** 뒷면 빛 (a = 세기 0~1): 티어 1 = 테두리 한 줄, 2 = 번짐 + 반짝이 2개, 3 = 크게 맥박 + 반짝이 4개 */
export function glow(p: Pix<unknown>, x: number, y: number, w: number, h: number, tier: number, tc: string, a: number, t: number): void {
  if (a <= 0) return;
  const n = tier === 1 ? 1 : tier === 2 ? 3 : 6, pulse = tier >= 3 ? 0.75 + 0.25 * Math.sin(t * 8) : 1;
  for (let k = n; k >= 1; k--) {
    const al = a * pulse * (tier === 1 ? 0.9 : 0.22 + 0.5 * (1 - k / n));
    p.R(x - k, y - k + 1, w + 2 * k, h + 2 * k - 2, tc, al);
    p.R(x - k + 1, y - k, w + 2 * k - 2, h + 2 * k, tc, al);
  }
  if (tier < 2) return;
  const m = tier === 2 ? 2 : 4;
  for (let i = 0; i < m; i++) {
    const ang = ((t * (tier >= 3 ? 0.9 : 0.6) + i / m) % 1) * Math.PI * 2;
    p.star(x + w / 2 + Math.cos(ang) * (w / 2 + 4) - 1, y + h / 2 + Math.sin(ang) * (h / 2 + 4) - 1, i % 2 ? SC.flash : tc, Math.min(1, a));
  }
}

/** 카드팩 w×h: 팩 색 몸통(왼쪽 밝게·오른쪽 그늘), 위아래 톱니, 가운데 카드 문장, 아래 띠에 번호. torn = 윗부분이 찢겨 나감 */
export function packArt(p: Pix<unknown>, x: number, y: number, w: number, h: number, n: number, pc: string, o: { torn?: boolean; alpha?: number } = {}): void {
  const a = o.alpha ?? 1, lt = mix(pc, SC.flash, 0.35), dk = mix(pc, SC.outline, 0.35), dd = mix(pc, SC.outline, 0.6);
  x = Math.round(x); y = Math.round(y);
  const cut = Math.round(h * 0.16), top = o.torn ? cut : 0, bh = w >= 30 ? 11 : 5;
  p.R(x, y + 2 + top, w, h - 4 - top, SC.outline, a);
  p.R(x + 1, y + 2 + top, w - 2, h - 4 - top, pc, a);
  p.R(x + 1, y + 2 + top, 2, h - 4 - top, lt, a);
  p.R(x + w - 3, y + 2 + top, 2, h - 4 - top, dk, a);
  for (let i = 0; i < w; i += 2) { p.R(x + i, y + h - 2, 1, 2, dk, a); if (!o.torn) p.R(x + i, y, 1, 2, dk, a); }
  if (!o.torn) p.R(x + 1, y + cut, w - 2, 1, dk, a);
  else for (let i = 1; i < w - 1; i += 3) p.R(x + i, y + top + 2 - (i % 2), 2, 1, 'island.paper', a);
  p.R(x + 1, y + h - 3 - bh, w - 2, bh, dd, a);
  p.R(x + 1, y + h - 3 - bh, w - 2, 1, dk, a);
  const ew = Math.round(w * 0.46), eh = Math.round(w * 0.58), ex = x + Math.round((w - ew) / 2), ey = y + cut + Math.round((h - cut - bh - 3 - eh) / 2) + 1;
  p.R(ex, ey, ew, eh, SC.outline, a);
  p.R(ex + 1, ey + 1, ew - 2, eh - 2, 'island.paper', a);
  p.R(ex + 2, ey + 2, ew - 4, eh - 4, mix(pc, 'island.paper', 0.55), a);
  p.star(ex + Math.floor(ew / 2) - 1, ey + Math.floor(eh / 2) - 1, dd, a);
  if (w >= 30) p.center(`팩 ${n}`, x, w, y + h - 3 - bh, SC.flash, 'koSmall', a);
  else p.tiny(String(n), x + Math.floor((w - 3) / 2), y + h - 3 - bh, SC.flash);
}

/** 찢겨 날아가는 윗부분 */
export function packTop(p: Pix<unknown>, x: number, y: number, w: number, h: number, pc: string, a: number): void {
  const dk = mix(pc, SC.outline, 0.35), th = Math.round(h * 0.16) + 1;
  p.R(x, y + 2, w, th - 1, SC.outline, a);
  p.R(x + 1, y + 2, w - 2, th - 2, pc, a);
  for (let i = 0; i < w; i += 2) p.R(x + i, y, 1, 2, dk, a);
}
