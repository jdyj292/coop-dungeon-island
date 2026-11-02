// 카드 창 (K) 그리기 (hud.md 8장, 승인 데모 docs/refs/demos/card_redesign.html, 게임 화면 384×216 기준 좌표):
// 제목 띠(카드 그림·무기 탭·무기 Lv·조각) / 위 장착 줄(액티브 A S D F · 패시브 "비용 사용/한도"·칸) / 계열 보너스 한 줄 /
// 액티브·패시브 카드 탭 / 보유 카드(줄 = 기본·공용 / A / B, 티어 짝) / 오른쪽 상세 (cardDetail.ts). 글자는 모두 갈무리7.
// 움직이는 것(강화 반짝임·강화 가능 ▲·강화 번쩍임·조각)은 fx 층에 매 프레임 (나머지는 바뀔 때만). 상태·입력은 stage/islandCards.ts (CardSource)
import type Phaser from 'phaser';
import { drawDetail, DETAIL_CARD } from './cardDetail';
import { cardShine, readyMark, shinePhase } from './cardFrame';
import { box, CH, cardFace, cardIcon, CW, dustGem, keyTag, Painter, paintOf, R, roman, SK, titleCard } from './cardParts';
import type { FontKey } from './fonts';
import { koWidth } from './koText';
import { PASS_AREA, type CardHit, type CardInfo, type CardSource } from './cardTypes';

const W = 384, H = 216, KEYS = ['A', 'S', 'D', 'F'];
const labW = (t: string, font: FontKey = 'koSmall') => koWidth(t, font);
/** 강화 번쩍임 (초), 조각 색 */
const POP = 0.35, BURST = [SK.coin, SK.flash, SK.gold];

/** 움직이는 그림 자리 (창 좌표): shine = 강화 몸통, ready = 강화 가능 카드 */
interface Spot { id: string; x: number; y: number; w: number; h: number; kind: 'shine' | 'ready' }
interface Bit { x: number; y: number; vx: number; vy: number; life: number; s: number; c: string }

export class CardWindow {
  private p: Painter<CardHit>;
  private fx: Phaser.GameObjects.Graphics;
  private ghost: Phaser.GameObjects.Graphics;
  private sig = '';
  private spots: Spot[] = [];
  /** 카드가 그려진 자리 (강화 조각이 튀는 곳) */
  private where = new Map<string, { x: number; y: number }[]>();
  private pop: { id: string; t0: number } | null = null;
  private bits: Bit[] = [];

  constructor(scene: Phaser.Scene, depth: number) {
    const g = scene.add.graphics().setScrollFactor(0).setDepth(depth);
    this.p = new Painter<CardHit>(scene, g, depth);
    this.fx = scene.add.graphics().setScrollFactor(0).setDepth(depth);
    this.ghost = scene.add.graphics().setScrollFactor(0).setDepth(depth + 2);
  }

  render(s: CardSource, sig: string, screenW: number, screenH: number): void {
    const ox = Math.floor((screenW - W) / 2), oy = Math.max(0, Math.floor((screenH - H) / 2));
    const key = `${sig}|${ox}|${oy}|${screenW}|${screenH}`;
    if (key === this.sig) return;
    this.sig = key;
    const p = this.p, g = p.g;
    p.clear();
    this.spots = [];
    this.where.clear();
    p.ox = ox;
    p.oy = oy;
    p.hit(7, 5, 370, 205, { kind: 'inside' });
    g.setPosition(ox, oy);
    this.fx.setPosition(ox, oy);
    R(g, -ox, -oy, screenW, screenH, SK.cover, 0.5);
    R(g, 9, 8, 368, 204, SK.cover, 0.35);
    R(g, 7, 5, 370, 205, SK.shade);
    R(g, 8, 6, 368, 203, SK.border);
    R(g, 9, 7, 366, 201, SK.panel);
    R(g, 9, 7, 366, 1, SK.hi);
    R(g, 9, 8, 366, 15, SK.title);
    R(g, 9, 23, 366, 1, SK.border);
    titleCard(g, 14, 10);
    p.text(25, 11, '카드', SK.txt);
    this.header(s);
    this.equipRow(s);
    this.bonusRow(s);
    this.list(s);
    drawDetail(p, s);
    if (!s.hoverBonus) this.face(s.card(s.hover ?? s.sel), DETAIL_CARD.x, DETAIL_CARD.y, true);
  }

  /** 매 프레임: 강화 반짝임 · 강화 가능 ▲ · 강화 번쩍임 · 조각 (t = 초) */
  animate(t: number, dt: number): void {
    const g = this.fx, P = paintOf(g);
    g.clear();
    if (!this.sig) return;
    for (const sp of this.spots) {
      if (sp.kind === 'shine') cardShine(P, sp.x, sp.y, sp.w, sp.h, t, shinePhase(sp.id));
      else readyMark(P, sp.x, sp.y, sp.h, t);
    }
    const pop = this.pop;
    if (pop) {
      const a = 1 - (t - pop.t0) / POP;
      if (a <= 0) this.pop = null;
      else for (const w of this.where.get(pop.id) ?? []) R(g, w.x, w.y, CW, CH, SK.flash, a);
    }
    this.bits = this.bits.filter((b) => (b.life -= dt) > 0);
    for (const b of this.bits) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.vy += 120 * dt;
      R(g, Math.round(b.x), Math.round(b.y), b.s, b.s, b.c, Math.min(1, b.life * 3));
    }
  }

  /** 강화 성공: 카드가 번쩍이고 금색 조각이 튐 */
  celebrate(id: string, t: number): void {
    this.pop = { id, t0: t };
    (this.where.get(id) ?? []).forEach((w, k) => {
      for (let i = 0; i < (k ? 14 : 22); i++) {
        const a = Math.random() * Math.PI * 2, v = 30 + Math.random() * 60;
        this.bits.push({ x: w.x + CW / 2, y: w.y + CH / 2, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20, life: 0.5 + Math.random() * 0.4, s: Math.random() < 0.3 ? 2 : 1, c: BURST[i % 3]! });
      }
    });
  }

  /** 끄는 카드 (마우스를 따라감, 전체를 다시 그리지 않음) */
  drawGhost(s: CardSource | null, x: number, y: number): void {
    const g = this.ghost;
    g.clear();
    if (!s?.drag) return;
    g.setAlpha(0.85);
    cardFace(g, s.card(s.drag.id), x - 12, y - 14, { big: true });
  }

  /** 화면 좌표 → 무엇을 눌렀나 (패널 밖이면 null) */
  hit(px: number, py: number): CardHit | null {
    return this.p.at(px, py);
  }

  /** 화면 좌표가 창 안 (x, y, w, h) 칸에 드나 */
  inside(px: number, py: number, r: { x: number; y: number; w: number; h: number }): boolean {
    const x = px - this.p.ox, y = py - this.p.oy;
    return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
  }

  hide(): void {
    this.p.clear();
    this.fx.clear();
    this.ghost.clear();
    this.sig = '';
    this.spots = [];
    this.bits = [];
    this.pop = null;
  }

  destroy(): void {
    this.hide();
    this.p.g.destroy();
    this.fx.destroy();
    this.ghost.destroy();
  }

  /** 카드 한 장 + 움직이는 그림 자리 기록 */
  private face(c: CardInfo, x: number, y: number, big: boolean, o: { sel?: boolean; hov?: boolean } = {}): void {
    const ins = cardFace(this.p.g, c, x, y, { ...o, big });
    const list = this.where.get(c.id) ?? [];
    list.push({ x, y });
    this.where.set(c.id, list);
    if (c.owned && c.enhanced) this.spots.push({ id: c.id, x: x + ins, y: y + ins, w: CW - ins * 2, h: CH - ins * 2, kind: 'shine' });
    if (!big && c.ready) this.spots.push({ id: c.id, x, y, w: CW, h: CH, kind: 'ready' });
  }

  /** 무기 탭 · 오른쪽 무기 Lv 알약 + 조각 */
  private header(s: CardSource): void {
    const p = this.p, g = p.g;
    let tx = 50;
    s.tabs.forEach((lab, i) => {
      const on = i === s.tab, tw = labW(lab) + 14;
      if (on) { R(g, tx, 9, tw, 15, SK.border); R(g, tx + 1, 10, tw - 2, 14, SK.panel); R(g, tx + 1, 10, tw - 2, 1, SK.hi); }
      else { R(g, tx, 11, tw, 12, SK.cardBd); R(g, tx + 1, 12, tw - 2, 10, SK.title); }
      p.text(tx + 7, 12, lab, on ? SK.txt : SK.key);
      p.hit(tx, 9, tw, 14, { kind: 'tab', i });
      tx += tw + 2;
    });
    const dn = String(s.dust);
    let rx = 370 - labW(dn);
    p.text(rx, 12, dn, SK.txt);
    rx -= 10;
    dustGem(g, rx, 13);
    const lv = `${s.weaponName} Lv ${s.level}`, lw = labW(lv) + 10;
    rx -= lw + 6;
    R(g, rx, 11, lw, 11, SK.border);
    R(g, rx + 1, 12, lw - 2, 9, SK.lit);
    p.text(rx + 5, 12, lv, SK.txt);
  }

  /** 장착 칸 하나 (n = 22 액티브 · 16 패시브): 계열 색 테두리, 강화면 반짝임 */
  private slot(s: CardSource, id: string, x: number, y: number, n: number, gold: boolean): void {
    const g = this.p.g, c = s.card(id);
    R(g, x + 1, y + 1, n, n, SK.shade);
    R(g, x, y, n, n, gold ? SK.coin : c.color);
    R(g, x + 1, y + 1, n - 2, n - 2, SK.title);
    if (n === 22) cardIcon(g, id, x + 3, y + 3);
    else cardIcon(g, id, x + 1, y + 1, { inset: 1 });
    if (c.enhanced) this.spots.push({ id, x: x + 1, y: y + 1, w: n - 2, h: n - 2, kind: 'shine' });
  }

  /** 위 장착 줄: 액티브 A S D F 22×22 / 패시브 "비용 사용/한도" + 16×16 칸 + 빈 자리 + */
  private equipRow(s: CardSource): void {
    const p = this.p, g = p.g, d = s.drag;
    box(g, 12, 26, 224, 40);
    p.text(16, 27, '액티브', SK.key);
    s.active.forEach((id, k) => {
      const x = 17 + k * 25, y = 38, tgt = d?.aslot === k;
      if (id && d?.from !== `a${k}`) this.slot(s, id, x, y, 22, tgt || s.sel === id);
      else { R(g, x + 1, y + 1, 22, 22, SK.shade); R(g, x, y, 22, 22, tgt ? SK.coin : SK.cardBd); R(g, x + 1, y + 1, 20, 20, SK.title); }
      keyTag(g, x - 2, y + 14, KEYS[k]!);
      p.hit(x, y, 22, 22, { kind: 'aslot', k });
    });
    for (let y = 29; y < 64; y += 2) R(g, 118, y, 1, 1, SK.cardBd);
    // 패시브
    const ut = `비용 ${s.used}/${s.cap}`;
    p.hit(PASS_AREA.x, PASS_AREA.y, PASS_AREA.w, PASS_AREA.h, { kind: 'passArea' });
    p.text(123, 27, '패시브', SK.key);
    p.text(232 - labW(ut), 27, ut, s.used > s.cap ? SK.danger : SK.off);
    const n = s.passive.length, cs = n >= 6 ? 15 : 18;
    s.passive.forEach((id, i) => {
      const x = 123 + i * cs, y = 41;
      if (d?.from === `p${i}`) return;
      this.slot(s, id, x, y, 16, s.sel === id);
      p.hit(x, y, 16, 16, { kind: 'pslot', i });
    });
    const tgt = !!d?.pass;
    if (s.used < s.cap && 123 + n * cs + 16 <= 234) {
      const x = 123 + n * cs, y = 41, c = tgt ? SK.coin : SK.cardBd;
      for (let i = 0; i < 16; i += 2) { R(g, x + i, y, 1, 1, c); R(g, x + i, y + 15, 1, 1, c); R(g, x, y + i, 1, 1, c); R(g, x + 15, y + i, 1, 1, c); }
      R(g, x + 7, y + 5, 2, 6, c);
      R(g, x + 5, y + 7, 6, 2, c);
    }
    if (tgt) R(g, PASS_AREA.x, PASS_AREA.y + 1, 1, PASS_AREA.h - 2, SK.coin);
  }

  /** 계열 보너스 한 줄: 글자 · 이름 · 끼운 장수 점 5개(문턱 3·5 밑줄) · 켜진 단계 Ⅰ/Ⅱ. 효과는 마우스를 올리면 상세 */
  private bonusRow(s: CardSource): void {
    const p = this.p, g = p.g, last = s.bonusAt.at(-1) ?? 5;
    box(g, 12, 68, 224, 15);
    s.bonus.forEach((b, i) => {
      const x = 16 + i * 111, n = b.ids.length;
      if (s.hoverBonus === b.branch) R(g, x - 3, 69, 111, 13, SK.lit);
      p.text(x, 70, b.branch, b.color);
      p.text(x + 8, 70, b.name, b.step ? SK.txt : SK.dim);
      const px = x + 12 + labW(b.name);
      for (let j = 0; j < last; j++) {
        const on = j < n;
        R(g, px + j * 5, 73, 4, 4, SK.shade);
        R(g, px + j * 5, 73, 4, 3, on ? b.color : SK.track);
        if (s.bonusAt.includes(j + 1)) R(g, px + j * 5, 78, 4, 1, on ? b.color : SK.cardBd);
      }
      if (b.step) roman(g, b.step, px + last * 5 + 4, 72, SK.coin);
      p.hit(x - 3, 69, 111, 13, { kind: 'bonus', b: b.branch });
    });
    for (let y = 70; y < 82; y += 2) R(g, 124, y, 1, 1, SK.cardBd);
  }

  /** 액티브/패시브 카드 탭 + 보유 수 + 카드 목록 (줄 = 기본·공용 / A / B, 왼쪽부터 티어 짝) */
  private list(s: CardSource): void {
    const p = this.p, g = p.g;
    let vx = 12;
    for (const [v, lab] of [['act', '액티브 카드'], ['pas', '패시브 카드']] as const) {
      const tw = labW(lab) + 16, on = s.view === v, hv = s.hoverBtn === `v${v}`;
      if (on) { R(g, vx, 86, tw, 13, SK.border); R(g, vx + 1, 87, tw - 2, 12, SK.card); R(g, vx + 1, 87, tw - 2, 1, SK.hi); }
      else { R(g, vx, 88, tw, 10, hv ? SK.key : SK.cardBd); R(g, vx + 1, 89, tw - 2, 8, SK.title); }
      p.text(vx + 8, on ? 87 : 88, lab, on || hv ? SK.txt : SK.key);
      p.hit(vx, 86, tw, 13, { kind: 'view', v });
      vx += tw + 2;
    }
    const ht = `보유 ${s.owned}/${s.total}`;
    p.text(234 - labW(ht), 88, ht, SK.off);
    R(g, 13, 100, 224, 108, SK.shade);
    R(g, 12, 99, 224, 108, SK.border);
    R(g, 13, 100, 222, 106, SK.card);
    s.rows.forEach((row, r) => {
      const y = 104 + r * 35;
      if (r) for (let i = 0; i < 218; i += 2) R(g, 15 + i, y - 4, 1, 1, SK.cardBd);
      if (row.branch === 'base') p.text(16, y + 10, row.name, SK.key);
      else {
        R(g, 14, y + 1, 2, CH - 2, row.color);
        p.text(18, y + 10, row.name, row.color);
      }
      row.ids.forEach((id, i) => {
        const x = 46 + i * 26 + Math.floor(i / 2) * 4, dragged = s.drag?.id === id && s.drag.from === 'list';
        this.face(s.card(id), x, y, false, { sel: s.sel === id, hov: s.hover === id });
        if (dragged) R(g, x, y, CW, CH, SK.card, 0.65);
        p.hit(x, y, CW, CH, { kind: 'card', id });
      });
    });
  }
}

