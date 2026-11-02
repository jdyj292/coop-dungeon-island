// 카드팩 열기 연출 (island.md 5장 팩 열기 연출, 승인 데모 docs/refs/demos/card_shop.html): 떨어짐 → 클릭·Enter → 흔들림 → 찢김 → 뒷면 4장 펼침 →
// 마우스·←→로 고르면 뒷면이 티어 색으로 빛남 → 한 장씩(클릭·Enter) 또는 모두(A) 뒤집기 (티어 1 먼지 · 2 섬광 · 3 멈춤·빛기둥·흔들림·이름 크게, NEW) →
// 끝(한 팩 더·확인). 3장이 모여도 저절로 강화하지 않음 ("강화 가능" 표시, 강화는 카드 창에서 직접).
// 결과(카드·NEW)는 서버 pack 메시지. music = 지금 곡 단계 (1 잔잔 · 2 티어 2 빛 · 3 티어 3 빛 · 0 바탕으로, cardShop이 BGM 층으로). 효과음 audio.md 3장
import { CARD, type Collection } from '@game/shared';
import { sfx } from '../audio/player';
import { MAT, type ShopHit } from '../ui/cardShopScreen';
import type { CardInfo } from '../ui/cardTypes';
import { BH, BW, drawFlip, glow, packArt, packTop } from '../ui/shopCards';
import type { ShopFx } from '../ui/shopFx';
import { Pix, SC } from '../ui/shopPix';

type Stage = 'drop' | 'ready' | 'shake' | 'tear' | 'fan' | 'backs' | 'done';
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
  /** 지금 곡 단계 (CD-6) */
  music = 1;
  hov = -1;
  private flips: Flip[] = [];
  private sel = 0;
  private keyed = false;
  private wantOpen = false;
  private lastFace = 0;
  private banner: { id: string; t0: number } | null = null;
  /** 한 번만 낼 소리 (카드별 빛 g0~3) */
  private heard = new Set<string>();

  constructor(readonly pack: number, readonly pay: 'gift' | 'coin' | 'dust', readonly packColor: string, now: number, private before: Collection) {
    this.stage = 'drop';
    this.t0 = now;
  }

  /** 서버 pack 결과 */
  setResult(cards: PackOpening['cards']): void {
    this.cards = cards;
    this.flips = cards.map(() => ({ s: 'back', t0: 0, gA: 0, queue: 0 }));
  }

  get ready(): boolean { return this.cards.length > 0; }

  private open(now: number): void {
    if (!this.ready) return void (this.wantOpen = true);
    this.stage = 'shake';
    this.t0 = now;
    sfx.play('card_shake');
  }

  private flip(i: number, now: number): void {
    const f = this.flips[i];
    if (!f || f.s !== 'back') return;
    f.s = this.cards[i]!.tier >= 3 ? 'pre' : 'flipping';
    f.t0 = now;
    sfx.play(f.s === 'pre' ? 'card_glow3' : 'card_flip');
  }

  private flipAll(now: number): void {
    let d = 0;
    this.flips.forEach((f, i) => {
      if (f.s !== 'back' || f.queue) return;
      f.queue = now + d;
      d += this.cards[i]!.tier >= 3 ? PRE3 + 0.5 : 0.28;
    });
  }

  update(now: number, dt: number, fx: ShopFx, info: (id: string) => CardInfo): void {
    const T = now - this.t0;
    if (this.stage === 'drop' && T > 0.55) { this.stage = 'ready'; this.t0 = now; }
    else if (this.stage === 'ready' && this.wantOpen && this.ready) { this.wantOpen = false; this.open(now); }
    else if (this.stage === 'shake' && T > 0.6) {
      this.stage = 'tear'; this.t0 = now; sfx.play('card_tear');
      fx.burst(CX, M.y + 44, 16, this.packColor, 1.4, 0.6); fx.burst(CX, M.y + 44, 8, 'island.paper', 1.2, 0.8);
    } else if (this.stage === 'tear' && T > 0.3) { this.stage = 'fan'; this.t0 = now; }
    else if (this.stage === 'fan' && T > 0.7) { this.stage = 'backs'; this.t0 = now; }
    if (this.stage === 'backs') this.updateBacks(now, dt, fx, info);
  }

  private updateBacks(now: number, dt: number, fx: ShopFx, info: (id: string) => CardInfo): void {
    this.flips.forEach((f, i) => {
      const c = this.cards[i]!, x = slotX(i), tc = info(c.id).tierColor;
      if (f.queue && now >= f.queue && f.s === 'back') { f.queue = 0; this.flip(i, now); }
      const want = f.s === 'back' && (i === this.hov || (i === this.sel && this.keyed)) ? 1 : f.s === 'pre' ? 1.4 : 0;
      f.gA += (want - f.gA) * Math.min(1, dt * 10);
      if (f.s === 'back' && f.gA > 0.5) {
        this.music = Math.max(this.music, c.tier);
        if (c.tier >= 2 && !this.heard.has(`g${i}`)) { this.heard.add(`g${i}`); sfx.play(`card_glow${Math.min(3, c.tier)}`); }
      }
      if (f.s === 'pre') {
        if (Math.random() < 0.5) fx.rise(x, SLOT_Y + BH, BW, tc);
        if (now - f.t0 > PRE3) { f.s = 'flipping'; f.t0 = now; sfx.play('card_flip'); }
      } else if (f.s === 'flipping' && now - f.t0 > FLIP) {
        f.s = 'face'; f.t0 = now; this.lastFace = now;
        if (c.tier >= 2) sfx.play(c.tier >= 3 ? 'card_reveal3' : 'card_reveal2');
        if (c.tier <= 1) fx.burst(x + BW / 2, SLOT_Y + BH - 4, 6, SC.dust, 0.6);
        else if (c.tier === 2) fx.burst(x + BW / 2, SLOT_Y + BH / 2, 16, tc, 1.2);
        else { fx.burst(x + BW / 2, SLOT_Y + BH / 2, 34, tc, 1.8, 0.4); fx.shake = 0.35; this.banner = { id: c.id, t0: now }; this.music = 3; }
      }
    });
    const bannerOn = !!this.banner && now - this.banner.t0 < 1.6;
    if (this.flips.every((f) => f.s === 'face') && !bannerOn && now - this.lastFace > 0.6) {
      this.t0 = now; this.music = 0;
      this.stage = 'done';
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
    side();
    const ctx = p.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.rect(M.x + 2, M.y + 2, M.w - 4, M.h - 4);
    ctx.clip();
    if (this.stage === 'backs') { this.drawCards(p, now, info); this.drawBanner(p, now, info); }
    else if (this.stage === 'done') this.drawCards(p, now, info);
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
        drawFlip(p, CX + (slotX(i) + BW / 2 - CX) * k, M.y + 30 + (SLOT_Y - M.y - 30) * k, 0, null, pc);
      });
    }
  }

  /** 펼친 4장 */
  private drawCards(p: Pix<ShopHit>, now: number, info: (id: string) => CardInfo): void {
    const dim = false;
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
        drawFlip(p, cx + tr, y - (i === this.hov ? 2 : 0), 0, ci, this.packColor);
      } else if (f.s === 'flipping') drawFlip(p, cx, y, Math.min(1, (now - f.t0) / FLIP), ci, this.packColor);
      else {
        const e = now - f.t0;
        if (c.tier >= 3 && e < 0.9 && !dim) {
          const pw = Math.round(6 + 20 * Math.min(1, e / 0.2)), a = 1 - Math.max(0, (e - 0.3) / 0.6);
          p.R(cx - pw / 2, M.y + 2, pw, M.h - 4, tc, a * 0.55);
          p.R(cx - 1, M.y + 2, 2, M.h - 4, SC.flash, a);
        }
        if (c.tier >= 2 && !dim) glow(p, x, y, BW, BH, c.tier, tc, 0.35, now);
        ctx.globalAlpha = dim ? 0.25 : 1;
        drawFlip(p, cx, y, 1, ci, this.packColor);
        if (c.tier >= 2 && e < 0.18 && !dim) p.R(x, y, BW, BH, SC.flash, 1 - e / 0.18);
        if (c.isNew) { p.R(x + BW - 19, y - 5, 20, 9, SC.outline); p.R(x + BW - 18, y - 4, 18, 7, SC.coin); p.tiny('NEW', x + BW - 17, y - 3, SC.title); }
        // 3장이 모여도 저절로 강화하지 않음: "강화 가능" (강화는 카드 창에서)
        const b = this.before[c.id], have = this.stage === 'backs' ? (b?.count ?? 0) + k : ci.count, enh = this.stage === 'backs' ? !!b?.enhanced : ci.enhanced;
        const ready = !enh && have >= CARD.mergeCount;
        const lab = enh ? '보관 +1' : ready ? '강화 가능' : `보유 ${have}/${CARD.mergeCount}`;
        p.center(lab, x - 4, BW + 8, y + BH + 4, ready ? SC.coin : SC.key, 'koSmall', dim ? 0.25 : 1);
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
}
