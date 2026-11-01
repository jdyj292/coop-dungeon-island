// 카드팩 열기 연출 (island.md 5장 팩 열기 연출, 승인 데모 docs/refs/demos/card_shop.html): 떨어짐 → 클릭·Enter → 흔들림 → 찢김 → 뒷면 4장 펼침 →
// 마우스·←→로 고르면 뒷면이 티어 색으로 빛남 → 한 장씩(클릭·Enter) 또는 모두(A) 뒤집기 (티어 1 먼지 · 2 섬광 · 3 멈춤·빛기둥·흔들림·이름 크게, NEW) →
// 3장이 된 카드는 합치기(세 장이 모여 녹음 → 금테) → 변형 고르기 → 끝(한 팩 더·확인). 지정 구매로 3장이 되면 합치기부터 (mergeOnly).
// 결과(카드·NEW·강화)는 서버 pack 메시지. music = 지금 곡 단계 (1 잔잔 · 2 티어 2 빛 · 3 티어 3 빛 · 0 원래 곡으로, CD-6 소리가 씀)
import { CARD, isActiveCard, SKILLS, type Collection } from '@game/shared';
import { MAT, variantPanel, type ShopHit } from '../ui/cardShopScreen';
import type { CardInfo } from '../ui/cardTypes';
import { BH, BW, drawFlip, faceImage, glow, packArt, packTop } from '../ui/shopCards';
import type { ShopFx } from '../ui/shopFx';
import { Pix, SC } from '../ui/shopPix';

type Stage = 'drop' | 'ready' | 'shake' | 'tear' | 'fan' | 'backs' | 'merge' | 'variant' | 'done';
interface Flip { s: 'back' | 'pre' | 'flipping' | 'face'; t0: number; gA: number; queue: number }

/** 연출 시간 (초): 티어 3 뒤집기 전 멈춤, 뒤집기 */
const PRE3 = 0.7, FLIP = 0.22;
const M = MAT, CX = M.x + M.w / 2, SLOT_Y = M.y + 44;
const slotX = (i: number) => M.x + Math.floor((M.w - (4 * BW + 3 * 12)) / 2) + i * (BW + 12);
const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

export class PackOpening {
  stage: Stage;
  t0: number;
  cards: { id: string; tier: number; isNew: boolean }[] = [];
  merged: string[] = [];
  /** 지금 곡 단계 (CD-6) */
  music = 1;
  /** 지정 구매 합치기가 끝남 (상점이 닫음) */
  finished = false;
  hov = -1;
  private flips: Flip[] = [];
  private sel = 0;
  private keyed = false;
  /** 지금 합치기 차례 (merged 번호) */
  private mi = 0;
  private wantOpen = false;
  private boom = false;
  private lastFace = 0;
  private banner: { id: string; t0: number } | null = null;

  constructor(readonly pack: number, readonly pay: 'gift' | 'coin' | 'dust', readonly packColor: string, now: number, private before: Collection, readonly fromBuy = false) {
    this.stage = fromBuy ? 'merge' : 'drop';
    this.t0 = now;
  }

  /** 지정 구매로 강화됨: 합치기 연출만 */
  static mergeOnly(id: string, now: number): PackOpening {
    const o = new PackOpening(0, 'dust', SC.cardBd, now + 0.4, {}, true);
    o.merged = [id];
    return o;
  }

  /** 서버 pack 결과 */
  setResult(cards: PackOpening['cards'], merged: string[]): void {
    this.cards = cards;
    this.merged = merged;
    this.flips = cards.map(() => ({ s: 'back', t0: 0, gA: 0, queue: 0 }));
  }

  get ready(): boolean { return this.cards.length > 0; }
  /** 변형을 고르는 카드 */
  get variantCard(): string | null { return this.stage === 'variant' ? this.merged[this.mi] ?? null : null; }

  private open(now: number): void {
    if (!this.ready) return void (this.wantOpen = true);
    this.stage = 'shake';
    this.t0 = now;
  }

  private flip(i: number, now: number): void {
    const f = this.flips[i];
    if (!f || f.s !== 'back') return;
    f.s = this.cards[i]!.tier >= 3 ? 'pre' : 'flipping';
    f.t0 = now;
  }

  private flipAll(now: number): void {
    let d = 0;
    this.flips.forEach((f, i) => {
      if (f.s !== 'back' || f.queue) return;
      f.queue = now + d;
      d += this.cards[i]!.tier >= 3 ? PRE3 + 0.5 : 0.28;
    });
  }

  /** 변형을 골랐거나 넘김 → 다음 합치기 또는 끝. 다 끝났으면 true (지정 구매는 닫음) */
  nextMerge(now: number): boolean {
    this.mi++;
    this.t0 = now;
    this.boom = false;
    if (this.mi < this.merged.length) this.stage = 'merge';
    else if (this.fromBuy) return (this.finished = true);
    else this.stage = 'done';
    return false;
  }

  update(now: number, dt: number, fx: ShopFx, info: (id: string) => CardInfo): void {
    const T = now - this.t0;
    if (this.stage === 'drop' && T > 0.55) { this.stage = 'ready'; this.t0 = now; }
    else if (this.stage === 'ready' && this.wantOpen && this.ready) { this.wantOpen = false; this.open(now); }
    else if (this.stage === 'shake' && T > 0.6) {
      this.stage = 'tear'; this.t0 = now;
      fx.burst(CX, M.y + 44, 16, this.packColor, 1.4, 0.6); fx.burst(CX, M.y + 44, 8, 'island.paper', 1.2, 0.8);
    } else if (this.stage === 'tear' && T > 0.3) { this.stage = 'fan'; this.t0 = now; }
    else if (this.stage === 'fan' && T > 0.7) { this.stage = 'backs'; this.t0 = now; }
    if (this.stage === 'backs') this.updateBacks(now, dt, fx, info);
    else if (this.stage === 'merge' && T >= 0) {
      if (T > 0.75 && !this.boom) { this.boom = true; fx.burst(CX, SLOT_Y + BH / 2, 30, SC.coin, 1.6, 0.3); fx.burst(CX, SLOT_Y + BH / 2, 12, SC.flash, 1); }
      if (T > 0.9 && Math.random() < 0.4) fx.rise(CX - BW / 2, SLOT_Y + BH, BW, SC.coin);
      if (T > 2) {
        const id = this.merged[this.mi]!;
        if (isActiveCard(id) && Object.keys(SKILLS[id]?.variants ?? {}).length) { this.stage = 'variant'; this.t0 = now; }
        else this.nextMerge(now);
      }
    }
  }

  private updateBacks(now: number, dt: number, fx: ShopFx, info: (id: string) => CardInfo): void {
    this.flips.forEach((f, i) => {
      const c = this.cards[i]!, x = slotX(i), tc = info(c.id).tierColor;
      if (f.queue && now >= f.queue && f.s === 'back') { f.queue = 0; this.flip(i, now); }
      const want = f.s === 'back' && (i === this.hov || (i === this.sel && this.keyed)) ? 1 : f.s === 'pre' ? 1.4 : 0;
      f.gA += (want - f.gA) * Math.min(1, dt * 10);
      if (f.s === 'back' && f.gA > 0.5) this.music = Math.max(this.music, c.tier);
      if (f.s === 'pre') {
        if (Math.random() < 0.5) fx.rise(x, SLOT_Y + BH, BW, tc);
        if (now - f.t0 > PRE3) { f.s = 'flipping'; f.t0 = now; }
      } else if (f.s === 'flipping' && now - f.t0 > FLIP) {
        f.s = 'face'; f.t0 = now; this.lastFace = now;
        if (c.tier <= 1) fx.burst(x + BW / 2, SLOT_Y + BH - 4, 6, SC.dust, 0.6);
        else if (c.tier === 2) fx.burst(x + BW / 2, SLOT_Y + BH / 2, 16, tc, 1.2);
        else { fx.burst(x + BW / 2, SLOT_Y + BH / 2, 34, tc, 1.8, 0.4); fx.shake = 0.35; this.banner = { id: c.id, t0: now }; this.music = 3; }
      }
    });
    const bannerOn = !!this.banner && now - this.banner.t0 < 1.6;
    if (this.flips.every((f) => f.s === 'face') && !bannerOn && now - this.lastFace > 0.6) {
      this.t0 = now; this.mi = 0; this.music = 0;
      this.stage = this.merged.length ? 'merge' : 'done';
    }
  }

  // ---- 입력 ----
  onHit(h: ShopHit | null, now: number): void {
    if (h?.kind === 'packbody' && this.stage === 'ready') this.open(now);
    else if (h?.kind === 'flip') this.flip(h.i, now);
    else if (h?.kind === 'btn' && h.b === 'all') this.flipAll(now);
  }

  /** 키. 처리했으면 true */
  onKey(code: string, now: number): boolean {
    const enter = code === 'Enter' || code === 'Space';
    if (this.stage === 'ready' && enter) this.open(now);
    else if (this.stage === 'backs') {
      if (code === 'ArrowLeft' || code === 'ArrowRight') { this.keyed = true; this.hov = -1; this.sel = (this.sel + (code === 'ArrowLeft' ? 3 : 1)) % 4; }
      else if (enter) {
        const i = this.keyed && this.flips[this.sel]?.s === 'back' ? this.sel : this.flips.findIndex((f) => f.s === 'back');
        if (i >= 0) { this.flip(i, now); this.sel = i; }
      } else if (code === 'KeyA') this.flipAll(now);
      else return false;
    } else return false;
    return true;
  }

  // ---- 그리기 ----
  draw(p: Pix<ShopHit>, now: number, info: (id: string) => CardInfo, side: () => void): void {
    if (this.fromBuy) { if (now >= this.t0) this.drawMerge(p, now, info); return; }
    side();
    const ctx = p.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.rect(M.x + 2, M.y + 2, M.w - 4, M.h - 4);
    ctx.clip();
    if (this.stage === 'backs') { this.drawCards(p, now, info, false); this.drawBanner(p, now, info); }
    else if (this.stage === 'merge' || this.stage === 'variant') this.drawMerge(p, now, info);
    else if (this.stage === 'done') this.drawCards(p, now, info, false);
    else this.drawPack(p, now);
    ctx.restore();
    if (this.stage === 'backs' && this.flips.some((f) => f.s === 'back')) p.button('all', '모두 뒤집기 (A)', CX - 50, M.y + M.h - 22, 100, { kind: 'btn', b: 'all' });
  }

  private drawPack(p: Pix<ShopHit>, now: number): void {
    const T = now - this.t0, pw = 34, ph = 52, pc = this.packColor, n = this.pack;
    if (this.stage === 'drop') {
      const k = Math.min(1, T / 0.4), y = -60 + (M.y + 20 + 60) * k * k, sq = T > 0.4 && T < 0.55 ? 1 : 0;
      p.R(CX - 18, M.y + 82, 36, 3, SC.shade);
      packArt(p, CX - pw / 2 - sq, y + sq * 2, pw + sq * 2, ph - sq * 2, n, pc);
    } else if (this.stage === 'ready') {
      const b = Math.round(Math.sin(now * 3) * 1.5);
      p.R(CX - 18, M.y + 82, 36, 3, SC.shade);
      packArt(p, CX - pw / 2, M.y + 20 + b, pw, ph, n, pc);
      p.corners(CX - pw / 2, M.y + 20 + b, pw, ph, SC.coin, 0.5 + 0.5 * Math.sin(now * 5));
      p.center(this.wantOpen ? '…' : '클릭 · Enter: 팩 열기', M.x, M.w, M.y + 96, SC.txt);
      p.hit(CX - pw / 2, M.y + 20, pw, ph, { kind: 'packbody' });
    } else if (this.stage === 'shake') {
      const a = 1 + T * 6, dx = Math.round(Math.sin(T * 70) * a), dy = Math.round(Math.abs(Math.sin(T * 35)) * -a / 2);
      p.R(CX - 18, M.y + 82, 36, 3, SC.shade);
      packArt(p, CX - pw / 2 + dx, M.y + 20 + dy, pw, ph, n, pc);
      p.R(CX - pw / 2 + dx, M.y + 20 + dy, pw, ph, SC.flash, (T / 0.6) * 0.6);
    } else if (this.stage === 'tear') {
      const k = T / 0.3;
      packArt(p, CX - pw / 2, M.y + 20, pw, ph, n, pc, { torn: true });
      packTop(p, CX - pw / 2 + k * 30, M.y + 20 - k * 24, pw, ph, pc, 1 - k);
      p.R(M.x + 2, M.y + 2, M.w - 4, M.h - 4, SC.flash, (1 - k) * 0.8);
    } else if (this.stage === 'fan') {
      packArt(p, CX - pw / 2, M.y + 20 + T * 60, pw, ph, n, pc, { torn: true, alpha: Math.max(0, 1 - T * 2.5) });
      this.cards.forEach((_c, i) => {
        const k = ease((T - i * 0.08) / 0.45);
        drawFlip(p, CX + (slotX(i) + BW / 2 - CX) * k, M.y + 30 + (SLOT_Y - M.y - 30) * k, 0, null, pc, false);
      });
    }
  }

  /** 펼친 4장 (dim = 합치기 뒤 배경) */
  private drawCards(p: Pix<ShopHit>, now: number, info: (id: string) => CardInfo, dim: boolean): void {
    const ctx = p.ctx, seen = new Map<string, number>();
    this.cards.forEach((c, i) => {
      const f = this.flips[i]!, x = slotX(i), cx = x + BW / 2, y = SLOT_Y, ci = info(c.id), tc = ci.tierColor;
      const k = (seen.get(c.id) ?? 0) + 1;
      seen.set(c.id, k);
      ctx.globalAlpha = dim ? 0.25 : 1;
      if (f.s === 'back' || f.s === 'pre') {
        const tr = f.s === 'pre' ? Math.round(Math.sin(now * 60) * ((now - f.t0) / PRE3) * 1.5) : 0;
        if (!dim) glow(p, x + tr, y, BW, BH, c.tier, tc, Math.min(1, f.gA), now);
        if (f.s === 'pre') { p.R(M.x + 2, M.y + 2, M.w - 4, M.h - 4, SC.shade, 0.35 * (now - f.t0) / PRE3); glow(p, x, y, BW, BH, 3, tc, 1.2, now); }
        ctx.globalAlpha = dim ? 0.25 : 1;
        drawFlip(p, cx + tr, y - (i === this.hov ? 2 : 0), 0, ci, this.packColor, false);
      } else if (f.s === 'flipping') drawFlip(p, cx, y, Math.min(1, (now - f.t0) / FLIP), ci, this.packColor, false);
      else {
        const e = now - f.t0, merged = this.merged.includes(c.id) && this.stage !== 'backs';
        if (c.tier >= 3 && e < 0.9 && !dim) {
          const pw = Math.round(6 + 20 * Math.min(1, e / 0.2)), a = 1 - Math.max(0, (e - 0.3) / 0.6);
          p.R(cx - pw / 2, M.y + 2, pw, M.h - 4, tc, a * 0.55);
          p.R(cx - 1, M.y + 2, 2, M.h - 4, SC.flash, a);
        }
        if (c.tier >= 2 && !dim) glow(p, x, y, BW, BH, c.tier, tc, 0.35, now);
        ctx.globalAlpha = dim ? 0.25 : 1;
        drawFlip(p, cx, y, 1, ci, this.packColor, merged);
        if (c.tier >= 2 && e < 0.18 && !dim) p.R(x, y, BW, BH, SC.flash, 1 - e / 0.18);
        if (c.isNew) { p.R(x + BW - 19, y - 5, 20, 9, SC.outline); p.R(x + BW - 18, y - 4, 18, 7, SC.coin); p.tiny('NEW', x + BW - 17, y - 3, SC.title); }
        const b = this.before[c.id], lab = merged ? '강화!' : this.stage === 'backs'
          ? (b?.enhanced ? '강화됨 +1' : `보유 ${Math.min(CARD.mergeCount, (b?.count ?? 0) + k)}/${CARD.mergeCount}`)
          : (ci.enhanced ? '강화됨 +1' : `보유 ${ci.count}/${CARD.mergeCount}`);
        p.center(lab, x - 4, BW + 8, y + BH + 4, merged ? SC.coin : SC.key, 'koSmall', dim ? 0.25 : 1);
      }
      ctx.globalAlpha = 1;
      if (this.stage === 'backs' && f.s === 'back') p.hit(x, y, BW, BH, { kind: 'flip', i });
      if (this.stage === 'backs' && i === this.sel && this.keyed && f.s === 'back') p.corners(x, y, BW, BH, SC.coin);
    });
  }

  private drawBanner(p: Pix<ShopHit>, now: number, info: (id: string) => CardInfo): void {
    const b = this.banner;
    if (!b || now - b.t0 > 1.6) return;
    const e = now - b.t0, a = e < 0.15 ? e / 0.15 : e > 1.3 ? (1.6 - e) / 0.3 : 1, ci = info(b.id), y = SLOT_Y + BH + 12;
    p.R(M.x + 2, y, M.w - 4, 30, SC.shade, a * 0.85);
    p.R(M.x + 2, y, M.w - 4, 1, ci.tierColor, a); p.R(M.x + 2, y + 29, M.w - 4, 1, ci.tierColor, a);
    const tw = p.width(ci.name, 'ko') * 2, tx = M.x + Math.floor((M.w - tw) / 2);
    p.text(ci.name, tx + 1, y + 3, SC.outline, 'ko', a, 2);
    p.text(ci.name, tx, y + 2, ci.tierColor, 'ko', a, 2);
    p.star(tx - 14, y + 12, ci.tierColor, a); p.star(tx + tw + 12, y + 12, ci.tierColor, a);
  }

  private drawMerge(p: Pix<ShopHit>, now: number, info: (id: string) => CardInfo): void {
    const id = this.merged[this.mi]!, ci = info(id), T = now - this.t0, y = SLOT_Y;
    if (!this.fromBuy) this.drawCards(p, now, info, true);
    p.R(M.x + 2, M.y + 2, M.w - 4, M.h - 4, SC.shade, this.stage === 'variant' ? 0.7 : 0.6);
    if (this.stage === 'variant') return variantPanel(p, id, ci);
    p.center('3장 합치기', M.x, M.w, M.y + 12, SC.coin, 'ko');
    if (T < 0.75) {
      const k = ease(T / 0.7);
      [-62, 0, 62].forEach((d, j) => {
        const x = CX + d * (1 - k) + (j - 1) * 2 * (1 - k);
        glow(p, x - BW / 2, y, BW, BH, 3, SC.coin, k * 0.8, now);
        drawFlip(p, x, y + (j === 1 ? 0 : 2) * (1 - k), 1, ci, this.packColor, false);
      });
      p.R(CX - BW / 2 - 2, y - 2, BW + 4, BH + 4, SC.flash, Math.max(0, (T - 0.45) / 0.3));
      return;
    }
    const e = T - 0.75, sc = e < 0.15 ? 1.25 - (e / 0.15) * 0.25 : 1, w = Math.round(BW * sc), h = Math.round(BH * sc);
    glow(p, CX - BW / 2, y, BW, BH, 3, SC.coin, 0.9, now);
    p.R(CX - w / 2 + 1, y + BH / 2 - h / 2 + 2, w, h, SC.shade);
    p.ctx.drawImage(faceImage(ci, true), Math.round(CX - w / 2), Math.round(y + BH / 2 - h / 2), w, h);
    if (e < 0.12) p.R(M.x + 2, M.y + 2, M.w - 4, M.h - 4, SC.flash, 1 - e / 0.12);
    if (e > 0.2) {
      p.center('강화!', M.x, M.w, y + BH + 6, SC.coin, 'ko');
      p.center(ci.name + (ci.active ? ` · 위력 ×${CARD.enhancedMul}` : ' · 효과 강화 · 비용 +1'), M.x, M.w, y + BH + 20, SC.txt);
    }
  }

}
