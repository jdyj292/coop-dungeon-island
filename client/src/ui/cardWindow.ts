// 카드 창 (K) 그리기 (hud.md 8장, 승인 데모 docs/refs/demos/card_window.html, 게임 화면 384×216 기준 좌표):
// 제목 띠(카드 그림·무기 탭·임시 팩 열기·무기 Lv·조각) / 위 장착 줄(액티브 A S D F · 패시브 비용 막대·칸) / 계열 보너스 줄 /
// 액티브·패시브 카드 탭 / 보유 카드(줄 = 기본·공용 / A / B, 티어 짝) / 오른쪽 상세 (cardDetail.ts). 상태·입력은 stage/islandCards.ts (CardSource)
import type Phaser from 'phaser';
import { drawDetail } from './cardDetail';
import { box, buttonBox, CH, cardFace, cardIcon, CW, dustGem, fitKo, keyTag, Painter, R, roman, SK, titleCard } from './cardParts';
import type { FontKey } from './fonts';
import { koWidth } from './koText';
import { PASS_AREA, type CardHit, type CardSource } from './cardTypes';

const W = 384, H = 216, KEYS = ['A', 'S', 'D', 'F'];
const labW = (t: string, font: FontKey = 'koSmall') => koWidth(t, font);

export class CardWindow {
  private p: Painter<CardHit>;
  private ghost: Phaser.GameObjects.Graphics;
  private sig = '';

  constructor(scene: Phaser.Scene, depth: number) {
    const g = scene.add.graphics().setScrollFactor(0).setDepth(depth);
    this.p = new Painter<CardHit>(scene, g, depth);
    this.ghost = scene.add.graphics().setScrollFactor(0).setDepth(depth + 2);
  }

  render(s: CardSource, sig: string, screenW: number, screenH: number): void {
    const ox = Math.floor((screenW - W) / 2), oy = Math.max(0, Math.floor((screenH - H) / 2));
    const key = `${sig}|${ox}|${oy}|${screenW}|${screenH}`;
    if (key === this.sig) return;
    this.sig = key;
    const p = this.p, g = p.g;
    p.clear();
    p.ox = ox;
    p.oy = oy;
    p.hit(7, 5, 370, 205, { kind: 'inside' });
    g.setPosition(ox, oy);
    R(g, -ox, -oy, screenW, screenH, SK.cover, 0.5);
    R(g, 9, 8, 368, 204, SK.cover, 0.35);
    R(g, 7, 5, 370, 205, SK.shade);
    R(g, 8, 6, 368, 203, SK.border);
    R(g, 9, 7, 366, 201, SK.panel);
    R(g, 9, 7, 366, 1, SK.hi);
    R(g, 9, 8, 366, 15, SK.title);
    R(g, 9, 23, 366, 1, SK.border);
    titleCard(g, 14, 10);
    p.text(25, 9, '카드', SK.txt, 'ko');
    this.header(s);
    this.equipRow(s);
    this.bonusRow(s);
    this.list(s);
    drawDetail(p, s);
  }

  /** 끄는 카드 (마우스를 따라감, 전체를 다시 그리지 않음) */
  drawGhost(s: CardSource | null, x: number, y: number): void {
    const g = this.ghost;
    g.clear();
    if (!s?.drag) return;
    g.setAlpha(0.85);
    cardFace(g, s.card(s.drag.id), x - 12, y - 14, { big: true, merge: s.merge });
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
    this.ghost.clear();
    this.sig = '';
  }

  destroy(): void {
    this.hide();
    this.p.g.destroy();
    this.ghost.destroy();
  }

  /** 무기 탭 · 임시 팩 열기 · 오른쪽 무기 Lv 알약 + 조각 */
  private header(s: CardSource): void {
    const p = this.p, g = p.g;
    let tx = 56;
    s.tabs.forEach((lab, i) => {
      const on = i === s.tab, tw = labW(lab) + 14;
      if (on) { R(g, tx, 9, tw, 15, SK.border); R(g, tx + 1, 10, tw - 2, 14, SK.panel); R(g, tx + 1, 10, tw - 2, 1, SK.hi); }
      else { R(g, tx, 11, tw, 12, SK.cardBd); R(g, tx + 1, 12, tw - 2, 10, SK.title); }
      p.text(tx + 7, 12, lab, on ? SK.txt : SK.key);
      p.hit(tx, 9, tw, 14, { kind: 'tab', i });
      tx += tw + 2;
    });
    const dn = String(s.dust);
    let rx = 370 - labW(dn, 'ko');
    p.text(rx, 10, dn, SK.txt, 'ko');
    rx -= 10;
    dustGem(g, rx, 13);
    rx -= labW('조각') + 4;
    p.text(rx, 12, '조각', SK.key);
    const lv = `${s.weaponName} Lv ${s.level}`, lw = labW(lv) + 10;
    rx -= lw + 8;
    R(g, rx, 11, lw, 11, SK.border);
    R(g, rx + 1, 12, lw - 2, 9, SK.lit);
    p.text(rx + 5, 12, lv, SK.txt);
    // 임시 팩 열기 (CD-5 카드 상점 전까지, O 키)
    const pw = labW(s.packLabel) + 12, px = Math.max(tx + 6, rx - pw - 6), hv = s.hoverBtn === 'pack' && !s.busy;
    buttonBox(g, px, 10, pw, { hover: hv });
    p.center(px, pw, 10, s.packLabel, hv ? SK.coin : SK.txt, 'koSmall', s.busy ? 0.35 : 1);
    if (!s.busy) p.hit(px, 10, pw, 12, { kind: 'btn', b: 'pack' });
  }

  /** 위 장착 줄: 액티브 A S D F 22×22 / 패시브 비용 막대 "사용/한도" + 16×16 칸 + 빈 자리 + */
  private equipRow(s: CardSource): void {
    const p = this.p, g = p.g, d = s.drag;
    box(g, 12, 26, 224, 46);
    p.text(16, 26, '액티브', SK.key);
    s.active.forEach((id, k) => {
      const x = 17 + k * 25, y = 38, tgt = d?.aslot === k;
      R(g, x + 1, y + 1, 22, 22, SK.shade);
      R(g, x, y, 22, 22, tgt || (id && s.sel === id) ? SK.coin : SK.key);
      R(g, x + 1, y + 1, 20, 20, SK.title);
      R(g, x + 1, y + 1, 20, 1, SK.cardBd);
      if (id && d?.from !== `a${k}`) {
        cardIcon(g, id, x + 3, y + 3);
        if (s.card(id).enhanced) for (const [dx, dy] of [[0, 0], [20, 0], [0, 20], [20, 20]] as const) R(g, x + dx, y + dy, 2, 2, SK.coin);
      }
      keyTag(g, x - 2, y + 14, KEYS[k]!);
      p.hit(x, y, 22, 22, { kind: 'aslot', k });
    });
    for (let y = 29; y < 70; y += 2) R(g, 118, y, 1, 1, SK.cardBd);
    // 패시브
    const over = s.used > s.cap, ut = `${s.used}/${s.cap}`;
    p.hit(PASS_AREA.x, PASS_AREA.y, PASS_AREA.w, PASS_AREA.h, { kind: 'passArea' });
    p.text(123, 26, '패시브', SK.key);
    p.text(232 - labW(ut) - labW('비용') - 3, 26, '비용', SK.off);
    p.text(232 - labW(ut), 26, ut, over ? SK.danger : SK.txt);
    const step = Math.min(10, Math.floor(110 / Math.max(1, s.cap))), seg: string[] = [];
    for (const id of s.passive) for (let i = 0; i < s.card(id).cost; i++) seg.push(id);
    for (let i = 0; i < s.cap; i++) {
      const id = seg[i], x = 123 + i * step;
      R(g, x, 37, step - 1, 4, SK.shade);
      R(g, x, 37, step - 1, 3, id ? (s.card(id).enhanced ? SK.coin : s.card(id).tierColor) : SK.track);
      if (id && i > 0 && seg[i - 1] !== id) R(g, x - 1, 37, 1, 3, SK.card);
    }
    const n = s.passive.length, cs = n >= 6 ? 15 : 18;
    s.passive.forEach((id, i) => {
      const x = 123 + i * cs, y = 46, c = s.card(id);
      if (d?.from === `p${i}`) return;
      R(g, x + 1, y + 1, 16, 16, SK.shade);
      R(g, x, y, 16, 16, c.enhanced || s.sel === id ? SK.coin : c.tierColor);
      R(g, x + 1, y + 1, 14, 14, SK.title);
      cardIcon(g, id, x + 1, y + 1, { inset: 1 });
      p.hit(x, y, 16, 16, { kind: 'pslot', i });
    });
    const tgt = !!d?.pass;
    if (s.used < s.cap && 123 + n * cs + 16 <= 234) {
      const x = 123 + n * cs, y = 46, c = tgt ? SK.coin : SK.cardBd;
      for (let i = 0; i < 16; i += 2) { R(g, x + i, y, 1, 1, c); R(g, x + i, y + 15, 1, 1, c); R(g, x, y + i, 1, 1, c); R(g, x + 15, y + i, 1, 1, c); }
      R(g, x + 7, y + 5, 2, 6, c);
      R(g, x + 5, y + 7, 6, 2, c);
    }
    if (tgt) R(g, PASS_AREA.x, PASS_AREA.y + 1, 1, 44, SK.coin);
    if (s.nextCapLevel) {
      const t = `Lv${s.nextCapLevel} 한도 +1`;
      p.text(232 - labW(t), 62, t, SK.off);
    }
  }

  /** 계열 보너스 줄: 계열마다 끼운 장수 점 5개(문턱 3·5 밑줄) · Ⅰ/Ⅱ 효과 또는 "n장 더 끼우면 Ⅰ" */
  private bonusRow(s: CardSource): void {
    const p = this.p, g = p.g, first = s.bonusAt[0] ?? 3, last = s.bonusAt.at(-1) ?? 5;
    box(g, 12, 74, 224, 22);
    s.bonus.forEach((b, i) => {
      const x = 16 + i * 111, n = b.ids.length;
      if (s.hoverBonus === b.branch) R(g, x - 3, 75, 111, 20, SK.lit);
      p.text(x, 75, b.branch, b.color);
      p.text(x + 8, 75, b.name, b.step ? SK.txt : SK.dim);
      const px = x + 10 + labW(b.name);
      for (let j = 0; j < last; j++) {
        const on = j < n;
        R(g, px + j * 5, 78, 4, 4, SK.shade);
        R(g, px + j * 5, 78, 4, 3, on ? b.color : SK.track);
        if (s.bonusAt.includes(j + 1)) R(g, px + j * 5, 83, 4, 1, on ? b.color : SK.cardBd);
      }
      p.text(px + last * 5 + 2, 75, `${n}장`, SK.key);
      if (b.step) {
        roman(g, b.step, x + 1, 86, SK.coin);
        p.text(x + 5 + b.step * 3, 85, fitKo(b.steps[b.step - 1]!.join(' · '), 96), SK.coin);
      } else {
        const t = `${first - n}장 더 끼우면 `;
        p.text(x, 85, t, SK.off);
        roman(g, 1, x + labW(t) + 1, 86, SK.off);
      }
      p.hit(x - 3, 75, 111, 20, { kind: 'bonus', b: b.branch });
    });
    for (let y = 77; y < 94; y += 2) R(g, 124, y, 1, 1, SK.cardBd);
  }

  /** 액티브/패시브 카드 탭 + 보유 수 + 카드 목록 (줄 = 기본·공용 / A / B, 왼쪽부터 티어 짝) */
  private list(s: CardSource): void {
    const p = this.p, g = p.g;
    let vx = 12;
    for (const [v, lab] of [['act', '액티브 카드'], ['pas', '패시브 카드']] as const) {
      const tw = labW(lab) + 16, on = s.view === v, hv = s.hoverBtn === `v${v}`;
      if (on) { R(g, vx, 98, tw, 13, SK.border); R(g, vx + 1, 99, tw - 2, 12, SK.card); R(g, vx + 1, 99, tw - 2, 1, SK.hi); }
      else { R(g, vx, 100, tw, 10, hv ? SK.key : SK.cardBd); R(g, vx + 1, 101, tw - 2, 8, SK.title); }
      p.text(vx + 8, on ? 99 : 100, lab, on || hv ? SK.txt : SK.key);
      p.hit(vx, 98, tw, 13, { kind: 'view', v });
      vx += tw + 2;
    }
    const ht = `보유 ${s.owned}/${s.total}`;
    p.text(234 - labW(ht), 100, ht, SK.off);
    R(g, 13, 112, 224, 96, SK.shade);
    R(g, 12, 111, 224, 96, SK.border);
    R(g, 13, 112, 222, 94, SK.card);
    s.rows.forEach((row, r) => {
      const y = 114 + r * 31;
      if (r) for (let i = 0; i < 218; i += 2) R(g, 15 + i, y - 2, 1, 1, SK.cardBd);
      if (row.branch === 'base') {
        p.text(16, y + 10, row.name, SK.key);
        const hint = s.view === 'act' ? '처음부터 1장씩' : '모든 계열에서 켜짐';
        p.text(46 + row.ids.length * 26 + 6, y + 10, hint, SK.off);
      } else {
        R(g, 14, y + 1, 2, CH - 2, row.color);
        p.text(19, y + 3, row.branch, row.color, 'ko');
        p.text(18, y + 15, row.name, SK.dim);
      }
      row.ids.forEach((id, i) => {
        const x = 46 + i * 26 + Math.floor(i / 2) * 4, dragged = s.drag?.id === id && s.drag.from === 'list';
        cardFace(g, s.card(id), x, y, { sel: s.sel === id, hov: s.hover === id, merge: s.merge });
        if (dragged) R(g, x, y, CW, CH, SK.card, 0.65);
        p.hit(x, y, CW, CH, { kind: 'card', id });
      });
    });
  }
}
