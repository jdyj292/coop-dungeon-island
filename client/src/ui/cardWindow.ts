// 카드 창 (K) 그리기 (hud.md 8장, 게임 화면 384×216 기준 좌표):
// 제목 띠(카드 그림·무기 탭·무기 Lv·조각) / 왼쪽 = 장착 화면(액티브 A S D F 카드 + 이름 · 패시브 "비용 사용/한도" + 카드 + 빈 칸 · 계열 보너스 줄)
// 또는 고르기 창(cardPicker.ts) / 오른쪽 상세 (cardDetail.ts). 글자는 고해상도 (hiText.ts). 카드 그림은 움직이지 않고, 강화 성공 번쩍임·조각만 fx 층에 매 프레임
import type Phaser from 'phaser';
import { drawDetail, DETAIL_CARD } from './cardDetail';
import { box, CH, cardFace, cardIcon, corners, CW, dustGem, keyTag, Painter, R, roman, SK, titleCard } from './cardParts';
import { drawPicker } from './cardPicker';
import { fitHi, hiWidth } from './hiText';
import { TAB_ROW, type CardHit, type CardInfo, type CardSource } from './cardTypes';

const W = 384, H = 216, KEYS = ['A', 'S', 'D', 'F'];
/** 액티브 칸 폭 · 패시브 카드 간격(이름 없음 · 이름 있음) */
const ACELL = 55, PGAP = 28, PNAMED = 44, ACTIVE_N = KEYS.length;
/** 강화 번쩍임 (초), 조각 색 */
const POP = 0.35, BURST = [SK.coin, SK.flash, SK.gold];

interface Bit { x: number; y: number; vx: number; vy: number; life: number; s: number; c: string }

/** 빈 칸: 점선 테두리 + 가운데 + */
export function emptySlot(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, c: string): void {
  for (let i = 0; i < w; i += 2) { R(g, x + i, y, 1, 1, c); R(g, x + i, y + h - 1, 1, 1, c); }
  for (let j = 0; j < h; j += 2) { R(g, x, y + j, 1, 1, c); R(g, x + w - 1, y + j, 1, 1, c); }
  const cx = x + Math.floor(w / 2), cy = y + Math.floor(h / 2);
  R(g, cx - 1, cy - 4, 2, 8, c);
  R(g, cx - 4, cy - 1, 8, 2, c);
}

export class CardWindow {
  private p: Painter<CardHit>;
  private fx: Phaser.GameObjects.Graphics;
  private sig = '';
  /** 카드가 그려진 자리 (강화 조각이 튀는 곳) */
  private where = new Map<string, { x: number; y: number }[]>();
  private pop: { id: string; t0: number } | null = null;
  private bits: Bit[] = [];

  constructor(private scene: Phaser.Scene, depth: number) {
    const g = scene.add.graphics().setScrollFactor(0).setDepth(depth);
    this.p = new Painter<CardHit>(scene, g);
    this.fx = scene.add.graphics().setScrollFactor(0).setDepth(depth + 1);
  }

  render(s: CardSource, sig: string, screenW: number, screenH: number): void {
    const ox = Math.floor((screenW - W) / 2), oy = Math.max(0, Math.floor((screenH - H) / 2));
    const key = `${sig}|${ox}|${oy}|${screenW}|${screenH}|${this.scene.scale.zoom}|${window.devicePixelRatio}`;
    if (key === this.sig) return;
    this.sig = key;
    const p = this.p, g = p.g;
    p.clear(true);
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
    p.text(25, 11, '카드', SK.txt, 'title');
    this.header(s);
    if (s.picker) drawPicker(p, s, (c, x, y, o) => this.face(c, x, y, false, o));
    else {
      this.activeRow(s);
      this.passiveRow(s);
      this.bonusRow(s);
    }
    drawDetail(p, s);
    if (!s.hoverBonus) this.face(s.card(s.hover ?? s.sel), DETAIL_CARD.x, DETAIL_CARD.y, true);
  }

  /** 매 프레임: 강화 성공 번쩍임 · 조각 (t = 초) */
  animate(t: number, dt: number): void {
    const g = this.fx;
    g.clear();
    if (!this.sig) return;
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

  /** 화면 좌표 → 무엇을 눌렀나 (패널 밖이면 null) */
  hit(px: number, py: number): CardHit | null {
    return this.p.at(px, py);
  }

  hide(): void {
    this.p.clear();
    this.fx.clear();
    this.sig = '';
    this.bits = [];
    this.pop = null;
  }

  destroy(): void {
    this.hide();
    this.p.destroy();
    this.fx.destroy();
  }

  /** 카드 한 장 + 자리 기록 (강화 번쩍임) */
  private face(c: CardInfo, x: number, y: number, big: boolean, o: { sel?: boolean; hov?: boolean } = {}): void {
    cardFace(this.p.g, c, x, y, { ...o, big });
    const list = this.where.get(c.id) ?? [];
    list.push({ x, y });
    this.where.set(c.id, list);
  }

  /** 무기 탭 · 오른쪽 무기 Lv 알약 + 조각 */
  private header(s: CardSource): void {
    const p = this.p, g = p.g;
    let tx = 52;
    s.tabs.forEach((lab, i) => {
      const on = i === s.tab, tw = hiWidth(lab) + 14;
      if (on) { R(g, tx, 9, tw, 15, SK.border); R(g, tx + 1, 10, tw - 2, 14, SK.panel); R(g, tx + 1, 10, tw - 2, 1, SK.hi); }
      else { R(g, tx, 11, tw, 12, SK.cardBd); R(g, tx + 1, 12, tw - 2, 10, SK.title); }
      if (on && s.focus === TAB_ROW && !s.picker) corners(g, tx, 9, tw, 15, SK.coin);
      p.text(tx + 7, 12, lab, on ? SK.txt : SK.key);
      p.hit(tx, 9, tw, 14, { kind: 'tab', i });
      tx += tw + 2;
    });
    const dn = String(s.dust);
    let rx = 370 - hiWidth(dn);
    p.text(rx, 12, dn, SK.txt);
    rx -= 10;
    dustGem(g, rx, 14);
    const lv = `${s.weaponName} Lv ${s.level}`, lw = hiWidth(lv) + 10;
    rx -= lw + 6;
    R(g, rx, 11, lw, 12, SK.border);
    R(g, rx + 1, 12, lw - 2, 10, SK.lit);
    p.text(rx + 5, 12, lv, SK.txt);
  }

  /** 액티브 A S D F: 칸마다 카드 + 이름, 빈 칸은 점선 + (누르면 고르기 창) */
  private activeRow(s: CardSource): void {
    const p = this.p, g = p.g;
    box(g, 12, 26, 224, 60);
    p.text(16, 28, '액티브', SK.key, 'small');
    const hint = '칸을 눌러 카드 고르기';
    p.text(232 - hiWidth(hint, 'small'), 28, hint, SK.off, 'small');
    s.active.forEach((id, k) => {
      const cx = 14 + k * ACELL, x = cx + 15, y = 39, foc = s.focus === k;
      if (id) {
        const c = s.card(id);
        this.face(c, x, y, false, { sel: foc, hov: s.hover === id });
        p.center(cx, ACELL, 70, fitHi(c.name, ACELL - 4, 'small'), c.enhanced ? SK.coin : SK.txt, 'small');
      } else {
        emptySlot(g, x, y, CW, CH, foc ? SK.coin : SK.cardBd);
        if (foc) corners(g, x, y, CW, CH, SK.coin);
        keyTag(g, x - 2, y + CH - 8, KEYS[k]!);
        p.center(cx, ACELL, 70, '비어 있음', SK.off, 'small');
      }
      p.hit(cx, 37, ACELL, 46, { kind: 'aslot', k });
    });
  }

  /** 패시브: "비용 사용/한도"(넘으면 빨강) + 끼운 카드 + 남은 비용이 있으면 점선 + 칸.
   * 칸이 5개까지는 카드 + 이름(44 간격), 8개까지는 카드만, 더 많으면 16×16 아이콘 (한도 11까지 한 줄) */
  private passiveRow(s: CardSource): void {
    const p = this.p, g = p.g, n = s.passive.length, add = s.used < s.cap, all = n + (add ? 1 : 0);
    box(g, 12, 89, 224, 60);
    p.text(16, 91, '패시브', SK.key, 'small');
    const ut = `비용 ${s.used}/${s.cap}`;
    p.text(232 - hiWidth(ut, 'small'), 91, ut, s.used > s.cap ? SK.danger : SK.off, 'small');
    const named = all <= 5, small = all > 8, gap = named ? PNAMED : small ? 18 : PGAP, w = small ? 16 : CW, h = small ? 16 : CH, y = small ? 110 : 103;
    const x0 = named ? 14 + Math.floor((gap - CW) / 2) : 18;
    s.passive.forEach((id, i) => {
      const x = x0 + i * gap, c = s.card(id), foc = s.focus === ACTIVE_N + i;
      if (small) {
        R(g, x + 1, y + 1, 16, 16, SK.shade);
        R(g, x, y, 16, 16, foc ? SK.coin : c.color);
        R(g, x + 1, y + 1, 14, 14, SK.title);
        cardIcon(g, id, x + 1, y + 1, { inset: 1 });
        if (foc) corners(g, x, y, 16, 16, SK.coin);
      } else this.face(c, x, y, false, { sel: foc, hov: s.hover === id });
      if (named) p.center(x - Math.floor((gap - CW) / 2), gap, 134, fitHi(c.name, gap - 4, 'small'), c.enhanced ? SK.coin : SK.txt, 'small');
      p.hit(x, y, w, h, { kind: 'pslot', i });
    });
    if (add) {
      const x = x0 + n * gap, foc = s.focus === ACTIVE_N + n;
      emptySlot(g, x, y, w, h, foc ? SK.coin : SK.cardBd);
      if (foc) corners(g, x, y, w, h, SK.coin);
      p.hit(x, y, w, h, { kind: 'padd' });
    }
  }

  /** 계열 보너스: 계열마다 한 줄(계열이 늘면 줄도 늘어남) = 색 막대 · 이름 · 끼운 장수 점 5개(문턱 3·5 밑줄) · 켜진 단계 Ⅰ/Ⅱ. 효과는 마우스를 올리면 상세 */
  private bonusRow(s: CardSource): void {
    const p = this.p, g = p.g, last = s.bonusAt.at(-1) ?? 5, top = 152;
    box(g, 12, top, 224, 4 + s.bonus.length * 13);
    p.text(16, top + 2, '계열 보너스', SK.key, 'small');
    s.bonus.forEach((b, i) => {
      const y = top + 2 + i * 13, n = b.ids.length, px = 120;
      if (s.hoverBonus === b.branch) R(g, 70, y, 164, 12, SK.lit);
      R(g, 74, y + 2, 2, 8, b.color);
      p.text(79, y, b.name, b.step ? SK.txt : SK.dim);
      for (let j = 0; j < last; j++) {
        const on = j < n;
        R(g, px + j * 5, y + 3, 4, 4, SK.shade);
        R(g, px + j * 5, y + 3, 4, 3, on ? b.color : SK.track);
        if (s.bonusAt.includes(j + 1)) R(g, px + j * 5, y + 8, 4, 1, on ? b.color : SK.cardBd);
      }
      p.text(px + last * 5 + 4, y, `${n}장`, SK.off, 'small');
      if (b.step) roman(g, b.step, px + last * 5 + 22, y + 2, SK.coin);
      p.hit(70, y, 164, 12, { kind: 'bonus', b: b.branch });
    });
  }
}
