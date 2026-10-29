// 화면 가운데 도트 패널 (hud.md 8장 패널): 제목 + 탭 / 목록 6줄(아이콘·이름·오른쪽 값) / 아래 줄(글·버튼)
// 잡화점·가방·게시판이 같이 쓴다. 내용이 바뀔 때만 다시 그린다. 글자는 갈무리 비트맵(koText)
import type Phaser from 'phaser';
import { dot } from '../fx/layer';
import { colorInt } from '../palette';
import { islandObjects, islandView } from '../sprites/island';
import { islandTexture } from '../sprites/textures';
import type { Hair } from '../view/look';
import { setFace } from './hudFace';
import { coinIcon, icon, materialIcon, panel, weaponIcon } from './hudParts';
import { koText, koWidth, wrapKo, type KoText } from './koText';
import { drawText } from './pixelFont';

const C = (p: string) => colorInt(p);
export const PANEL = { w: 208, h: 124, rowH: 13, rows: 6, pad: 6 } as const;

export type RowIcon = { kind: 'deco'; itemId: string } | { kind: 'potion'; color: string } | { kind: 'material' } | { kind: 'face'; color: number; hair?: Hair } | { kind: 'weapon'; weapon: string } | null;

export interface PanelRow {
  icon?: RowIcon;
  label: string;
  /** 오른쪽 숫자 (3×5 글꼴) */
  right?: string;
  /** 오른쪽 숫자 앞 동전 아이콘 */
  coin?: boolean;
  /** 흐리게 (살 수 없음 등) */
  dim?: boolean;
}

export interface PanelButton { id: string; label: string; disabled?: boolean }

export interface PanelView {
  title: string;
  tabs: { label: string; disabled?: boolean }[];
  tab: number;
  rows: PanelRow[];
  /** 선택 줄 (-1 = 없음) */
  sel: number;
  /** 아래 줄 글 (왼쪽) */
  footer: string;
  buttons: PanelButton[];
  /** 목록이 비었을 때 */
  empty: string;
  /** 고르는 줄 없이 이 줄부터 보이기 (게시판 ↑↓ 스크롤) */
  scrollTop?: number;
}

export type PanelHit = { kind: 'tab'; i: number } | { kind: 'row'; i: number } | { kind: 'button'; id: string } | { kind: 'inside' } | { kind: 'outside' };

export class ListPanel {
  private g: Phaser.GameObjects.Graphics;
  private texts: KoText[] = [];
  private icons: Phaser.GameObjects.Image[] = [];
  private sig = '';
  private box = { x: 0, y: 0 };
  private hits: { x: number; y: number; w: number; h: number; hit: PanelHit }[] = [];

  constructor(private scene: Phaser.Scene, private depth: number) {
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(depth);
  }

  /** 보이는 첫 줄 (선택 줄이 보이게) */
  static first(sel: number, count: number): number {
    return Math.max(0, Math.min(sel - PANEL.rows + 1, count - PANEL.rows, Math.max(0, sel)));
  }

  render(v: PanelView, screenW: number, fieldH: number): void {
    const x = Math.floor((screenW - PANEL.w) / 2), y = Math.max(2, Math.floor((fieldH - PANEL.h) / 2));
    const sig = JSON.stringify([v, x, y]);
    if (sig === this.sig) return;
    this.sig = sig;
    this.clear();
    this.box = { x, y };
    const g = this.g, P = PANEL.pad;
    panel(g, x, y, PANEL.w, PANEL.h);
    this.text(x + P, y + 4, v.title, 'global.ui.coin');
    // 탭 (오른쪽 위)
    let tx = x + PANEL.w - P;
    for (let i = v.tabs.length - 1; i >= 0; i--) {
      const t = v.tabs[i]!, w = this.measure(t.label) + 8;
      tx -= w;
      const on = i === v.tab;
      dot(g, tx, y + 3, C(on ? 'global.ui.panelBorder' : 'global.ui.panelInner'), w, 13);
      dot(g, tx + 1, y + 4, C(on ? 'global.ui.panelInner' : 'global.ui.panel'), w - 2, 11);
      this.text(tx + 4, y + 4, t.label, t.disabled ? 'global.ui.panelBorder' : on ? 'global.ui.steelLight' : 'global.ui.keyLabel');
      if (!t.disabled) this.hits.push({ x: tx, y: y + 3, w, h: 13, hit: { kind: 'tab', i } });
      tx -= 2;
    }
    // 목록
    const top = y + 20;
    const first = v.scrollTop !== undefined ? Math.max(0, Math.min(v.scrollTop, v.rows.length - PANEL.rows)) : ListPanel.first(v.sel, v.rows.length);
    dot(g, x + P - 2, top - 2, C('global.ui.panelInner'), PANEL.w - 2 * P + 4, PANEL.rows * PANEL.rowH + 3);
    if (!v.rows.length) this.text(x + P + 2, top + 2, v.empty, 'global.ui.textDim');
    v.rows.slice(first, first + PANEL.rows).forEach((r, k) => {
      const i = first + k, ry = top + k * PANEL.rowH, rw = PANEL.w - 2 * P;
      if (i === v.sel) {
        dot(g, x + P - 1, ry, C('global.ui.panel'), rw + 2, PANEL.rowH - 1);
        dot(g, x + P - 1, ry, C('global.ui.coin'), 1, PANEL.rowH - 1);
      }
      const lx = this.icon(r.icon ?? null, x + P + 1, ry);
      // 오른쪽 값 자리를 남기고 넘치면 말줄임
      const room = x + P + rw - 4 - lx - (r.right !== undefined ? r.right.length * 4 + (r.coin ? 10 : 2) : 0);
      this.text(lx, ry, wrapKo(r.label, room, 1)[0] ?? '', r.dim ? 'global.ui.textDim' : 'global.ui.steelLight');
      if (r.right !== undefined) {
        const w = r.right.length * 4 - 1, rx = x + P + rw - 2 - w;
        drawText(g, r.right, rx, ry + 4, { color: r.dim ? 'global.ui.textDim' : 'global.allyFx.gold', outline: 'none' });
        if (r.coin) coinIcon(g, rx - 7, ry + 4);
      }
      this.hits.push({ x: x + P, y: ry, w: rw, h: PANEL.rowH, hit: { kind: 'row', i } });
    });
    // 스크롤 표시
    if (v.rows.length > PANEL.rows) {
      const bar = Math.max(4, Math.floor((PANEL.rows / v.rows.length) * (PANEL.rows * PANEL.rowH)));
      const by = top + Math.floor((first / v.rows.length) * PANEL.rows * PANEL.rowH);
      dot(g, x + PANEL.w - P + 1, by, C('global.ui.panelBorder'), 1, bar);
    }
    // 아래 줄: 글 + 버튼 (오른쪽)
    const fy = top + PANEL.rows * PANEL.rowH + 4;
    this.text(x + P, fy, v.footer, 'global.ui.textDim');
    let bx = x + PANEL.w - P;
    for (const b of [...v.buttons].reverse()) {
      const w = this.measure(b.label) + 10;
      bx -= w;
      dot(g, bx, fy - 1, C(b.disabled ? 'global.ui.panelBorder' : 'global.ui.bossHpDark'), w, 14);
      dot(g, bx, fy - 1, C(b.disabled ? 'global.ui.panelInner' : 'global.ui.coin'), w, 13);
      this.text(bx + 5, fy, b.label, b.disabled ? 'global.ui.textDim' : 'global.ui.panel');
      if (!b.disabled) this.hits.push({ x: bx, y: fy - 1, w, h: 14, hit: { kind: 'button', id: b.id } });
      bx -= 3;
    }
  }

  /** 화면 좌표 → 무엇을 눌렀나 */
  hit(px: number, py: number): PanelHit {
    for (const h of this.hits) if (px >= h.x && px < h.x + h.w && py >= h.y && py < h.y + h.h) return h.hit;
    const { x, y } = this.box;
    return px >= x && px < x + PANEL.w && py >= y && py < y + PANEL.h ? { kind: 'inside' } : { kind: 'outside' };
  }

  private measure(s: string): number {
    return koWidth(s);
  }

  private text(x: number, y: number, s: string, color: string): void {
    this.texts.push(koText(this.scene, x, y, s, { color }).setScrollFactor(0).setDepth(this.depth + 1));
  }

  /** 아이콘 (12×12 칸). 반환: 글자 시작 x */
  private icon(ic: RowIcon, x: number, y: number): number {
    const g = this.g;
    if (!ic) return x;
    if (ic.kind === 'potion') {
      dot(g, x + 3, y + 3, C('global.outline'), 6, 7);
      dot(g, x + 4, y + 5, C(ic.color), 4, 4);
      dot(g, x + 4, y + 5, C('global.fx.flash'), 1, 1);
      dot(g, x + 5, y + 2, C('global.materials.leather'), 2, 1);
    } else if (ic.kind === 'material') materialIcon(g, x + 3, y + 4);
    // 무기: HUD 슬롯 아이콘의 가운데 12×12 (무기 그림은 가장자리 2px가 비어 있음)
    else if (ic.kind === 'weapon') icon(g, weaponIcon(ic.weapon), x, y, false, 2);
    else if (ic.kind === 'face') {
      // 주민 얼굴 12×11 (hudFace)
      const img = this.scene.add.image(0, 0, '__DEFAULT').setOrigin(0, 0).setScrollFactor(0).setDepth(this.depth + 1);
      setFace(this.scene, img, false, ic.color, x, y + 1, ic.hair);
      this.icons.push(img);
    }
    else {
      const o = islandObjects()[ic.itemId];
      if (!o) dot(g, x + 2, y + 3, C('island.path'), 8, 6);
      else {
        const v = islandView(o, 0), tex = islandTexture(this.scene, ic.itemId, v.frame, v.flip);
        const img = this.scene.add.image(0, 0, tex.key).setOrigin(0, 0).setScrollFactor(0).setDepth(this.depth + 1);
        const s = Math.min(1, 12 / img.width, 12 / img.height), w = Math.floor(img.width * s), h = Math.floor(img.height * s);
        img.setDisplaySize(w, h).setPosition(x + Math.floor((12 - w) / 2), y + Math.floor((12 - h) / 2));
        this.icons.push(img);
      }
    }
    return x + 14;
  }

  private clear(): void {
    this.g.clear();
    this.texts.forEach((t) => t.destroy());
    this.icons.forEach((i) => i.destroy());
    this.texts = [];
    this.icons = [];
    this.hits = [];
  }

  /** 닫기 (다음에 열면 다시 그림) */
  hide(): void {
    this.clear();
    this.sig = '';
  }

  destroy(): void {
    this.clear();
    this.g.destroy();
  }
}
