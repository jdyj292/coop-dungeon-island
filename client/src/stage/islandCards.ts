// 카드 창 (K, hud.md 8장, skills.md 1장): 상태·입력. 그리기는 ui/cardWindow.ts(장착 화면)·cardPicker.ts(고르기 창)·cardDetail.ts(상세), 서버 요청은 cardOps.ts
// 장착 화면: 액티브 A S D F 칸 · 패시브 칸을 누르면 그 종류의 고르기 창이 열림 (액티브는 누른 칸에 끼움, 패시브는 끝에 더함).
// 고르기 창: 거르기 탭(전체 · 기본(공용) · 계열들) · 카드 격자(휠·↑↓ 넘기기) · 고른 카드를 다시 누르거나 Z = 끼우기/빼기.
// 키: 방향키 이동 · Z 선택 · X(Esc) 취소. 강화·변형·갈기는 상세 버튼
import type Phaser from 'phaser';
import { ACTIVE_SLOTS, CARD, isActiveCard, MVP_WEAPONS, owns, passiveCap, passiveUsed, weaponCards, WEAPONS, type Branch, type CardLoadout, type Collection } from '@game/shared';
import type { IslandConnection } from '../net/islandNet';
import { SK } from '../ui/cardParts';
import { PICK_COLS, PICK_ROWS, type BonusInfo, type CardHit, type CardInfo, type CardSource, type Picker, TAB_ROW } from '../ui/cardTypes';
import { CardWindow } from '../ui/cardWindow';
import { CardOps, type CardOpsHost } from './cardOps';
import { cardBonus, cardInfo, pickFilters } from './cardView';

/** 알림 시간 */
const NOTE_MS = 2000;
type Weapon = (typeof MVP_WEAPONS)[number];

export class CardPanel implements CardSource, CardOpsHost {
  sel = '';
  hover: string | null = null;
  hoverBtn: string | null = null;
  hoverBonus: Branch | null = null;
  note: { text: string; color: string } | null = null;
  focus = 0;
  picker: Picker | null = null;
  filter = 0;
  scroll = 0;
  pickRow = false;
  readonly merge = CARD.mergeCount;
  readonly enhancedMul = CARD.enhancedMul;
  readonly bonusAt = CARD.branchBonusAt;
  private tabIndex = 0;
  private noteUntil = 0;
  private lastT = performance.now() / 1000;
  private win: CardWindow;
  private ops: CardOps;

  constructor(scene: Phaser.Scene, private conn: IslandConnection, depth: number, private locked: () => boolean, private myWeapon: () => string) {
    this.win = new CardWindow(scene, depth);
    this.ops = new CardOps(this, conn);
  }

  // ---- CardSource · CardOpsHost ----
  get tabs(): string[] { return MVP_WEAPONS.map((id) => WEAPONS[id]?.name ?? id); }
  get tab(): number { return this.tabIndex; }
  get weapon(): Weapon { return MVP_WEAPONS[this.tabIndex] ?? 'greatsword'; }
  get weaponName(): string { return WEAPONS[this.weapon]?.name ?? this.weapon; }
  private get mine() { return this.conn.cards.weapons.find((w) => w.weapon === this.weapon); }
  get coll(): Collection { return this.mine?.owned ?? {}; }
  get loadout(): CardLoadout { return { active: this.active, passive: this.passive }; }
  get level(): number { return this.mine?.level ?? 1; }
  get dust(): number { return this.conn.cards.dust; }
  get cap(): number { return this.mine?.cap ?? passiveCap(this.level); }
  get used(): number { return passiveUsed(this.coll, this.passive); }
  get active(): (string | null)[] { return (this.mine?.active ?? Array<string>(ACTIVE_SLOTS).fill('')).map((id) => id || null); }
  get passive(): string[] { return this.mine?.passive ?? []; }
  get busy(): boolean { return this.locked(); }
  get grindArm(): string | null { return this.ops.grindArm; }
  private get groups() { return pickFilters(this.weapon, this.picker?.kind === 'passive' ? 'pas' : 'act'); }
  get filters(): string[] { return this.groups.map((f) => f.name); }
  get pick(): string[] { return this.groups[this.filter]?.ids ?? []; }
  private get kindCards(): string[] { return this.picker ? weaponCards(this.weapon, this.picker.kind) : weaponCards(this.weapon); }
  get owned(): number { return this.kindCards.filter((id) => owns(this.coll, id)).length; }
  get total(): number { return this.kindCards.length; }
  get bonus(): BonusInfo[] { return cardBonus(this.weapon, this.loadout); }
  card(id: string): CardInfo { return cardInfo(this.weapon, this.level, this.coll, this.loadout, id); }

  say(text: string, color: string): void {
    this.note = { text, color };
    this.noteUntil = Date.now() + NOTE_MS;
  }

  // ---- 열기·그리기 ----
  show(): void {
    this.tabIndex = Math.max(0, (MVP_WEAPONS as readonly string[]).indexOf(this.myWeapon()));
    this.reset();
  }

  update(width: number, height: number): void {
    const done = this.ops.tick();
    if (this.note && Date.now() > this.noteUntil) this.note = null;
    if (!weaponCards(this.weapon).includes(this.sel)) this.sel = this.firstSel();
    this.focus = Math.min(this.focus, this.slotCount() - 1);
    this.win.render(this, JSON.stringify([this.mine, this.conn.cards.dust, this.tabIndex, this.sel, this.hover, this.hoverBtn, this.hoverBonus,
      this.grindArm, this.note, this.busy, this.focus, this.picker, this.filter, this.scroll, this.pickRow]), width, height);
    const t = performance.now() / 1000;
    // 다시 그린 뒤에 번쩍임 (카드 자리가 새 그림 기준)
    if (done) this.win.celebrate(done, t);
    this.win.animate(t, Math.min(0.05, t - this.lastT));
    this.lastT = t;
  }

  hide(): void {
    this.picker = null;
    this.win.hide();
  }

  destroy(): void {
    this.win.destroy();
  }

  // ---- 입력 ----
  /** Esc: 고르기 창이 열려 있으면 닫고 true (아니면 IslandPanels가 카드 창을 닫음) */
  back(): boolean {
    if (!this.picker) return false;
    this.closePicker();
    return true;
  }

  /** 키: 방향키 이동 · Z 선택 (X·Esc 취소는 IslandPanels가 back → 닫기). 강화·갈기·변형은 상세 버튼(마우스) */
  onKey(code: string): void {
    const mv = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, [number, number]>)[code];
    if (mv) return this.picker ? this.movePick(mv[0], mv[1]) : this.moveFocus(mv[0], mv[1]);
    if (code !== 'KeyZ') return;
    if (this.picker) {
      if (this.pickRow) this.pickRow = false;
      else this.choose(this.sel);
    } else if (this.focus >= ACTIVE_SLOTS) this.openPicker('passive', 0, this.focusCard());
    else if (this.focus >= 0) this.openPicker('active', this.focus);
  }

  /** 누름. 패널 밖이면 false (닫기) */
  onPointerDown(x: number, y: number): boolean {
    const h = this.win.hit(x, y);
    if (!h) return false;
    this.click(h);
    return true;
  }

  onPointerMove(x: number, y: number): void {
    const h = this.win.hit(x, y);
    this.hover = h?.kind === 'card' ? h.id : h?.kind === 'aslot' ? this.active[h.k] ?? null : h?.kind === 'pslot' ? this.passive[h.i] ?? null : null;
    this.hoverBtn = !h ? null : h.kind === 'btn' ? h.b : h.kind === 'filter' ? `f${h.i}` : h.kind === 'pclose' ? 'pclose' : h.kind === 'var' ? `var${h.i}` : null;
    this.hoverBonus = h?.kind === 'bonus' ? h.b : null;
  }

  /** 휠: 고르기 창 넘기기 (dy > 0 = 아래로) */
  onWheel(dy: number): void {
    if (!this.picker || !dy) return;
    this.scroll = Math.max(0, Math.min(this.maxScroll(), this.scroll + Math.sign(dy)));
  }

  private click(h: CardHit): void {
    if (h.kind === 'tab') this.setTab(h.i);
    else if (h.kind === 'aslot') {
      // 고르기 창의 장착 중 줄: 거르기·넘김은 그대로 두고 끼울 칸만 바꿈
      if (this.picker?.kind === 'active') { this.picker = { kind: 'active', slot: h.k }; this.focus = h.k; }
      else this.openPicker('active', h.k);
    } else if (h.kind === 'pslot') {
      const id = this.passive[h.i]!;
      this.focus = ACTIVE_SLOTS + h.i;
      if (!this.picker) return this.openPicker('passive', 0, id);
      if (!this.pick.includes(id)) this.setFilter(0);
      this.sel = id;
      this.pickRow = false;
      this.keepVisible();
    }
    else if (h.kind === 'padd') { this.focus = ACTIVE_SLOTS + this.passive.length; this.openPicker('passive', 0); }
    else if (h.kind === 'card') {
      if (this.sel === h.id) this.choose(h.id);
      else this.sel = h.id;
    } else if (h.kind === 'filter') this.setFilter(h.i);
    else if (h.kind === 'pclose') this.closePicker();
    else if (h.kind === 'btn') {
      if (h.b === 'grind') this.ops.grind(this.sel);
      else if (h.b === 'enhance') this.ops.enhance(this.sel);
      else this.choose(this.sel);
    } else if (h.kind === 'var') this.ops.variant(h.i);
  }

  private reset(): void {
    this.picker = null;
    this.focus = 0;
    this.sel = this.firstSel();
    this.hover = this.hoverBtn = this.hoverBonus = null;
  }

  /** 처음 고른 카드: 첫 장착 카드, 없으면 무기의 첫 카드 */
  private firstSel(): string {
    return this.active.find((id) => id) ?? this.passive[0] ?? weaponCards(this.weapon)[0] ?? '';
  }

  private setTab(i: number): void {
    this.tabIndex = i;
    this.reset();
  }

  /** 무기 탭 줄에서 ←→ = 무기 바꾸기 (탭 줄에 그대로) */
  private stepTab(d: number): void {
    this.setTab((this.tabIndex + d + MVP_WEAPONS.length) % MVP_WEAPONS.length);
    this.focus = TAB_ROW;
  }

  // ---- 장착 화면 칸 (TAB_ROW = 무기 탭 줄, 액티브 0~3, 패시브 4~, 끝 = 패시브 + 칸) ----
  private slotCount(): number {
    return ACTIVE_SLOTS + this.passive.length + (this.used < this.cap ? 1 : 0);
  }

  private focusCard(): string | null {
    if (this.focus === TAB_ROW) return null;
    return this.focus < ACTIVE_SLOTS ? this.active[this.focus] ?? null : this.passive[this.focus - ACTIVE_SLOTS] ?? null;
  }

  private moveFocus(dx: number, dy: number): void {
    const pn = this.slotCount() - ACTIVE_SLOTS;
    if (this.focus === TAB_ROW) {
      if (dx) return this.stepTab(dx);
      if (dy > 0) this.focus = 0;
    } else if (dy < 0 && this.focus < ACTIVE_SLOTS) this.focus = TAB_ROW;
    else if (dy < 0 && this.focus >= ACTIVE_SLOTS) this.focus = Math.min(ACTIVE_SLOTS - 1, this.focus - ACTIVE_SLOTS);
    else if (dy > 0 && this.focus < ACTIVE_SLOTS && pn > 0) this.focus = ACTIVE_SLOTS + Math.min(pn - 1, this.focus);
    else if (dx) {
      const [lo, hi] = this.focus < ACTIVE_SLOTS ? [0, ACTIVE_SLOTS - 1] : [ACTIVE_SLOTS, ACTIVE_SLOTS + pn - 1];
      this.focus = Math.max(lo, Math.min(hi, this.focus + dx));
    }
    this.sel = this.focusCard() ?? this.sel;
    this.hover = null;
  }

  // ---- 고르기 창 ----
  /** 고르기 창 열기 (액티브 = 끼울 칸, 패시브 = 끝에). at = 처음 고를 카드 */
  private openPicker(kind: Picker['kind'], slot: number, at?: string | null): void {
    this.picker = { kind, slot };
    this.pickRow = false;
    if (kind === 'active') this.focus = slot;
    this.filter = 0;
    this.scroll = 0;
    const first = at ?? (kind === 'active' ? this.active[slot] : null);
    this.sel = first && this.pick.includes(first) ? first : this.pick[0] ?? this.sel;
    this.hover = null;
    this.keepVisible();
  }

  private closePicker(): void {
    this.picker = null;
    this.sel = this.focusCard() ?? this.sel;
    this.hover = null;
  }

  private setFilter(i: number): void {
    this.filter = i;
    this.scroll = 0;
    if (!this.pick.includes(this.sel)) this.sel = this.pick[0] ?? this.sel;
    this.keepVisible();
  }

  private maxScroll(): number {
    return Math.max(0, Math.ceil(this.pick.length / PICK_COLS) - PICK_ROWS);
  }

  /** 고른 카드가 보이게 넘김 */
  private keepVisible(): void {
    const i = this.pick.indexOf(this.sel);
    if (i < 0) return;
    const row = Math.floor(i / PICK_COLS);
    if (row < this.scroll) this.scroll = row;
    else if (row >= this.scroll + PICK_ROWS) this.scroll = row - PICK_ROWS + 1;
    this.scroll = Math.min(this.scroll, this.maxScroll());
  }

  /** 고르기 창 방향키: 격자 맨 윗줄에서 ↑ = 거르기 탭 줄 (←→ 거르기 바꾸기, ↓ 격자로) */
  private movePick(dx: number, dy: number): void {
    const L = this.pick;
    if (this.pickRow) {
      if (dx) this.setFilter((this.filter + dx + this.filters.length) % this.filters.length);
      else if (dy > 0 && L.length) this.pickRow = false;
      return;
    }
    if (!L.length || (dy < 0 && L.indexOf(this.sel) < PICK_COLS)) return void (this.pickRow = true);
    const j = Math.max(0, L.indexOf(this.sel)) + dx + dy * PICK_COLS;
    this.sel = L[Math.max(0, Math.min(L.length - 1, j))]!;
    this.hover = null;
    this.keepVisible();
  }

  /** 카드 정하기 (고른 카드 다시 누름·Z·끼우기 버튼). 고르기 창: 액티브 = 그 칸에 끼우고 닫음(이미 그 칸이면 빼기), 패시브 = 끼우기/빼기.
   * 장착 화면: 끼운 카드는 빼기, 안 끼운 카드는 빈 칸·끝에 */
  private choose(id: string): void {
    const pk = this.picker, on = this.active.includes(id) || this.passive.includes(id);
    if (pk?.kind === 'active') {
      if (this.active[pk.slot] === id) return this.ops.unequip(id);
      if (this.ops.equipActive(id, pk.slot)) { this.closePicker(); this.sel = id; }
      return;
    }
    if (on) return this.ops.unequip(id);
    if (!isActiveCard(id)) return this.ops.equipPassive(id);
    const k = this.active.indexOf(null);
    if (k < 0) return this.say('빈 칸이 없습니다 · 칸을 눌러 바꿔 끼우기', SK.danger);
    this.ops.equipActive(id, k);
  }
}
