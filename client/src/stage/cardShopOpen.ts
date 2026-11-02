// 카드팩 열기 연출 (island.md 5장 팩 열기 연출, 승인 데모 docs/refs/demos/card_shop.html): 떨어짐 → 클릭·Enter → 흔들림 → 찢김 → 뒷면 4장 펼침 →
// 마우스·←→로 고르면 뒷면이 티어 색으로 빛남 → 한 장씩(클릭·Enter) 또는 모두(A) 뒤집기 (티어 1 먼지 · 2 섬광 · 3 멈춤·빛기둥·흔들림·이름 크게, NEW) →
// 끝(한 팩 더·확인). 3장이 모이는 카드(서버 merged)는 뒤집힐 때 금빛 + card_merge + "강화!".
// 이미 강화한 카드(서버 ground > 0)는 아래 "조각 +n"만 보이다가 확인·한 팩 더를 누르면 금이 가며 흔들리다 부서지고, 덩어리가 위 조각 숫자로 빨려 감 → closed.
// 결과(카드·NEW·강화·갈림)는 서버 pack 메시지 (보관·조각은 서버가 이미 반영, 여기는 연출만). music = 지금 곡 단계 (1 잔잔 · 2 티어 2 빛 · 3 티어 3 빛 · 0 바탕으로, cardShop이 BGM 층으로). 효과음 audio.md 3장
import { CARD, receiveCards, type Collection } from '@game/shared';
import { sfx } from '../audio/player';
import { MAT, type ShopHit } from '../ui/cardShopScreen';
import type { CardInfo } from '../ui/cardTypes';
import { BH, BW, drawFlip, glow, packArt, packTop } from '../ui/shopCards';
import type { ShopFx } from '../ui/shopFx';
import { Pix, SC } from '../ui/shopPix';

/** grind = 확인 뒤 갈리는 연출, closed = 끝 (cardShop이 after대로 닫거나 한 팩 더) */
type Stage = 'drop' | 'ready' | 'shake' | 'tear' | 'fan' | 'backs' | 'done' | 'grind' | 'closed';
interface Flip { s: 'back' | 'pre' | 'flipping' | 'face'; t0: number; gA: number; queue: number }

/** 연출 시간 (초): 티어 3 뒤집기 전 멈춤, 뒤집기, 갈기 금 가는 시간(그 뒤 부서짐), 부서진 뒤 기다림 */
const PRE3 = 0.7, FLIP = 0.22, CRACK = 0.3, AFTER_GRIND = 0.75;
/** 갈린 조각이 빨려 가는 곳 (위 띠 조각 숫자 근처, cardShopScreen titleBand) */
const DUST_TO = { x: 360, y: 13 };
/** 금 (카드 왼쪽 위 기준 점들, 큰 카드 48×68): 위에서 아래로 갈라짐 + 옆 가지 */
const CRACKS: readonly (readonly [number, number])[][] = [
  [[25, 0], [22, 9], [27, 18], [21, 29], [26, 40], [22, 52], [25, 68]],
  [[22, 9], [12, 14], [6, 22]],
  [[26, 40], [36, 45], [43, 55]],
];
const M = MAT, CX = M.x + M.w / 2, SLOT_Y = M.y + 44;
const slotX = (i: number) => M.x + Math.floor((M.w - (4 * BW + 3 * 12)) / 2) + i * (BW + 12);
const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

export class PackOpening {
  stage: Stage;
  t0: number;
  cards: { id: string; tier: number; isNew: boolean; merged: boolean; ground: number }[] = [];
  /** 지금 곡 단계 (CD-6) */
  music = 1;
  hov = -1;
  /** 확인·한 팩 더 중 누른 것 (closed가 되면 cardShop이 처리) */
  after: 'ok' | 'again' | null = null;
  private flips: Flip[] = [];
  /** 카드마다 이 장까지 받은 뒤 보관 장수 (보유 n/3) */
  private have: number[] = [];
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
    const ids = cards.map((c) => c.id);
    this.have = ids.map((id, i) => receiveCards(this.before, ids.slice(0, i + 1)).cards[id]?.count ?? 0);
  }

  get ready(): boolean { return this.cards.length > 0; }

  /** 확인·한 팩 더: 갈릴 카드가 있으면 갈리는 연출 뒤, 없으면 바로 closed */
  confirm(next: 'ok' | 'again', now: number): void {
    if (this.stage !== 'done') return;
    this.after = next;
    this.stage = this.cards.some((c) => c.ground) ? 'grind' : 'closed';
    this.t0 = now;
  }

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
    else if (this.stage === 'grind') this.updateGrind(T, now, fx, info);
  }

  /** 확인 뒤: 금 가는 CRACK초 → 갈릴 카드가 한꺼번에 부서져 조각 숫자로 → closed */
  private updateGrind(T: number, now: number, fx: ShopFx, info: (id: string) => CardInfo): void {
    if (T > CRACK && !this.heard.has('grind')) {
      this.heard.add('grind');
      sfx.play('card_grind');
      this.cards.forEach((c, i) => {
        if (!c.ground) return;
        const x = slotX(i), ci = info(c.id);
        fx.shards(x, SLOT_Y, BW, BH, 26, [ci.color, ci.tierColor, SC.card, SC.sky], DUST_TO.x, DUST_TO.y);
        fx.burst(x + BW / 2, SLOT_Y + BH / 2, 8, SC.dust, 0.7);
      });
    }
    if (T > CRACK + AFTER_GRIND) { this.stage = 'closed'; this.t0 = now; }
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
        if (c.merged) { sfx.play('card_merge'); fx.burst(x + BW / 2, SLOT_Y + BH / 2, 22, SC.coin, 1.3, 0.3); }
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
    else if (this.stage === 'done' || this.stage === 'grind' || this.stage === 'closed') this.drawCards(p, now, info);
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
    const ctx = p.ctx, grind = this.stage === 'grind' || this.stage === 'closed';
    this.cards.forEach((c, i) => {
      const f = this.flips[i]!, x = slotX(i), cx = x + BW / 2, y = SLOT_Y, ci = info(c.id), tc = ci.tierColor;
      ctx.globalAlpha = dim ? 0.25 : 1;
      if (f.s === 'back' || f.s === 'pre') {
        const tr = f.s === 'pre' ? Math.round(Math.sin(now * 60) * ((now - f.t0) / PRE3) * 1.5) : 0;
        if (!dim) glow(p, x + tr, y, BW, BH, c.tier, tc, Math.min(1, f.gA), now);
        if (f.s === 'pre') { p.R(M.x + 2, M.y + 2, M.w - 4, M.h - 4, SC.shade, 0.35 * (now - f.t0) / PRE3); glow(p, x, y, BW, BH, 3, tc, 1.2, now); }
        ctx.globalAlpha = dim ? 0.25 : 1;
        drawFlip(p, cx + tr, y - (i === this.hov ? 2 : 0), 0, ci, this.packColor);
      } else if (f.s === 'flipping') drawFlip(p, cx, y, Math.min(1, (now - f.t0) / FLIP), ci, this.packColor);
      else if (c.ground && grind) this.drawGround(p, this.stage === 'grind' ? now - this.t0 : 9, x, y, c.ground, ci);
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
        // 아래 글자: 이 장으로 강화 = 금색 "강화!", 갈릴 카드 = "조각 +n" (확인 때 갈림), 아니면 보유 n/3
        const lab = c.merged ? '강화!' : c.ground ? `조각 +${c.ground}` : `보유 ${this.have[i] ?? 0}/${CARD.mergeCount}`;
        p.center(lab, x - 4, BW + 8, y + BH + 4, c.merged ? SC.coin : c.ground ? SC.off : SC.key, 'koSmall', dim ? 0.25 : 1);
      }
      ctx.globalAlpha = 1;
      if (this.stage === 'backs' && f.s === 'back') p.hit(x, y, BW, BH, { kind: 'flip', i });
      if (this.stage === 'backs' && i === this.sel && this.keyed && f.s === 'back') p.corners(x, y, BW, BH, SC.coin);
    });
  }

  /** 갈리는 카드 (e = 확인을 누른 뒤 초): 금이 번지며 흔들림 → CRACK초에 부서진 뒤 빈 칸 테두리 + "조각 +n" (덩어리는 ShopFx.shards) */
  private drawGround(p: Pix<ShopHit>, e: number, x: number, y: number, dust: number, ci: CardInfo): void {
    if (e < CRACK) {
      const k = e / CRACK, dx = Math.round(Math.sin(e * 80) * k * 1.5);
      drawFlip(p, x + BW / 2 + dx, y, 1, ci, this.packColor);
      for (const line of CRACKS) {
        for (let j = 1; j < line.length; j++) {
          const [ax, ay] = line[j - 1]!, [bx, by] = line[j]!, n = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
          for (let s = 0; s <= n; s++) {
            const py = ay + ((by - ay) * s) / n;
            if (py > k * BH) continue;
            p.R(x + dx + Math.round(ax + ((bx - ax) * s) / n), y + Math.round(py), 1, 1, SC.outline);
          }
        }
      }
      p.R(x + dx, y, BW, BH, SC.flash, Math.max(0, k - 0.6) * 1.5);
      return;
    }
    const a = Math.min(1, (e - CRACK) / 0.3);
    p.R(x, y, BW, 1, SC.cardBd, a * 0.6); p.R(x, y + BH - 1, BW, 1, SC.cardBd, a * 0.6);
    p.R(x, y, 1, BH, SC.cardBd, a * 0.6); p.R(x + BW - 1, y, 1, BH, SC.cardBd, a * 0.6);
    const rise = Math.round(Math.min(1, (e - CRACK) / 0.5) * 8);
    p.center(`+${dust}`, x, BW, y + BH / 2 - 4 - rise, SC.sky, 'koSmall', a);
    p.center(`조각 +${dust}`, x - 4, BW + 8, y + BH + 4, SC.sky, 'koSmall', a);
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
