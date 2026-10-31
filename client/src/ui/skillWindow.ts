// 스킬 창 (K) 그리기 (hud.md 8장, 승인 데모 docs/refs/demos/skill_window.html, 게임 화면 384×216 기준 좌표):
// 제목 띠(별·무기 탭·Lv·SP) / 계열 버튼 A·B / 액티브·패시브 보기 탭 / 내용 카드(위 = 기본 스킬·공용 패시브, 아래 = 고른 계열, 열리는 레벨 순 + 진행 선) /
// 장착 칸 U I O P·초기화 / 오른쪽 상세 (skillDetail.ts). 상태·입력은 stage/islandSkills.ts (SkillSource)
import type Phaser from 'phaser';
import type { Branch } from '@game/shared';
import type { FontKey } from './fonts';
import { koWidth } from './koText';
import { drawDetail } from './skillDetail';
import { buttonBox, card, corners, dots, gem, keyTag, lockIcon, nodeArt, Painter, R, SK, star, tiny } from './skillParts';

export type SkillView = 'act' | 'pas';
export type SkillHit =
  | { kind: 'tab'; i: number } | { kind: 'branch'; b: Branch } | { kind: 'view'; v: SkillView } | { kind: 'cell'; id: string } | { kind: 'slot'; k: number }
  | { kind: 'btn'; b: 'minus' | 'plus' | 'reset' } | { kind: 'var'; i: number } | { kind: 'inside' };

/** 노드 하나 (그리기용) */
export interface NodeInfo {
  id: string;
  name: string;
  open: boolean;
  lv: number;
  points: number;
  max: number;
  passive: boolean;
  /** 기본 스킬·공용 패시브 (계열 없음) */
  plain: boolean;
  /** 계열 색 (palette 경로) */
  color: string;
  /** 고른 변형 번호 (-1 = 없음) */
  variant: number;
  variants: { name: string; desc: string }[];
  desc: string;
  pointDesc?: string[];
  /** 장착한 칸 (-1 = 안 함) */
  slot: number;
  kind: string;
}

/** 스킬 창이 그리는 값 (stage/islandSkills.ts SkillPanel) */
export interface SkillSource {
  tabs: string[];
  tab: number;
  level: number;
  sp: number;
  spent: number;
  branch: Branch;
  branches?: Record<Branch, { name: string; desc: string }>;
  branchColor(b: Branch): string;
  view: SkillView;
  sections: { label: string; color: string; ids: string[] }[];
  node(id: string): NodeInfo;
  slots: (string | null)[];
  sel: string;
  hover: string | null;
  hoverBtn: string | null;
  resetArm: boolean;
  /** 끌고 있는 스킬 (움직였을 때만), 놓을 칸 */
  drag: { id: string; from: number; target: number } | null;
  note: { text: string; color: string } | null;
  busy: boolean;
}

const W = 384, H = 216, KEYS = ['U', 'I', 'O', 'P'];
const labW = (t: string, font: FontKey = 'koSmall') => koWidth(t, font);
const BRANCHES: Branch[] = ['A', 'B'];

export class SkillWindow {
  private p: Painter<SkillHit>;
  private ghost: Phaser.GameObjects.Graphics;
  private sig = '';
  private box = { x: 0, y: 0 };

  constructor(scene: Phaser.Scene, depth: number) {
    const g = scene.add.graphics().setScrollFactor(0).setDepth(depth);
    this.p = new Painter<SkillHit>(scene, g, depth);
    this.ghost = scene.add.graphics().setScrollFactor(0).setDepth(depth + 2);
  }

  render(s: SkillSource, sig: string, screenW: number, screenH: number): void {
    const ox = Math.floor((screenW - W) / 2), oy = Math.max(0, Math.floor((screenH - H) / 2));
    const key = `${sig}|${ox}|${oy}|${screenW}|${screenH}`;
    if (key === this.sig) return;
    this.sig = key;
    const p = this.p, g = p.g;
    p.clear();
    p.ox = ox;
    p.oy = oy;
    this.box = { x: ox, y: oy };
    // 패널 안 빈 곳 (판정은 나중에 넣은 것이 위라 맨 먼저)
    p.hit(7, 5, 370, 205, { kind: 'inside' });
    g.setPosition(ox, oy);
    R(g, -ox, -oy, screenW, screenH, SK.cover, 0.5);
    // 패널 + 제목 띠
    R(g, 9, 8, 368, 204, SK.cover, 0.35);
    R(g, 7, 5, 370, 205, SK.shade);
    R(g, 8, 6, 368, 203, SK.border);
    R(g, 9, 7, 366, 201, SK.panel);
    R(g, 9, 7, 366, 1, SK.hi);
    R(g, 9, 8, 366, 15, SK.title);
    R(g, 9, 23, 366, 1, SK.border);
    star(g, 14, 10);
    p.text(23, 9, '스킬', SK.txt, 'ko');
    this.tabs(s);
    this.header(s);
    if (s.branches) this.branchButtons(s);
    this.viewTabs(s);
    this.content(s);
    this.tray(s);
    drawDetail(p, s, s.hover ?? s.sel, (id, x, y, size, big) => this.cell(s, id, x, y, size, big));
  }

  /** 끄는 그림 (마우스를 따라감, 전체를 다시 그리지 않음) */
  drawGhost(s: SkillSource | null, x: number, y: number): void {
    const g = this.ghost;
    g.clear();
    if (!s?.drag) return;
    const n = s.node(s.drag.id);
    nodeArt(g, n.id, x - 11, y - 11, 22, false, 0.9);
  }

  /** 화면 좌표 → 무엇을 눌렀나 (패널 밖이면 null) */
  hit(px: number, py: number): SkillHit | null {
    return this.p.at(px, py);
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

  private tabs(s: SkillSource): void {
    const p = this.p, g = p.g;
    let tx = 52;
    s.tabs.forEach((lab, i) => {
      const on = i === s.tab, tw = Math.max(24, labW(lab) + 14);
      if (on) { R(g, tx, 9, tw, 15, SK.border); R(g, tx + 1, 10, tw - 2, 14, SK.panel); R(g, tx + 1, 10, tw - 2, 1, SK.hi); }
      else { R(g, tx, 11, tw, 12, SK.cardBd); R(g, tx + 1, 12, tw - 2, 10, SK.title); }
      p.center(tx, tw, 12, lab, on ? SK.txt : SK.key);
      p.hit(tx, 9, tw, 14, { kind: 'tab', i });
      tx += tw + 2;
    });
  }

  /** 오른쪽: Lv 알약 + SP 보석 + 남은 SP / 받은 SP */
  private header(s: SkillSource): void {
    const p = this.p, g = p.g, left = s.sp - s.spent, total = `/${s.sp}`;
    let rx = 370 - labW(total);
    p.text(rx, 12, total, SK.key);
    rx -= labW(String(left), 'ko') + 1;
    p.text(rx, 10, String(left), left < 0 ? SK.danger : left > 0 ? SK.coin : SK.dim, 'ko');
    rx -= labW('SP') + 3;
    p.text(rx, 12, 'SP', SK.key);
    rx -= 8;
    gem(g, rx, 12);
    const lv = `Lv ${s.level}`, lw = labW(lv) + 10;
    rx -= lw + 6;
    R(g, rx, 11, lw, 11, SK.border);
    R(g, rx + 1, 12, lw - 2, 9, SK.lit);
    p.text(rx + 5, 12, lv, SK.txt);
  }

  /** 계열 고르기 (하나만): 고른 계열 스킬만 아래에 보임 */
  private branchButtons(s: SkillSource): void {
    const p = this.p, g = p.g;
    BRANCHES.forEach((b, i) => {
      const on = s.branch === b, x = 12 + i * 113, w = 111, y = 27, col = s.branchColor(b), hv = s.hoverBtn === `br${b}`, info = s.branches![b];
      R(g, x + 1, y + 1, w, 22, SK.shade);
      R(g, x, y, w, 22, on ? col : hv ? SK.key : SK.cardBd);
      R(g, x + 1, y + 1, w - 2, 20, SK.title);
      if (on) { R(g, x + 1, y + 1, w - 2, 20, col, 0.25); R(g, x + 1, y + 1, w - 2, 1, SK.flash, 0.15); }
      const a = on ? 1 : 0.65;
      p.text(x + 6, y + 5, b, col, 'ko', a);
      p.text(x + 18, y + 1, info.name, on ? SK.txt : SK.dim, 'koSmall', a);
      p.text(x + 18, y + 11, info.desc, on ? SK.dim : SK.key, 'koSmall', a);
      if (on) for (const [dx, dy] of [[0, 3], [1, 4], [2, 5], [3, 4], [4, 3], [5, 2], [6, 1]] as const) R(g, x + w - 12 + dx, y + 7 + dy, 1, 2, SK.coin);
      else p.hit(x, y, w, 22, { kind: 'branch', b });
    });
  }

  private viewTabs(s: SkillSource): void {
    const p = this.p, g = p.g;
    let vx = 12;
    for (const [v, lab] of [['act', '액티브 스킬'], ['pas', '패시브 스킬']] as const) {
      const tw = labW(lab) + 16, on = s.view === v, hv = s.hoverBtn === `v${v}`;
      if (on) { R(g, vx, 51, tw, 13, SK.border); R(g, vx + 1, 52, tw - 2, 12, SK.card); R(g, vx + 1, 52, tw - 2, 1, SK.hi); }
      else { R(g, vx, 53, tw, 10, hv ? SK.key : SK.cardBd); R(g, vx + 1, 54, tw - 2, 8, SK.title); }
      p.text(vx + 8, on ? 52 : 53, lab, on || hv ? SK.txt : SK.key);
      p.hit(vx, 51, tw, 13, { kind: 'view', v });
      vx += tw + 2;
    }
    const hint = s.view === 'act' ? 'U I O P에 장착' : 'SP로 배우면 켜짐';
    p.text(236 - labW(hint), 53, hint, SK.off);
  }

  /** 내용 카드: 위 = 기본 스킬·공용 패시브, 아래 = 고른 계열 (열리는 레벨 순 + 진행 선) */
  private content(s: SkillSource): void {
    const p = this.p, g = p.g;
    R(g, 13, 64, 224, 104, SK.shade);
    R(g, 12, 63, 224, 104, SK.border);
    R(g, 13, 64, 222, 102, SK.card);
    s.sections.forEach((sec, si) => {
      // 칸 간격: 4개까지 54px, 더 많으면(3단계 스킬) 카드 폭 218px에 나눠 담음
      const step = sec.ids.length > 4 ? Math.floor(218 / sec.ids.length) : 54, pad = (step - 22) >> 1;
      const y0 = 64 + si * 50, cy = y0 + 12, xs = sec.ids.map((_, i) => 16 + i * step);
      if (si) for (let i = 0; i < 218; i += 2) R(g, 15 + i, y0 - 2, 1, 1, SK.cardBd);
      p.text(18, y0, sec.label, sec.color);
      if (si && xs.length > 1) {
        const last = Math.max(-1, ...sec.ids.map((id, i) => (s.node(id).open ? i : -1)));
        R(g, xs[0]! + pad + 11, cy + 11, xs.at(-1)! - xs[0]!, 1, SK.cardBd);
        if (last > 0) R(g, xs[0]! + pad + 11, cy + 11, xs[last]! - xs[0]!, 1, sec.color, 0.8);
      }
      sec.ids.forEach((id, i) => {
        this.cell(s, id, xs[i]! + pad, cy, 22, false);
        this.nameUnder(s, id, xs[i]!, step, cy + 23);
      });
    });
  }

  /** 장착 칸 U I O P + 안내 + 초기화 */
  private tray(s: SkillSource): void {
    const p = this.p, g = p.g;
    card(g, 12, 170, 224, 38);
    p.text(17, 170, '장착', SK.key);
    s.slots.forEach((id, k) => {
      const x = 20 + k * 28, y = 182, tgt = s.drag?.target === k;
      R(g, x + 1, y + 1, 22, 22, SK.shade);
      R(g, x, y, 22, 22, tgt ? SK.coin : SK.key);
      R(g, x + 1, y + 1, 20, 20, SK.title);
      R(g, x + 1, y + 1, 20, 1, SK.cardBd);
      if (id && s.drag?.from !== k) this.art(s.node(id), x, y, 22, false, 1);
      keyTag(g, x - 2, y + 14, KEYS[k]!);
      p.hit(x, y, 22, 22, { kind: 'slot', k });
    });
    p.text(134, 180, '끌어다 놓거나', SK.off);
    p.text(134, 190, '고른 채 U I O P', SK.off);
    const lab = s.resetArm ? '확인?' : '초기화', w = labW(lab) + 12, bx = 231 - w;
    buttonBox(g, bx, 191, w, { hover: s.hoverBtn === 'reset' });
    if (s.resetArm) R(g, bx, 191, 1, 12, SK.danger);
    p.center(bx, w, 191, lab, s.hoverBtn === 'reset' ? SK.coin : SK.txt);
    if (!s.busy) p.hit(bx, 191, w, 12, { kind: 'btn', b: 'reset' });
  }

  /** 칸: 그림자·테두리·볼록, 그림, 잠금(자물쇠 + Lv), 고른 칸 꺾쇠, 변형 점, 장착 키, 포인트 점. big = 상세 머리(판정·꼬리표·점 없음) */
  private cell(s: SkillSource, id: string, x: number, y: number, size: number, big: boolean): void {
    const p = this.p, g = p.g, n = s.node(id), lit = n.open && (!n.passive || n.points > 0);
    const isSel = s.sel === id && !big, isHov = s.hover === id && !big;
    R(g, x + 1, y + 1, size, size, SK.shade);
    R(g, x, y, size, size, isSel ? SK.coin : isHov ? SK.key : lit ? SK.border : SK.cardBd);
    R(g, x + 1, y + 1, size - 2, size - 2, lit ? SK.lit : SK.title);
    R(g, x + 1, y + 1, size - 2, 1, lit ? SK.hi : SK.cardBd);
    if (!n.open) {
      this.art(n, x, y, size, true, 0.12);
      lockIcon(g, x + Math.floor(size / 2) - 2, y + Math.floor(size / 2) - 6, SK.key);
      const t = `Lv${n.lv}`;
      tiny(g, t, x + Math.floor((size - (t.length * 4 - 1)) / 2), y + size - 8, SK.key);
    } else this.art(n, x, y, size, n.passive && n.points === 0, 1);
    if (isSel) corners(g, x, y, size, size, SK.coin);
    if (n.variant >= 0) { R(g, x + size - 6, y + 1, 5, 5, SK.shade); R(g, x + size - 5, y + 2, 3, 3, SK.coin); R(g, x + size - 4, y + 3, 1, 1, SK.white); }
    if (big) return;
    if (n.slot >= 0) keyTag(g, x - 2, y + size - 8, KEYS[n.slot]!);
    if (n.open && n.max > 1) dots(g, x + Math.floor((size - (n.max * 4 - 1)) / 2), y + size - 2, n.max, n.points, SK.coin);
    p.hit(x, y, size, size, { kind: 'cell', id });
  }

  /** 노드 그림, 없으면 이름 첫 글자 */
  private art(n: NodeInfo, x: number, y: number, size: number, gray: boolean, alpha: number): void {
    if (!nodeArt(this.p.g, n.id, x, y, size, gray, alpha)) this.p.center(x, size, y + Math.floor(size / 2) - 6, [...n.name][0] ?? '', gray ? SK.off : SK.dim, 'koSmall', alpha);
  }

  private nameUnder(s: SkillSource, id: string, x: number, w: number, y: number): void {
    const n = s.node(id);
    let t = n.name;
    while (labW(t) > w && t.length > 1) t = t.slice(0, -1);
    this.p.center(x, w, y, t, !n.open ? SK.off : s.sel === id ? SK.coin : SK.dim);
  }

  /** 지금 창 왼쪽 위 (화면 좌표) */
  get origin(): { x: number; y: number } {
    return this.box;
  }
}

