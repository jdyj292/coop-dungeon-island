// 스킬 창 (K, hud.md 8장, skills.md 1장, 승인 데모 docs/refs/demos/skill_window.html): 상태·입력. 그리기는 ui/skillWindow.ts
// 무기 탭, 계열 A·B 고르기(고른 계열만 보임), 액티브/패시브 보기, 칸 고르기·마우스 올림 미리 보기, - + 포인트, 변형 카드, 장착(끌어다 놓기 또는 U I O P), 초기화(두 번).
// 키: ↑↓←→ 칸 · Tab 액티브/패시브 · A B 계열 · + - 포인트 · 1 2 변형 · U I O P 장착 · Q E 무기 · R 초기화. 검사는 서버(islandShop skill), 미리 같은 규칙으로 막고 사유를 보여 줌
import type Phaser from 'phaser';
import {
  branchOf, buildFrom, checkEquip, checkNode, isOpen, maxPointsOf, MVP_WEAPONS, nodeOf, PASSIVES, pointsAt, SKILLS, treeSkills, unlockLevelOf,
  weaponDef, weaponPassives, WEAPONS, type Branch, type Loadout, type NodeFail, type S2C,
} from '@game/shared';
import type { IslandConnection } from '../net/islandNet';
import { SK } from '../ui/skillParts';
import { SkillWindow, type NodeInfo, type SkillHit, type SkillSource, type SkillView } from '../ui/skillWindow';

/** 알림 시간 */
const NOTE_MS = 2000;
const SLOT_KEYS = ['KeyU', 'KeyI', 'KeyO', 'KeyP'];
const FAIL_TEXT: Record<NonNullable<S2C['skills']['fail']> | NodeFail, string> = {
  skill: '이 무기 스킬이 아닙니다', points: '더 올리거나 내릴 수 없습니다', variant: '없는 변형입니다', sp: 'SP가 모자랍니다',
  locked: '아직 레벨이 모자랍니다', branch: '선택한 계열 스킬만 됩니다', slot: '없는 슬롯입니다', busy: '출발 카운트다운 중에는 못 바꿉니다',
};
type Weapon = (typeof MVP_WEAPONS)[number];

export class SkillPanel implements SkillSource {
  view: SkillView = 'act';
  sel = '';
  hover: string | null = null;
  hoverBtn: string | null = null;
  resetArm = false;
  note: { text: string; color: string } | null = null;
  private tabIndex = 0;
  private noteUntil = 0;
  private armUntil = 0;
  private seenSeq = 0;
  private pointer = { x: 0, y: 0 };
  private dragging: { id: string; from: number; sx: number; sy: number; moved: boolean } | null = null;
  /** 계열을 바꿔 서버 값을 기다리는 중: 오면 같은 자리 칸을 고름 */
  private afterBranch: { b: Branch; at: number } | null = null;
  private win: SkillWindow;

  constructor(scene: Phaser.Scene, private conn: IslandConnection, depth: number, private locked: () => boolean, private myWeapon: () => string) {
    this.win = new SkillWindow(scene, depth);
  }

  // ---- SkillSource ----
  get tabs(): string[] { return MVP_WEAPONS.map((id) => WEAPONS[id]?.name ?? id); }
  get tab(): number { return this.tabIndex; }
  private get weapon(): Weapon { return MVP_WEAPONS[this.tabIndex] ?? 'greatsword'; }
  private get mine() { return this.conn.skills.weapons.find((w) => w.weapon === this.weapon); }
  private get build() { return buildFrom(this.mine?.build ?? ''); }
  get level(): number { return this.mine?.level ?? 1; }
  get sp(): number { return this.mine?.sp ?? 0; }
  get spent(): number { return this.mine?.spent ?? 0; }
  get branch(): Branch { return this.mine?.branch ?? 'A'; }
  get branches() { return weaponDef(this.weapon).branches; }
  get slots(): (string | null)[] { return (this.mine?.slots ?? ['', '', '', '']).map((id) => id || null); }
  get busy(): boolean { return this.locked(); }
  get drag(): SkillSource['drag'] {
    const d = this.dragging;
    if (!d?.moved) return null;
    const h = this.win.hit(this.pointer.x, this.pointer.y);
    return { id: d.id, from: d.from, target: h?.kind === 'slot' ? h.k : -1 };
  }
  branchColor(b: Branch): string { return `global.ui.skillBranch.${this.weapon}.${b}`; }

  get sections(): SkillSource['sections'] {
    const w = weaponDef(this.weapon), br = this.branch, name = this.branches?.[br].name ?? br, byLv = (a: string, b: string) => unlockLevelOf(a) - unlockLevelOf(b);
    if (this.view === 'act') {
      return [
        { label: '기본 스킬', color: SK.key, ids: [...w.baseSkills] },
        { label: `${name} 액티브`, color: this.branchColor(br), ids: treeSkills(w).filter((id) => branchOf(id) === br) },
      ];
    }
    const pv = weaponPassives(w);
    return [
      { label: '공용 패시브', color: SK.key, ids: pv.filter((id) => branchOf(id) === 'common').sort(byLv) },
      { label: `${name} 보조`, color: this.branchColor(br), ids: pv.filter((id) => branchOf(id) === br).sort(byLv) },
    ];
  }

  node(id: string): NodeInfo {
    const s = SKILLS[id], pv = PASSIVES[id], br = branchOf(id), plain = br === 'base' || br === 'common';
    const vars = s?.variants ?? {}, chosen = nodeOf(this.build, id).variant;
    return {
      id, name: s?.name ?? pv?.name ?? id, open: isOpen(id, this.level), lv: unlockLevelOf(id), points: pointsAt(this.build, id, this.level), max: maxPointsOf(id),
      passive: !!pv, plain, color: plain ? SK.steel : this.branchColor(br as Branch), variant: chosen ? Object.keys(vars).indexOf(chosen) : -1,
      variants: Object.values(vars).map((v) => ({ name: v.name, desc: v.desc })), desc: s?.desc ?? pv?.desc ?? '', ...(pv ? { pointDesc: pv.pointDesc } : {}),
      slot: this.slots.indexOf(id),
      kind: br === 'base' ? '기본 스킬' : br === 'common' ? '공용 패시브' : `${br} ${this.branches?.[br as Branch].name ?? ''} · ${pv ? '보조' : '액티브'}`,
    };
  }

  // ---- 열기·그리기 ----
  show(): void {
    this.tabIndex = Math.max(0, (MVP_WEAPONS as readonly string[]).indexOf(this.myWeapon()));
    this.view = 'act';
    this.sel = this.grid()[0]![0]!;
    this.hover = this.hoverBtn = null;
    this.resetArm = false;
    this.dragging = null;
    this.afterBranch = null;
  }

  update(width: number, height: number): void {
    // 서버가 거절했으면 잠깐 사유
    if (this.conn.skillsSeq !== this.seenSeq) {
      this.seenSeq = this.conn.skillsSeq;
      const fail = this.conn.skills.fail;
      if (fail) this.say(FAIL_TEXT[fail], SK.danger);
    }
    const now = Date.now();
    if (this.note && now > this.noteUntil) this.note = null;
    if (this.resetArm && now > this.armUntil) this.resetArm = false;
    const ab = this.afterBranch;
    if (ab && this.branch === ab.b) {
      const row = this.sections[1]?.ids ?? [];
      if (ab.at >= 0 && row.length) this.sel = row[Math.min(ab.at, row.length - 1)]!;
      this.afterBranch = null;
    }
    if (!this.afterBranch && !this.grid().some((r) => r.includes(this.sel))) this.sel = this.grid()[0]![0]!;
    const d = this.drag;
    this.win.render(this, JSON.stringify([this.mine, this.tabIndex, this.view, this.sel, this.hover, this.hoverBtn, this.resetArm, d, this.note, this.busy]), width, height);
    this.win.drawGhost(d ? this : null, this.pointer.x, this.pointer.y);
  }

  hide(): void {
    this.dragging = null;
    this.win.hide();
  }

  destroy(): void {
    this.win.destroy();
  }

  // ---- 입력 ----
  /** 키 (Esc는 IslandPanels가 닫음) */
  onKey(code: string): void {
    const mv = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, [number, number]>)[code];
    if (mv) return this.move(mv[0], mv[1]);
    if (code === 'Tab') return this.setView(this.view === 'act' ? 'pas' : 'act');
    if (code === 'KeyA' || code === 'KeyB') return this.setBranch(code === 'KeyA' ? 'A' : 'B');
    if (code === 'Equal' || code === 'NumpadAdd') return this.points(this.sel, 1);
    if (code === 'Minus' || code === 'NumpadSubtract') return this.points(this.sel, -1);
    if (code === 'Digit1' || code === 'Digit2') return this.variant(Number(code.slice(-1)) - 1);
    if (SLOT_KEYS.includes(code)) return this.equip(this.sel, SLOT_KEYS.indexOf(code));
    if (code === 'KeyQ' || code === 'KeyE') return this.setTab((this.tabIndex + (code === 'KeyQ' ? -1 : 1) + MVP_WEAPONS.length) % MVP_WEAPONS.length);
    if (code === 'KeyR') this.reset();
  }

  /** 누름. 패널 밖이면 false (닫기) */
  onPointerDown(x: number, y: number): boolean {
    this.pointer = { x, y };
    const h = this.win.hit(x, y);
    if (!h) return false;
    this.click(h, x, y);
    return true;
  }

  onPointerMove(x: number, y: number): void {
    this.pointer = { x, y };
    const h = this.win.hit(x, y), d = this.dragging;
    this.hover = h?.kind === 'cell' ? h.id : null;
    this.hoverBtn = !h ? null : h.kind === 'btn' ? h.b : h.kind === 'branch' ? `br${h.b}` : h.kind === 'view' ? `v${h.v}` : h.kind === 'var' ? `var${h.i}` : null;
    if (d && !d.moved && Math.abs(x - d.sx) + Math.abs(y - d.sy) > 3) d.moved = true;
  }

  onPointerUp(x: number, y: number): void {
    const d = this.dragging;
    this.dragging = null;
    if (!d?.moved) return;
    const h = this.win.hit(x, y);
    if (h?.kind === 'slot') this.equip(d.id, h.k);
  }

  private click(h: SkillHit, x: number, y: number): void {
    if (h.kind === 'tab') this.setTab(h.i);
    else if (h.kind === 'branch') this.setBranch(h.b);
    else if (h.kind === 'view') this.setView(h.v);
    else if (h.kind === 'cell') {
      this.sel = h.id;
      if (SKILLS[h.id] && isOpen(h.id, this.level)) this.dragging = { id: h.id, from: -1, sx: x, sy: y, moved: false };
    } else if (h.kind === 'slot') {
      const id = this.slots[h.k];
      if (!id) return;
      this.view = 'act';
      this.sel = id;
      this.dragging = { id, from: h.k, sx: x, sy: y, moved: false };
    } else if (h.kind === 'btn') {
      if (h.b === 'reset') this.reset();
      else this.points(this.sel, h.b === 'plus' ? 1 : -1);
    } else if (h.kind === 'var') this.variant(h.i);
  }

  /** 키보드 격자: 위 줄 = 기본·공용, 아래 줄 = 고른 계열 */
  private grid(): string[][] {
    return this.sections.map((s) => s.ids).filter((r) => r.length);
  }

  private move(dx: number, dy: number): void {
    const G = this.grid();
    let ry = Math.max(0, G.findIndex((r) => r.includes(this.sel)));
    let rx = Math.max(0, G[ry]!.indexOf(this.sel));
    if (dy) {
      const ny = Math.max(0, Math.min(G.length - 1, ry + dy));
      rx = Math.round(rx * (G[ny]!.length - 1) / Math.max(1, G[ry]!.length - 1));
      ry = ny;
    } else rx += dx;
    this.sel = G[ry]![Math.max(0, Math.min(G[ry]!.length - 1, rx))]!;
    this.hover = null;
  }

  private setTab(i: number): void {
    this.tabIndex = i;
    this.afterBranch = null;
    this.view = 'act';
    this.sel = this.grid()[0]![0]!;
  }

  private setView(v: SkillView): void {
    if (this.view === v) return;
    this.view = v;
    this.sel = this.grid()[0]![0]!;
  }

  private loadout(): Loadout {
    return { level: this.level, branch: this.branch, slots: this.slots };
  }

  /** 막혔으면 사유를 보여 주고 true */
  private blocked(fail: NodeFail | 'busy' | null): boolean {
    if (!fail) return false;
    this.say(FAIL_TEXT[fail], SK.danger);
    return true;
  }

  private setBranch(b: Branch): void {
    if (!this.branches || b === this.branch || this.blocked(this.busy ? 'busy' : null)) return;
    // 같은 자리 칸을 계속 고름
    const at = this.sections[1]?.ids.indexOf(this.sel) ?? -1;
    this.conn.send('skill', { weapon: this.weapon, op: 'branch', branch: b });
    this.say(`${this.branches[b].name} 계열로 바꿨습니다`, SK.coin);
    this.afterBranch = { b, at };
  }

  private points(id: string, d: number): void {
    const n = this.node(id), points = n.points + d, variant = nodeOf(this.build, id).variant;
    if (this.blocked(this.busy ? 'busy' : null)) return;
    const node = { points, ...(variant ? { variant } : {}) };
    if (this.blocked(checkNode(weaponDef(this.weapon), this.build, id, node, this.sp, this.loadout()))) return;
    this.conn.send('skill', { weapon: this.weapon, op: 'set', skillId: id, ...node });
  }

  private variant(i: number): void {
    const id = this.sel, n = this.node(id), key = Object.keys(SKILLS[id]?.variants ?? {})[i];
    if (!key || this.blocked(this.busy ? 'busy' : !n.open ? 'locked' : null)) return;
    const variant = n.variant === i ? undefined : key, node = { points: n.points, ...(variant ? { variant } : {}) };
    if (this.blocked(checkNode(weaponDef(this.weapon), this.build, id, node, this.sp, this.loadout()))) return;
    this.conn.send('skill', { weapon: this.weapon, op: 'set', skillId: id, ...node });
  }

  private equip(id: string, slot: number): void {
    if (this.blocked(this.busy ? 'busy' : checkEquip(weaponDef(this.weapon), this.loadout(), id, slot))) return;
    if (this.slots[slot] !== id) this.conn.send('skill', { weapon: this.weapon, op: 'equip', skillId: id, slot });
  }

  private reset(): void {
    if (this.blocked(this.busy ? 'busy' : null)) return;
    if (!this.resetArm) {
      this.resetArm = true;
      this.armUntil = Date.now() + NOTE_MS;
      return;
    }
    this.resetArm = false;
    this.conn.send('skill', { weapon: this.weapon, op: 'reset' });
    this.say('포인트·변형을 초기화했습니다', SK.coin);
  }

  private say(text: string, color: string): void {
    this.note = { text, color };
    this.noteUntil = Date.now() + NOTE_MS;
  }
}
