// 카드 창 (K, hud.md 8장, skills.md 1장, 승인 데모 docs/refs/demos/card_window.html): 상태·입력. 그리기는 ui/cardWindow.ts·cardDetail.ts
// 무기 탭, 액티브/패시브 카드 탭, 카드 고르기·마우스 올림 미리 보기, 끌어다 장착(위 칸으로 놓기, 위 칸에서 끌어 내리면 빼기), 변형(강화 액티브), 갈기(두 번 눌러 확인).
// 키: ↑↓←→ 카드 · Tab 액티브/패시브 · Q E 무기 · A S D F 그 칸에 끼우기 · Enter 끼우기/빼기 · X 빼기 · 1 2 변형 · G 갈기. 검사는 서버, 미리 shared 카드 검사로 막음
import type Phaser from 'phaser';
import {
  ACTIVE_SLOTS, CARD, checkEquip, checkGrind, checkVariant, dustOf, equipLevelOf, isActiveCard, MVP_WEAPONS, owns, passiveCap, passiveUsed,
  SKILLS, weaponCards, WEAPONS, type Branch, type CardKind, type CardLoadout, type CardMsgFail, type Collection,
} from '@game/shared';
import type { IslandConnection } from '../net/islandNet';
import { SK } from '../ui/cardParts';
import { PASS_AREA, type BonusInfo, type CardHit, type CardInfo, type CardSource, type CardView } from '../ui/cardTypes';
import { CardWindow } from '../ui/cardWindow';
import { FAIL_TEXT } from './cardText';
import { cardBonus, cardInfo, cardRows } from './cardView';

/** 알림 시간 */
const NOTE_MS = 2000;
const SLOT_KEYS = ['KeyA', 'KeyS', 'KeyD', 'KeyF'].slice(0, ACTIVE_SLOTS);
/** 장착 줄 (끌어 내리면 빼기 판정) */
const EQUIP_ROW = { x: 12, y: 26, w: 224, h: 46 };
type Weapon = (typeof MVP_WEAPONS)[number];

export class CardPanel implements CardSource {
  view: CardView = 'act';
  sel = '';
  hover: string | null = null;
  hoverBtn: string | null = null;
  hoverBonus: Branch | null = null;
  grindArm: string | null = null;
  note: { text: string; color: string } | null = null;
  readonly merge = CARD.mergeCount;
  readonly enhancedMul = CARD.enhancedMul;
  readonly bonusAt = CARD.branchBonusAt;
  private tabIndex = 0;
  private noteUntil = 0;
  private grindUntil = 0;
  private seenSeq = 0;
  /** 갈기를 보낸 뒤 서버 답이 오면 보여 줄 알림 */
  private pending: string | null = null;
  private pointer = { x: 0, y: 0 };
  private dragging: { id: string; from: string; sx: number; sy: number; moved: boolean } | null = null;
  private win: CardWindow;

  constructor(scene: Phaser.Scene, private conn: IslandConnection, depth: number, private locked: () => boolean, private myWeapon: () => string) {
    this.win = new CardWindow(scene, depth);
  }

  // ---- CardSource ----
  get tabs(): string[] { return MVP_WEAPONS.map((id) => WEAPONS[id]?.name ?? id); }
  get tab(): number { return this.tabIndex; }
  private get weapon(): Weapon { return MVP_WEAPONS[this.tabIndex] ?? 'greatsword'; }
  get weaponName(): string { return WEAPONS[this.weapon]?.name ?? this.weapon; }
  private get mine() { return this.conn.cards.weapons.find((w) => w.weapon === this.weapon); }
  private get coll(): Collection { return this.mine?.owned ?? {}; }
  private get loadout(): CardLoadout { return { active: this.active, passive: this.passive }; }
  get level(): number { return this.mine?.level ?? 1; }
  get dust(): number { return this.conn.cards.dust; }
  get cap(): number { return this.mine?.cap ?? passiveCap(this.level); }
  get used(): number { return passiveUsed(this.coll, this.passive); }
  get nextCapLevel(): number {
    for (let l = this.level + 1; l <= 20; l++) if (passiveCap(l) > passiveCap(this.level)) return l;
    return 0;
  }
  get active(): (string | null)[] { return (this.mine?.active ?? Array<string>(ACTIVE_SLOTS).fill('')).map((id) => id || null); }
  get passive(): string[] { return this.mine?.passive ?? []; }
  get busy(): boolean { return this.locked(); }
  get drag(): CardSource['drag'] {
    const d = this.dragging;
    if (!d?.moved) return null;
    const h = this.win.hit(this.pointer.x, this.pointer.y), act = isActiveCard(d.id);
    return { id: d.id, from: d.from, aslot: act && h?.kind === 'aslot' ? h.k : -1, pass: !act && this.win.inside(this.pointer.x, this.pointer.y, PASS_AREA) };
  }
  get rows(): CardSource['rows'] { return cardRows(this.weapon, this.view); }
  get owned(): number { return weaponCards(this.weapon).filter((id) => owns(this.coll, id)).length; }
  get total(): number { return weaponCards(this.weapon).length; }
  get bonus(): BonusInfo[] { return cardBonus(this.weapon, this.loadout); }
  card(id: string): CardInfo { return cardInfo(this.weapon, this.level, this.coll, this.loadout, id); }

  // ---- 열기·그리기 ----
  show(): void {
    this.tabIndex = Math.max(0, (MVP_WEAPONS as readonly string[]).indexOf(this.myWeapon()));
    this.view = 'act';
    this.sel = this.grid()[0]![0]!;
    this.hover = this.hoverBtn = this.hoverBonus = this.grindArm = null;
    this.dragging = null;
  }

  update(width: number, height: number): void {
    // 서버 답: 거절 사유, 갈기 결과, 팩 결과
    if (this.conn.cardsSeq !== this.seenSeq) {
      this.seenSeq = this.conn.cardsSeq;
      const fail = this.conn.cards.fail;
      if (fail) this.say(FAIL_TEXT[fail], SK.danger);
      else if (this.pending) this.say(this.pending, SK.coin);
      this.pending = null;
    }
    const now = Date.now();
    if (this.note && now > this.noteUntil) this.note = null;
    if (this.grindArm && now > this.grindUntil) this.grindArm = null;
    if (!this.grid().some((r) => r.includes(this.sel))) this.sel = this.grid()[0]![0]!;
    const d = this.drag;
    this.win.render(this, JSON.stringify([this.mine, this.conn.cards.dust, this.conn.cards.gifts, this.tabIndex, this.view, this.sel, this.hover, this.hoverBtn, this.hoverBonus,
      this.grindArm, d, this.note, this.busy]), width, height);
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
    if (SLOT_KEYS.includes(code)) {
      if (!isActiveCard(this.sel)) return this.say('A S D F는 액티브 카드 칸입니다 · 패시브는 Enter', SK.danger);
      return this.equipActive(this.sel, SLOT_KEYS.indexOf(code));
    }
    if (code === 'Enter' || code === 'NumpadEnter') return this.toggle(this.sel);
    if (code === 'KeyX' || code === 'Backspace' || code === 'Delete') return this.unequip(this.sel);
    if (code === 'Digit1' || code === 'Digit2') return this.variant(Number(code.slice(-1)) - 1);
    if (code === 'KeyG') return this.grind(this.sel);
    if (code === 'KeyQ' || code === 'KeyE') return this.setTab((this.tabIndex + (code === 'KeyQ' ? -1 : 1) + MVP_WEAPONS.length) % MVP_WEAPONS.length);
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
    this.hover = h?.kind === 'card' ? h.id : h?.kind === 'aslot' ? this.active[h.k] ?? null : h?.kind === 'pslot' ? this.passive[h.i] ?? null : null;
    this.hoverBtn = !h ? null : h.kind === 'btn' ? h.b : h.kind === 'view' ? `v${h.v}` : h.kind === 'var' ? `var${h.i}` : null;
    this.hoverBonus = h?.kind === 'bonus' ? h.b : null;
    if (d && !d.moved && Math.abs(x - d.sx) + Math.abs(y - d.sy) > 3) d.moved = true;
    if (d?.moved) this.hover = null;
  }

  onPointerUp(x: number, y: number): void {
    const d = this.dragging;
    this.dragging = null;
    if (!d?.moved) return;
    const h = this.win.hit(x, y), fromList = d.from === 'list';
    if (isActiveCard(d.id)) {
      if (h?.kind === 'aslot') this.equipActive(d.id, h.k);
      else if (!fromList && !this.win.inside(x, y, EQUIP_ROW)) this.unequip(d.id);
    } else if (this.win.inside(x, y, PASS_AREA)) {
      if (fromList) this.equipPassive(d.id);
    } else if (!fromList) this.unequip(d.id);
  }

  private click(h: CardHit, x: number, y: number): void {
    const drag = (id: string, from: string) => { this.dragging = { id, from, sx: x, sy: y, moved: false }; };
    if (h.kind === 'tab') this.setTab(h.i);
    else if (h.kind === 'view') this.setView(h.v);
    else if (h.kind === 'card') { this.sel = h.id; drag(h.id, 'list'); }
    else if (h.kind === 'aslot') {
      const id = this.active[h.k];
      if (id) { this.view = 'act'; this.sel = id; drag(id, `a${h.k}`); }
    } else if (h.kind === 'pslot') {
      const id = this.passive[h.i];
      if (id) { this.view = 'pas'; this.sel = id; drag(id, `p${h.i}`); }
    } else if (h.kind === 'btn') {
      if (h.b === 'grind') this.grind(this.sel);
      else this.toggle(this.sel);
    } else if (h.kind === 'var') this.variant(h.i);
  }

  /** 키보드 격자: 줄 = 기본·공용 / A / B */
  private grid(): string[][] {
    return this.rows.map((r) => r.ids).filter((r) => r.length);
  }

  private move(dx: number, dy: number): void {
    const G = this.grid();
    let ry = Math.max(0, G.findIndex((r) => r.includes(this.sel)));
    const rx = Math.max(0, G[ry]!.indexOf(this.sel)) + dx;
    ry = Math.max(0, Math.min(G.length - 1, ry + dy));
    this.sel = G[ry]![Math.max(0, Math.min(G[ry]!.length - 1, rx))]!;
    this.hover = null;
  }

  private setTab(i: number): void {
    this.tabIndex = i;
    this.view = 'act';
    this.sel = this.grid()[0]![0]!;
  }

  private setView(v: CardView): void {
    if (this.view === v) return;
    this.view = v;
    this.sel = this.grid()[0]![0]!;
  }

  /** 막혔으면 사유를 보여 주고 true */
  private blocked(fail: CardMsgFail | null): boolean {
    if (!fail) return false;
    this.say(fail === 'locked' ? `장착 Lv${equipLevelOf(this.sel)}부터 낄 수 있습니다` : FAIL_TEXT[fail], SK.danger);
    return true;
  }

  private send(kind: CardKind, slot: number, cardId: string | null): void {
    this.conn.send('card', { op: 'equip', weapon: this.weapon, kind, slot, cardId });
  }

  private equipActive(id: string, slot: number): void {
    if (this.blocked(this.busy ? 'busy' : checkEquip(this.weapon, this.level, this.coll, this.loadout, 'active', slot, id))) return;
    if (this.active[slot] !== id) this.send('active', slot, id);
  }

  /** 패시브 끼우기 (끝에) */
  private equipPassive(id: string): void {
    if (this.passive.includes(id)) return;
    const slot = this.passive.length;
    if (this.blocked(this.busy ? 'busy' : checkEquip(this.weapon, this.level, this.coll, this.loadout, 'passive', slot, id))) return;
    this.send('passive', slot, id);
  }

  private unequip(id: string): void {
    const k = this.active.indexOf(id), j = this.passive.indexOf(id);
    if ((k < 0 && j < 0) || this.blocked(this.busy ? 'busy' : null)) return;
    if (k >= 0) this.send('active', k, null);
    else this.send('passive', j, null);
  }

  /** Enter·끼우기 버튼: 끼운 카드면 빼기, 액티브는 빈 칸에, 패시브는 끝에 */
  private toggle(id: string): void {
    if (this.active.includes(id) || this.passive.includes(id)) return this.unequip(id);
    if (!isActiveCard(id)) return this.equipPassive(id);
    const k = this.active.indexOf(null);
    if (k < 0) return this.say('빈 칸이 없습니다 · A S D F로 바꿔 끼우기', SK.danger);
    this.equipActive(id, k);
  }

  /** 갈기: 남는 장수가 2장 이상이면 모두, 아니면 1장. 두 번 눌러 확인 */
  private grind(id: string): void {
    const o = this.coll[id], n = o?.enhanced && o.count > 1 ? o.count : 1, equipped = this.active.includes(id) || this.passive.includes(id);
    if (this.blocked(this.busy ? 'busy' : checkGrind(this.coll, id, n, equipped))) return;
    if (this.grindArm !== id) {
      this.grindArm = id;
      this.grindUntil = Date.now() + NOTE_MS;
      return;
    }
    this.grindArm = null;
    this.pending = `${this.card(id).name} ${n}장을 갈아 조각 +${dustOf(id) * n}`;
    this.conn.send('card', { op: 'grind', cardId: id, n });
  }

  /** 변형 고르기 (같은 것을 다시 누르면 기본 동작) */
  private variant(i: number): void {
    const id = this.sel, key = Object.keys(SKILLS[id]?.variants ?? {})[i];
    if (!key || this.blocked(this.busy ? 'busy' : null)) return;
    const variant = this.coll[id]?.variant === key ? null : key;
    if (this.blocked(checkVariant(this.coll, id, variant))) return;
    this.conn.send('card', { op: 'variant', cardId: id, variant });
  }

  private say(text: string, color: string): void {
    this.note = { text, color };
    this.noteUntil = Date.now() + NOTE_MS;
  }
}
