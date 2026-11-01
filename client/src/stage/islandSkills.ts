// 스킬 창 (K, hud.md 8장, skills.md 1장, 승인 데모 docs/refs/demos/skill_window.html): 상태·입력. 그리기는 ui/skillWindow.ts
// CD-4 카드 창 전까지 옛 창에 실제 보유(서버 cards)를 보여 줌: 없는 카드는 잠김, 점 = 기본(1)·강화(2), 패시브는 + - 로 끼우기·빼기.
// 무기 탭, 계열 A·B 보기(섞어 낄 수 있음), 액티브/패시브 보기, 칸 고르기·마우스 올림 미리 보기, 변형 카드(강화만), 장착(끌어다 놓기 또는 A S D F).
// 임시 팩 열기 버튼·O 키 (CD-5 카드 상점 전까지): 팩 1을 선물 → 조각 → 코인 순으로 사서 열고 결과를 알림에.
// 키: ↑↓←→ 칸 · Tab 액티브/패시브 · B 계열 보기 · + - 패시브 끼우기·빼기 · 1 2 변형 · A S D F 장착 · Q E 무기 · O 팩 열기. 검사는 서버(islandCards), 미리 같은 규칙으로 막고 사유를 보여 줌
import type Phaser from 'phaser';
import {
  ACTIVE_SLOTS, CARD, cardBranch, CARDS, checkEquip, checkVariant, equipLevelOf, MAX_CARD_LEVEL, MVP_WEAPONS, packDef, passiveCost, passiveUsed, PASSIVES, SKILLS, tierOf,
  weaponCards, weaponDef, WEAPONS, WELCOME_PACKS, type Branch, type CardLoadout, type CardMsgFail, type Collection, type S2C,
} from '@game/shared';
import type { IslandConnection } from '../net/islandNet';
import { SK } from '../ui/skillParts';
import { SkillWindow, type NodeInfo, type SkillHit, type SkillSource, type SkillView } from '../ui/skillWindow';

/** 알림 시간 */
const NOTE_MS = 2000;
const SLOT_KEYS = ['KeyA', 'KeyS', 'KeyD', 'KeyF'].slice(0, ACTIVE_SLOTS);
const FAIL_TEXT: Record<CardMsgFail, string> = {
  card: '이 칸에 낄 수 없는 카드입니다', owned: '가진 카드가 아닙니다', variant: '변형은 강화 카드만 고릅니다', cap: '패시브 비용 한도를 넘습니다',
  locked: '아직 숙련도가 모자랍니다', slot: '없는 칸입니다', dust: '조각이 모자랍니다', coin: '코인이 모자랍니다', gift: '선물 팩이 없습니다',
  equipped: '장착한 카드의 마지막 장입니다', busy: '출발 카운트다운 중에는 못 바꿉니다',
};
/** 임시 팩 열기 버튼이 여는 팩 */
const TEMP_PACK = WELCOME_PACKS.pack;
const NOTE_PACK_MS = 5000;
type Weapon = (typeof MVP_WEAPONS)[number];

export class SkillPanel implements SkillSource {
  view: SkillView = 'act';
  sel = '';
  hover: string | null = null;
  hoverBtn: string | null = null;
  note: { text: string; color: string } | null = null;
  private tabIndex = 0;
  private noteUntil = 0;
  private seenSeq = 0;
  private seenPack = 0;
  private pointer = { x: 0, y: 0 };
  private dragging: { id: string; from: number; sx: number; sy: number; moved: boolean } | null = null;
  /** 보고 있는 계열 (무기마다, 계열 선택이 아니라 보기만) */
  private viewBranch: Record<string, Branch> = {};
  private win: SkillWindow;

  constructor(scene: Phaser.Scene, private conn: IslandConnection, depth: number, private locked: () => boolean, private myWeapon: () => string) {
    this.win = new SkillWindow(scene, depth);
  }

  // ---- SkillSource ----
  get tabs(): string[] { return MVP_WEAPONS.map((id) => WEAPONS[id]?.name ?? id); }
  get tab(): number { return this.tabIndex; }
  private get weapon(): Weapon { return MVP_WEAPONS[this.tabIndex] ?? 'greatsword'; }
  private get mine() { return this.conn.cards.weapons.find((w) => w.weapon === this.weapon); }
  private get owned(): Collection { return this.mine?.owned ?? {}; }
  private get loadout(): CardLoadout { return { active: this.slots, passive: this.mine?.passive ?? [] }; }
  get level(): number { return this.mine?.level ?? 1; }
  get sp(): number { return this.mine?.cap ?? 0; }
  get spent(): number { return passiveUsed(this.owned, this.loadout.passive); }
  /** 임시 팩 열기 버튼 글자 */
  get packLabel(): string {
    const c = this.conn.cards;
    return c.gifts > 0 ? `선물 팩 ${c.gifts} (O)` : `조각 ${c.dust} · 팩 (O)`;
  }
  get branch(): Branch { return this.viewBranch[this.weapon] ?? 'A'; }
  get branches() { return weaponDef(this.weapon).branches; }
  get slots(): (string | null)[] { return (this.mine?.active ?? Array<string>(ACTIVE_SLOTS).fill('')).map((id) => id || null); }
  get busy(): boolean { return this.locked(); }
  get drag(): SkillSource['drag'] {
    const d = this.dragging;
    if (!d?.moved) return null;
    const h = this.win.hit(this.pointer.x, this.pointer.y);
    return { id: d.id, from: d.from, target: h?.kind === 'slot' ? h.k : -1 };
  }
  branchColor(b: Branch): string { return `global.ui.skillBranch.${this.weapon}.${b}`; }

  get sections(): SkillSource['sections'] {
    const br = this.branch, name = this.branches?.[br].name ?? br, byTier = (a: string, b: string) => tierOf(a) - tierOf(b);
    const of = (kind: 'active' | 'passive', b: string) => weaponCards(this.weapon, kind).filter((id) => cardBranch(id) === b).sort(byTier);
    if (this.view === 'act') {
      return [
        { label: '기본 스킬', color: SK.key, ids: of('active', 'base') },
        { label: `${name} 액티브`, color: this.branchColor(br), ids: of('active', br) },
      ];
    }
    return [
      { label: '공용 패시브', color: SK.key, ids: of('passive', 'common') },
      { label: `${name} 보조`, color: this.branchColor(br), ids: of('passive', br) },
    ];
  }

  node(id: string): NodeInfo {
    const s = SKILLS[id], pv = PASSIVES[id], br = cardBranch(id), plain = br === 'base' || br === 'common';
    const vars = s?.variants ?? {}, o = this.owned[id], chosen = o?.enhanced ? o.variant : undefined, lv = equipLevelOf(id);
    const has = !!o && (o.enhanced || o.count > 0), open = has && this.level >= lv, level = o?.enhanced ? MAX_CARD_LEVEL : 1;
    const on = pv ? this.loadout.passive.includes(id) : true;
    return {
      id, name: s?.name ?? pv?.name ?? id, open, owned: has, lv, points: open && on ? level : 0, max: MAX_CARD_LEVEL,
      have: !has ? '없음' : o!.enhanced ? `강화${o!.count ? ` +${o!.count}장` : ''}` : `${o!.count}/${CARD.mergeCount}장`,
      passive: !!pv, plain, color: plain ? SK.steel : this.branchColor(br as Branch), variant: chosen ? Object.keys(vars).indexOf(chosen) : -1,
      variants: Object.values(vars).map((v) => ({ name: v.name, desc: v.desc })), desc: s?.desc ?? pv?.desc ?? '', ...(pv ? { pointDesc: pv.pointDesc } : {}), cost: passiveCost(id, false),
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
    this.dragging = null;
  }

  update(width: number, height: number): void {
    // 서버가 거절했으면 잠깐 사유, 팩을 열었으면 결과
    if (this.conn.cardsSeq !== this.seenSeq) {
      this.seenSeq = this.conn.cardsSeq;
      const fail = this.conn.cards.fail;
      if (fail) this.say(FAIL_TEXT[fail], SK.danger);
    }
    if (this.conn.packSeq !== this.seenPack) {
      this.seenPack = this.conn.packSeq;
      const pk = this.conn.lastPack;
      if (pk) this.say(packText(pk), SK.coin, NOTE_PACK_MS);
    }
    const now = Date.now();
    if (this.note && now > this.noteUntil) this.note = null;
    if (!this.grid().some((r) => r.includes(this.sel))) this.sel = this.grid()[0]![0]!;
    const d = this.drag;
    this.win.render(this, JSON.stringify([this.mine, this.tabIndex, this.view, this.sel, this.hover, this.hoverBtn, this.packLabel, d, this.note, this.busy]), width, height);
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
    if (code === 'KeyB') return this.setBranch(this.branch === 'A' ? 'B' : 'A');
    if (code === 'Equal' || code === 'NumpadAdd') return this.wear(this.sel, true);
    if (code === 'Minus' || code === 'NumpadSubtract') return this.wear(this.sel, false);
    if (code === 'Digit1' || code === 'Digit2') return this.variant(Number(code.slice(-1)) - 1);
    if (SLOT_KEYS.includes(code)) return this.equip(this.sel, SLOT_KEYS.indexOf(code));
    if (code === 'KeyQ' || code === 'KeyE') return this.setTab((this.tabIndex + (code === 'KeyQ' ? -1 : 1) + MVP_WEAPONS.length) % MVP_WEAPONS.length);
    if (code === 'KeyO') this.openPack();
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
      if (SKILLS[h.id] && this.node(h.id).open) this.dragging = { id: h.id, from: -1, sx: x, sy: y, moved: false };
    } else if (h.kind === 'slot') {
      const id = this.slots[h.k];
      if (!id) return;
      this.view = 'act';
      this.sel = id;
      this.dragging = { id, from: h.k, sx: x, sy: y, moved: false };
    } else if (h.kind === 'btn') {
      if (h.b === 'reset') this.openPack();
      else this.wear(this.sel, h.b === 'plus');
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
    this.view = 'act';
    this.sel = this.grid()[0]![0]!;
  }

  private setView(v: SkillView): void {
    if (this.view === v) return;
    this.view = v;
    this.sel = this.grid()[0]![0]!;
  }

  /** 막혔으면 사유를 보여 주고 true */
  private blocked(fail: CardMsgFail | null): boolean {
    if (!fail) return false;
    this.say(FAIL_TEXT[fail], SK.danger);
    return true;
  }

  /** 계열 보기 바꾸기 (같은 자리 칸을 계속 고름, 서버에 보내지 않음) */
  private setBranch(b: Branch): void {
    if (!this.branches || b === this.branch) return;
    const at = this.sections[1]?.ids.indexOf(this.sel) ?? -1;
    this.viewBranch[this.weapon] = b;
    const row = this.sections[1]?.ids ?? [];
    if (at >= 0 && row.length) this.sel = row[Math.min(at, row.length - 1)]!;
  }

  /** 패시브 끼우기(끝에)·빼기 */
  private wear(id: string, on: boolean): void {
    if (!PASSIVES[id] || this.blocked(this.busy ? 'busy' : null)) return;
    const at = this.loadout.passive.indexOf(id);
    if (on === at >= 0) return;
    const slot = on ? this.loadout.passive.length : at, cardId = on ? id : null;
    if (this.blocked(checkEquip(this.weapon, this.level, this.owned, this.loadout, 'passive', slot, cardId))) return;
    this.conn.send('card', { op: 'equip', weapon: this.weapon, kind: 'passive', slot, cardId });
  }

  /** 변형 고르기 (같은 것을 다시 누르면 기본 동작) */
  private variant(i: number): void {
    const id = this.sel, n = this.node(id), key = Object.keys(SKILLS[id]?.variants ?? {})[i];
    if (!key) return;
    const variant = n.variant === i ? null : key;
    if (this.blocked(checkVariant(this.owned, id, variant))) return;
    this.conn.send('card', { op: 'variant', cardId: id, variant });
  }

  private equip(id: string, slot: number): void {
    if (this.blocked(this.busy ? 'busy' : checkEquip(this.weapon, this.level, this.owned, this.loadout, 'active', slot, id))) return;
    if (this.slots[slot] !== id) this.conn.send('card', { op: 'equip', weapon: this.weapon, kind: 'active', slot, cardId: id });
  }

  /** 임시 팩 열기 (CD-5 카드 상점 전까지): 지금 무기 팩 1, 선물 → 조각 → 코인 */
  private openPack(): void {
    const c = this.conn.cards, price = packDef(TEMP_PACK)?.price ?? 0;
    const pay = c.gifts > 0 ? 'gift' : c.dust >= price ? 'dust' : 'coin';
    this.conn.send('card', { op: 'open', weapon: this.weapon, pack: TEMP_PACK, pay });
  }

  private say(text: string, color: string, ms = NOTE_MS): void {
    this.note = { text, color };
    this.noteUntil = Date.now() + ms;
  }
}

/** 팩 결과 한 줄: 카드 이름(티어 2 이상), 처음 얻은 카드 NEW, 강화된 카드 */
function packText(p: S2C['pack']): string {
  const name = (id: string) => SKILLS[id]?.name ?? PASSIVES[id]?.name ?? CARDS[id]?.weapon ?? id;
  const list = p.cards.map((c) => `${name(c.id)}${c.tier > 1 ? `(티어${c.tier})` : ''}${c.isNew ? ' NEW' : ''}`).join(', ');
  return `팩: ${list}${p.merged.length ? ` → 강화 ${p.merged.map(name).join(', ')}` : ''}`;
}
