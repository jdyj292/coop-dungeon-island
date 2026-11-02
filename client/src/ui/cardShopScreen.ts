// 카드 상점 화면 (섬 카드 상점 앞 E, hud.md 8장, island.md 5장, 승인 데모 docs/refs/demos/card_shop.html), 게임 화면 384×216 기준:
// 위 = 카드 상점 그림과 같은 보라·크림 천막 띠 + 제목 · 카드팩/지정 구매 탭 · 코인 · 조각 / 아래 = 나무 탁자, 왼쪽 판(무기·팩·고른 카드) + 오른쪽 어두운 펠트 매트.
// 팩 열기 연출은 stage/cardShopOpen.ts, 상태·입력은 stage/cardShop.ts
import { color } from '../palette';
import { ramp } from '../sprites/shade';
import type { CardInfo } from './cardTypes';
import { BH, BW, CH, CW, drawFlip, faceImage, glow, packArt, smallCard } from './shopCards';
import { Pix, SC } from './shopPix';

export const SW = 384, SH = 216;
/** 오른쪽 매트·왼쪽 판 */
export const MAT = { x: 102, y: 28, w: 276, h: 182 }, SIDE = { x: 6, y: 28, w: 90, h: 182 };

export type ShopTab = 'pack' | 'buy';
export type ShopBtn = 'gift' | 'coin' | 'dust' | 'all' | 'again' | 'ok' | 'buy';
export type ShopHit =
  | { kind: 'tab'; t: ShopTab } | { kind: 'weapon'; w: string } | { kind: 'pack'; n: number } | { kind: 'btn'; b: ShopBtn } | { kind: 'view'; v: 'active' | 'passive' }
  | { kind: 'card'; id: string } | { kind: 'packbody' } | { kind: 'flip'; i: number } | { kind: 'inside' };

export interface PackRow {
  n: number;
  open: boolean;
  unlockLevel: number;
  price: number;
  size: number;
  minTier: number;
  maxTier: number;
  odds: number[];
  lastMinTier: number;
  color: string;
  /** 천장 (이 무기에 그 티어 카드가 없으면 has = false). count = 마지막으로 연 팩에서 받은 횟수 (모르면 null) */
  pity: { tier: number; packs: number; has: boolean; count: number | null } | null;
}

/** 화면이 그리는 값 (stage/cardShop.ts) */
export interface ShopView {
  tab: ShopTab;
  weapons: { id: string; name: string }[];
  weapon: string;
  /** 팩을 여는 중 (탭·무기 못 바꿈) */
  opening: boolean;
  coin: number;
  dust: number;
  gifts: number;
  /** 선물 팩이 여는 팩 번호 */
  giftPack: number;
  packs: PackRow[];
  selPack: number;
  view: 'active' | 'passive';
  rows: { name: string; color: string | null; ids: string[] }[];
  sel: string;
  hover: string | null;
  merge: number;
  /** 상점 카드 (강화 표시 없는 기본 카드) */
  info: (id: string) => CardInfo;
  /** 이미 강화한 카드 (구매 버튼 꺼짐) */
  done: (id: string) => boolean;
  /** 지정 구매 직후 뒤집기 (t = 지난 초) */
  bought: { id: string; t: number } | null;
}

const WOOD = () => ramp(color('island.wood')), TENT = () => ramp(color('island.awningC'));
const CREAM = ['island.awningBLight', 'island.awningB', 'island.awningBShade'];

/** 배경: 탁자 판자 · 위 천막 띠 · 제목 띠 · 매트 · 왼쪽 판 */
export function background(p: Pix<ShopHit>): void {
  const wood = WOOD(), tent = TENT(), M = MAT, L = SIDE;
  for (let y = 23; y < SH; y++) { const k = (y - 23) % 14; p.R(0, y, SW, 1, k === 0 ? wood[2] : k === 1 ? wood[0] : wood[1]); }
  for (let y = 23; y < SH; y += 14) for (let x = Math.floor(y / 14) % 2 ? 20 : 60; x < SW; x += 97) p.R(x, y + 1, 1, 13, wood[2]);
  for (let x = 0; x < SW; x += 8) {
    const pu = (x >> 3) % 2 === 0, c = pu ? tent : CREAM;
    p.R(x, 0, 8, 4, c[1]!); p.R(x, 0, 8, 1, c[0]!); p.R(x + 1, 4, 6, 1, c[2]!); p.R(x + 2, 5, 4, 1, c[2]!);
  }
  p.R(0, 6, SW, 16, SC.title); p.R(0, 22, SW, 1, SC.border); p.R(0, 6, SW, 1, SC.shade);
  p.R(M.x + 1, M.y + 2, M.w, M.h, SC.shade); p.R(M.x, M.y, M.w, M.h, tent[3]); p.R(M.x + 2, M.y + 2, M.w - 4, M.h - 4, SC.title);
  for (let x = M.x + 4; x < M.x + M.w - 4; x += 4) { p.R(x, M.y + 4, 2, 1, SC.cardBd); p.R(x, M.y + M.h - 5, 2, 1, SC.cardBd); }
  for (let y = M.y + 4; y < M.y + M.h - 4; y += 4) { p.R(M.x + 4, y, 1, 2, SC.cardBd); p.R(M.x + M.w - 5, y, 1, 2, SC.cardBd); }
  p.R(L.x + 1, L.y + 2, L.w, L.h, SC.shade); p.R(L.x, L.y, L.w, L.h, SC.border); p.R(L.x + 1, L.y + 1, L.w - 2, L.h - 2, SC.panel); p.R(L.x + 1, L.y + 1, L.w - 2, 1, SC.hi);
  p.hit(0, 0, SW, SH, { kind: 'inside' });
}

/** 제목 띠: 카드 그림 · "카드 상점" · 탭 · 코인 · 조각 */
export function titleBand(p: Pix<ShopHit>, v: ShopView): void {
  p.R(8, 8, 9, 12, SC.border); p.R(9, 9, 7, 10, SC.lit); p.R(9, 9, 7, 1, SC.hi); p.star(11, 12, SC.coin);
  p.text('카드 상점', 21, 8, SC.txt);
  let tx = 84;
  for (const [t, lab] of [['pack', '카드팩'], ['buy', '지정 구매']] as const) {
    const tw = p.width(lab) + 14, on = v.tab === t;
    if (on) { p.R(tx, 7, tw, 16, SC.border); p.R(tx + 1, 8, tw - 2, 15, SC.panel); p.R(tx + 1, 8, tw - 2, 1, SC.hi); }
    else { p.R(tx, 9, tw, 12, SC.cardBd); p.R(tx + 1, 10, tw - 2, 10, SC.title); }
    p.text(lab, tx + 7, 10, on ? SC.txt : SC.key, 'koSmall', v.opening && !on ? 0.4 : 1);
    if (!v.opening) p.hit(tx, 7, tw, 15, { kind: 'tab', t });
    tx += tw + 2;
  }
  const dn = String(v.dust), cn = String(v.coin);
  let rx = 376 - p.width(dn);
  p.text(dn, rx, 9, SC.txt); rx -= 10; p.dustGem(rx, 11);
  rx -= p.width(cn) + 10; p.text(cn, rx, 9, SC.txt); rx -= 9; p.coin(rx, 11);
}

/** 왼쪽 판 위 무기 탭 */
export function weaponTabs(p: Pix<ShopHit>, v: ShopView, y: number): void {
  let x = SIDE.x + 4;
  for (const w of v.weapons) {
    const on = v.weapon === w.id;
    p.R(x, y, 41, 13, on ? SC.coin : SC.cardBd); p.R(x + 1, y + 1, 39, 11, on ? SC.pick : SC.title);
    p.center(w.name, x, 41, y + 1, on ? SC.coin : SC.key, 'koSmall', v.opening ? 0.5 : 1);
    if (!v.opening) p.hit(x, y, 41, 13, { kind: 'weapon', w: w.id });
    x += 42;
  }
}

/** 카드팩 탭: 왼쪽 = 무기 + 팩 목록, 매트 = 고른 팩(떠 있음) + 확률·마지막 장·천장 + 선물/코인/조각 버튼 */
export function packMenu(p: Pix<ShopHit>, v: ShopView, now: number): void {
  const L = SIDE, M = MAT;
  weaponTabs(p, v, L.y + 4);
  v.packs.forEach((k, i) => {
    const y = L.y + 22 + i * 42, on = v.selPack === k.n, gift = k.n === v.giftPack && v.gifts > 0 && k.open;
    p.R(L.x + 4, y, L.w - 8, 38, on ? SC.coin : SC.cardBd); p.R(L.x + 5, y + 1, L.w - 10, 36, on ? SC.pick : SC.card);
    packArt(p, L.x + 9, y + 5, 16, 24, k.n, k.color, { alpha: k.open ? 1 : 0.4 });
    p.text(`팩 ${k.n}`, L.x + 30, y + (gift ? 14 : 2), k.open ? SC.txt : SC.key);
    if (!k.open) { p.lock(L.x + 31, y + 20, SC.key); p.text(`Lv${k.unlockLevel}`, L.x + 38, y + 18, SC.key); }
    else if (gift) { const t = `선물 ${v.gifts}`, w = p.width(t) + 6; p.R(L.x + L.w - 6 - w, y + 3, w, 11, SC.heal); p.text(t, L.x + L.w - 3 - w, y + 3, SC.title); }
    else p.text(`티어 ${k.minTier}~${k.maxTier}`, L.x + 30, y + 18, SC.key);
    p.hit(L.x + 4, y, L.w - 8, 38, { kind: 'pack', n: k.n });
  });
  const ty = L.y + L.h - 46;
  p.text('산 팩은 그 자리에서', L.x + 5, ty, SC.off); p.text('바로 엽니다', L.x + 5, ty + 11, SC.off); p.text('갈기는 카드 창 K', L.x + 5, ty + 26, SC.off);
  const k = v.packs.find((o) => o.n === v.selPack);
  if (!k) return;
  const cx = M.x + M.w / 2, fy = Math.round(Math.sin(now * 2.2) * 2);
  p.R(cx - 18, M.y + 82, 36, 3, SC.shade);
  packArt(p, cx - 17, M.y + 20 + fy, 34, 52, k.n, k.color, { alpha: k.open ? 1 : 0.35 });
  if (!k.open) p.lock(cx - 3, M.y + 40, SC.flash);
  p.center(`${v.weapons.find((w) => w.id === v.weapon)?.name ?? ''} 팩 ${k.n}`, M.x, M.w, M.y + 90, SC.txt);
  p.center(`${k.size}장 · ${k.odds.map((o, i) => `티어 ${k.minTier + i} ${o}%`).join(' · ')}`, M.x, M.w, M.y + 106, SC.key);
  p.center(`마지막 장은 티어 ${k.lastMinTier} 이상`, M.x, M.w, M.y + 117, SC.key);
  if (k.pity) {
    const c = k.pity, t = !c.has ? `이 무기는 아직 티어 ${c.tier} 카드가 없음` : `천장: ${c.packs}팩 안에 티어 ${c.tier}${c.count === null ? '' : ` (지금 ${c.count}/${c.packs})`}`;
    p.center(t, M.x, M.w, M.y + 128, SC.off);
  }
  const by = M.y + M.h - 24;
  if (!k.open) return void p.center(`숙련도 Lv${k.unlockLevel}에 열림`, M.x, M.w, by, SC.danger);
  const gift = k.n === v.giftPack && v.gifts > 0;
  let bx = gift ? M.x + M.w / 2 - 130 : M.x + M.w / 2 - 84;
  if (gift) { p.button('gift', `선물 팩 열기 (${v.gifts})`, bx, by, 92, { kind: 'btn', b: 'gift' }, { bd: SC.heal }); bx += 98; }
  p.button('coin', String(k.price), bx, by, 78, { kind: 'btn', b: 'coin' }, { off: v.coin < k.price, ico: 'coin' });
  p.button('dust', String(k.price), bx + 84, by, 78, { kind: 'btn', b: 'dust' }, { off: v.dust < k.price, ico: 'dust' });
}

/** 지정 구매 탭: 왼쪽 = 무기 · 액티브/패시브 · 고른 카드 크게 · 조각 버튼, 매트 = 카드 목록(줄 = 계열, 카드 아래 조각 가격). 카드는 강화 표시 없이, 이미 강화한 카드는 가격·구매 버튼만 꺼짐 */
export function buyMenu(p: Pix<ShopHit>, v: ShopView, now: number): void {
  const L = SIDE, M = MAT;
  weaponTabs(p, v, L.y + 4);
  let x = L.x + 4;
  for (const [k, lab] of [['active', '액티브'], ['passive', '패시브']] as const) {
    const on = v.view === k;
    p.R(x, L.y + 20, 41, 12, on ? SC.key : SC.cardBd); p.R(x + 1, L.y + 21, 39, 10, on ? SC.lit : SC.title);
    p.center(lab, x, 41, L.y + 20, on ? SC.txt : SC.key);
    p.hit(x, L.y + 20, 41, 12, { kind: 'view', v: k });
    x += 42;
  }
  const f = v.info(v.sel), bx = L.x + (L.w - BW) / 2, by = L.y + 38;
  if (v.bought?.id === v.sel && v.bought.t < 0.3) drawFlip(p, bx + BW / 2, by, v.bought.t / 0.3, f, 'global.ui.card.pack1');
  else {
    if (f.owned && f.tier >= 2) glow(p, bx, by, BW, BH, f.tier, f.tierColor, 0.3, now);
    p.ctx.globalAlpha = f.owned ? 1 : 0.35;
    p.ctx.drawImage(faceImage(f), bx, by);
    p.ctx.globalAlpha = 1;
  }
  const done = v.done(v.sel);
  p.center(p.fit(f.name, L.w - 12), L.x, L.w, by + BH + 3, SC.txt);
  p.center(`티어 ${f.tier}${done ? '' : ` · 보유 ${f.count}/${v.merge}`}`, L.x, L.w, by + BH + 15, SC.key);
  p.button('buy', String(f.craft), L.x + 6, L.y + L.h - 18, L.w - 12, { kind: 'btn', b: 'buy' }, { off: done || v.dust < f.craft, ico: 'dust' });
  v.rows.forEach((r, i) => {
    const y = M.y + 6 + i * 57;
    if (r.color) p.R(M.x + 10, y + 3, 3, 5, r.color);
    p.text(r.name, M.x + (r.color ? 16 : 10), y, SC.key);
    r.ids.forEach((id, j) => {
      const cx = M.x + 12 + j * 36, cy = y + 11, c = v.info(id), price = String(c.craft);
      smallCard(p, c, cx, cy, { sel: id === v.sel, hov: id === v.hover });
      p.tiny(price, cx + CW - price.length * 4 + 1, cy + CH + 3, v.done(id) ? SC.off : SC.sky);
      p.hit(cx, cy, CW, CH, { kind: 'card', id });
    });
  });
  p.center('조각으로 1장', M.x, M.w, M.y + M.h - 14, SC.off);
}
