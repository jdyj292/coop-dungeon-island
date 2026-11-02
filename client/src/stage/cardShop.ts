// 카드 상점 화면 (섬 카드 상점 앞 E, island.md 5장, hud.md 8장, 승인 데모 docs/refs/demos/card_shop.html): 상태·입력·card 메시지.
// 그리기는 ui/cardShopScreen.ts(배경·카드팩·지정 구매)·stage/cardShopOpen.ts(팩 열기 연출). 384×216 캔버스 텍스처 하나에 매 프레임 그림.
// 키: 1 2 탭 · Q E 무기 · ↑↓ 팩 / ↑↓←→ 카드 · Tab 액티브/패시브 · Enter 열기(선물 → 코인 → 조각)·사기 · Esc 닫기. 팩을 여는 중: Enter·←→·A, 끝나면 Enter. 강화는 카드 창(K)
import Phaser from 'phaser';
import {
  CARD, MVP_WEAPONS, PACK_NUMBERS, packDef, packOpen, tierDef, tierOf, weaponCards, WEAPONS, WELCOME_PACKS, type Collection,
} from '@game/shared';
import { music } from '../audio/bgm/music';
import { sfx } from '../audio/player';
import type { IslandConnection } from '../net/islandNet';
import { colorInt } from '../palette';
import { background, buyMenu, packMenu, SH, SIDE, SW, titleBand, weaponTabs, type PackRow, type ShopHit, type ShopTab, type ShopView } from '../ui/cardShopScreen';
import type { CardInfo } from '../ui/cardTypes';
import { packArt } from '../ui/shopCards';
import { ShopFx } from '../ui/shopFx';
import { Pix, SC } from '../ui/shopPix';
import { PackOpening } from './cardShopOpen';
import { FAIL_TEXT } from './cardText';
import { cardInfo, cardRows } from './cardView';

type Pay = 'gift' | 'coin' | 'dust';
let serial = 0;

export class CardShop {
  private tex: Phaser.Textures.CanvasTexture;
  private img: Phaser.GameObjects.Image;
  private cover: Phaser.GameObjects.Rectangle;
  private p: Pix<ShopHit>;
  private fx = new ShopFx();
  private visible = false;
  private tab: ShopTab = 'pack';
  private wi = 0;
  private selPack = PACK_NUMBERS[0] ?? 1;
  private view: 'active' | 'passive' = 'active';
  private sel = '';
  private hover: string | null = null;
  private opening: PackOpening | null = null;
  /** 지정 구매 결과 (merged = 그 장으로 강화됨) */
  private bought: { id: string; t0: number; fired: boolean; merged: boolean } | null = null;
  private pending: { kind: 'open' | 'craft'; seq: number; packSeq: number; id?: string } | null = null;
  private note: { text: string; color: string; until: number } | null = null;
  /** 무기|팩 → 천장 횟수 (마지막으로 연 팩에서) */
  private pity = new Map<string, number>();
  private ox = 0; private oy = 0;
  private last = 0;
  /** 씬이 끝날 때는 img가 먼저 파괴돼 img.scene이 없다 → 텍스처 관리자를 따로 들고 있는다 */
  private textures: Phaser.Textures.TextureManager;

  constructor(scene: Phaser.Scene, private conn: IslandConnection, depth: number, private myWeapon: () => string) {
    const key = `cardShop${serial++}`;
    this.textures = scene.textures;
    this.tex = scene.textures.createCanvas(key, SW, SH)!;
    this.p = new Pix<ShopHit>(this.tex.context);
    this.cover = scene.add.rectangle(0, 0, 1, 1, colorInt(SC.cover), 0.5).setOrigin(0).setScrollFactor(0).setDepth(depth).setVisible(false);
    this.img = scene.add.image(0, 0, key).setOrigin(0).setScrollFactor(0).setDepth(depth + 1).setVisible(false);
  }

  private get weapon(): string { return MVP_WEAPONS[this.wi] ?? 'greatsword'; }
  private get mine() { return this.conn.cards.weapons.find((w) => w.weapon === this.weapon); }
  private get coll(): Collection { return this.mine?.owned ?? {}; }
  private get now(): number { return performance.now() / 1000; }
  /** 상점 카드 = 팩·지정 구매로 받는 기본 카드: 강화 표시 없음 (강화했는지는 done) */
  private info = (id: string): CardInfo => {
    const m = this.mine;
    return { ...cardInfo(this.weapon, m?.level ?? 1, this.coll, { active: (m?.active ?? []).map((x) => x || null), passive: m?.passive ?? [] }, id), enhanced: false };
  };
  /** 이미 강화한 카드 (지정 구매 못 함) */
  private done = (id: string): boolean => !!this.coll[id]?.enhanced;

  show(): void {
    this.visible = true;
    this.wi = Math.max(0, MVP_WEAPONS.indexOf(this.myWeapon() as (typeof MVP_WEAPONS)[number]));
    this.last = this.now;
    music.play('cardshop');
    this.img.setVisible(true); this.cover.setVisible(true);
  }

  hide(): void {
    if (this.visible) music.play('island');
    this.visible = false;
    this.opening = null; this.bought = null;
    this.fx.clear();
    this.img.setVisible(false); this.cover.setVisible(false);
  }

  destroy(): void {
    const key = this.tex.key;
    this.img.destroy();
    this.cover.destroy();
    this.textures.remove(key);
  }

  /** 팩을 여는 중 (닫기·탭 바꾸기 막음) */
  private get busy(): boolean { return !!this.opening; }

  private say(text: string, color: string = SC.danger): void {
    this.note = { text, color, until: this.now + 2 };
  }

  private packs(): PackRow[] {
    const lv = this.mine?.level ?? 1;
    return PACK_NUMBERS.map((n) => {
      const d = packDef(n)!, pt = d.pity;
      return {
        n, open: packOpen(n, lv), unlockLevel: d.unlockLevel, price: d.price, size: d.size, minTier: d.minTier, maxTier: d.maxTier, odds: d.odds,
        lastMinTier: d.lastMinTier, color: `global.ui.card.${d.color}`,
        pity: pt ? { tier: pt.tier, packs: pt.packs, has: weaponCards(this.weapon).some((id) => tierOf(id) === pt.tier), count: this.pity.get(`${this.weapon}|${n}`) ?? null } : null,
      };
    });
  }

  private rows(): ShopView['rows'] {
    return cardRows(this.weapon, this.view === 'active' ? 'act' : 'pas').filter((r) => r.ids.length).map((r) => ({ name: r.name, color: r.color, ids: r.ids }));
  }

  private shopView(now: number): ShopView {
    const rows = this.rows();
    if (!rows.some((r) => r.ids.includes(this.sel))) this.sel = rows[0]?.ids[0] ?? '';
    return {
      tab: this.tab, weapons: MVP_WEAPONS.map((id) => ({ id, name: WEAPONS[id]?.name ?? id })), weapon: this.weapon, opening: this.busy,
      coin: this.conn.me.wallet, dust: this.conn.cards.dust, gifts: this.conn.cards.gifts, giftPack: WELCOME_PACKS.pack, packs: this.packs(), selPack: this.selPack,
      view: this.view, rows, sel: this.sel, hover: this.hover, merge: CARD.mergeCount, info: this.info, done: this.done,
      bought: this.bought ? { id: this.bought.id, t: now - this.bought.t0 } : null,
    };
  }

  // ---- 서버 ----
  private openPack(pay: Pay): void {
    const k = this.packs().find((o) => o.n === this.selPack), c = this.conn;
    if (!k?.open) return;
    if (pay === 'gift' ? !(k.n === WELCOME_PACKS.pack && c.cards.gifts > 0) : pay === 'coin' ? c.me.wallet < k.price : c.cards.dust < k.price) return;
    this.pending = { kind: 'open', seq: c.cardsSeq, packSeq: c.packSeq };
    this.opening = new PackOpening(k.n, pay, k.color, this.now, structuredClone(this.coll));
    c.send('card', { op: 'open', weapon: this.weapon as (typeof MVP_WEAPONS)[number], pack: k.n, pay });
  }

  private buy(): void {
    const f = this.info(this.sel), c = this.conn;
    if (!this.sel || c.cards.dust < f.craft || this.done(this.sel) || this.pending) return;
    this.pending = { kind: 'craft', seq: c.cardsSeq, packSeq: c.packSeq, id: this.sel };
    c.send('card', { op: 'craft', cardId: this.sel });
  }

  private netUpdate(now: number): void {
    const q = this.pending, c = this.conn;
    if (!q) return;
    if (q.kind === 'open' && c.packSeq > q.packSeq && c.lastPack) {
      this.pending = null;
      this.opening?.setResult(c.lastPack.cards);
      this.pity.set(`${c.lastPack.weapon}|${c.lastPack.pack}`, c.lastPack.pity);
    } else if (c.cardsSeq > q.seq && (q.kind === 'craft' || c.cards.fail)) {
      this.pending = null;
      if (c.cards.fail) { if (q.kind === 'open') this.opening = null; return this.say(FAIL_TEXT[c.cards.fail]); }
      this.bought = { id: q.id!, t0: now, fired: false, merged: this.done(q.id!) };
    }
  }

  // ---- 매 프레임 ----
  update(width: number, height: number): void {
    if (!this.visible) return;
    const now = this.now, dt = Math.min(0.05, now - this.last);
    this.last = now;
    this.ox = Math.floor((width - SW) / 2);
    this.oy = Math.max(0, Math.floor((height - SH) / 2));
    this.cover.setSize(width, height);
    this.netUpdate(now);
    this.fx.step(dt);
    this.opening?.update(now, dt, this.fx, this.info);
    const op = this.opening;
    // 확인·한 팩 더 (갈릴 카드가 있으면 갈리는 연출이 끝난 뒤)
    if (op?.stage === 'closed') {
      this.opening = null;
      if (op.after === 'again') this.openPack(op.pay);
    }
    music.setLevel(this.opening?.music || 1);
    const b = this.bought;
    if (b && !b.fired && now - b.t0 >= 0.3) {
      b.fired = true; sfx.play('card_buy');
      const t = tierOf(b.id), cx = SIDE.x + SIDE.w / 2, cy = SIDE.y + 38 + 32;
      this.fx.burst(cx, cy, t <= 1 ? 6 : t === 2 ? 14 : 26, t <= 1 ? SC.dust : `global.ui.card.${tierDef(t)?.color ?? 'tier1'}`, t >= 3 ? 1.6 : 1);
      if (t >= 3) this.fx.shake = 0.25;
      // 3장째를 사서 바로 강화됨
      if (b.merged) { sfx.play('card_merge'); this.fx.burst(cx, cy, 22, SC.coin, 1.3, 0.3); this.say(`${this.info(b.id).name} 3장 모임 · 강화!`, SC.coin); }
    }
    const o = this.fx.offset();
    this.img.setPosition(this.ox + o.x, this.oy + o.y);
    this.draw(now);
    this.tex.refresh();
  }

  private draw(now: number): void {
    const p = this.p, v = this.shopView(now), op = this.opening;
    p.hits = [];
    p.ctx.clearRect(0, 0, SW, SH);
    background(p);
    titleBand(p, v);
    if (op) op.draw(p, now, this.info, () => this.openSide(op));
    else if (this.tab === 'pack') packMenu(p, v, now);
    else buyMenu(p, v, now);
    if (op?.stage === 'done') this.doneButtons(op);
    this.fx.draw(p);
    const n = this.note;
    if (n && now < n.until) {
      const tw = p.width(n.text) + 12, x = 102 + Math.floor((276 - tw) / 2);
      p.R(x, 170, tw, 13, SC.shade);
      p.text(n.text, x + 6, 171, n.color);
    }
  }

  /** 여는 중 왼쪽 판: 무기 · 연 팩 · 도움말 */
  private openSide(op: PackOpening): void {
    const p = this.p, L = SIDE, k = this.packs().find((o) => o.n === op.pack);
    weaponTabs(p, this.shopView(this.now), L.y + 4);
    packArt(p, L.x + 9, L.y + 26, 16, 24, op.pack, op.packColor);
    p.text(`팩 ${op.pack}`, L.x + 30, L.y + 26, SC.txt);
    p.text(op.pay === 'gift' ? '선물' : `${op.pay === 'coin' ? '코인' : '조각'} ${k?.price ?? ''}`, L.x + 30, L.y + 40, SC.key);
    const help = op.stage === 'backs' ? ['← → 고르기', 'Enter 뒤집기', 'A 모두 뒤집기', '', '마우스를 올리면', '뒷면이 티어 색으로', '빛나요']
      : op.stage === 'ready' ? ['클릭 · Enter', '팩 흔들어 찢기'] : op.stage === 'done' ? ['Enter 확인'] : [];
    help.forEach((l, i) => p.text(l, L.x + 5, L.y + 64 + i * 11, SC.off));
  }

  private doneButtons(op: PackOpening): void {
    const k = this.packs().find((o) => o.n === op.pack), c = this.conn, by = 28 + 182 - 22, cx = 102 + 138;
    const can = op.pay === 'gift' ? c.cards.gifts > 0 : op.pay === 'coin' ? c.me.wallet >= (k?.price ?? 0) : c.cards.dust >= (k?.price ?? 0);
    const label = op.pay === 'gift' ? `선물 팩 하나 더 (${c.cards.gifts})` : `한 팩 더 (${k?.price ?? 0})`;
    this.p.button('again', label, cx - 104, by, 100, { kind: 'btn', b: 'again' }, { off: !can, ...(op.pay === 'gift' ? {} : { ico: op.pay }) });
    this.p.button('ok', '확인 (Enter)', cx + 4, by, 100, { kind: 'btn', b: 'ok' });
  }

  // ---- 입력 ----
  private local(x: number, y: number) { return { x: x - this.ox, y: y - this.oy }; }

  /** 누름. 화면 안이면 true (밖이면 패널이 닫음, 여는 중에는 닫지 않음) */
  onPointerDown(x: number, y: number): boolean {
    const l = this.local(x, y), h = this.p.at(l.x, l.y);
    this.act(h);
    return !!h || this.busy;
  }

  onPointerMove(x: number, y: number): void {
    const l = this.local(x, y), h = this.p.at(l.x, l.y);
    this.p.hoverBtn = h?.kind === 'btn' ? h.b : null;
    this.hover = h?.kind === 'card' ? h.id : null;
    if (this.opening) this.opening.hov = h?.kind === 'flip' ? h.i : -1;
  }

  private act(h: ShopHit | null): void {
    const op = this.opening, now = this.now;
    if (op) {
      if (h?.kind === 'btn' && (h.b === 'ok' || h.b === 'again')) return op.confirm(h.b, now);
      return op.onHit(h, now);
    }
    if (!h) return;
    if (h.kind === 'tab') this.tab = h.t;
    else if (h.kind === 'weapon') this.wi = Math.max(0, MVP_WEAPONS.indexOf(h.w as (typeof MVP_WEAPONS)[number]));
    else if (h.kind === 'pack') this.selPack = h.n;
    else if (h.kind === 'view') this.view = h.v;
    else if (h.kind === 'card') this.sel = h.id;
    else if (h.kind === 'btn' && (h.b === 'gift' || h.b === 'coin' || h.b === 'dust')) this.openPack(h.b);
    else if (h.kind === 'btn' && h.b === 'buy') this.buy();
  }

  /** 키. false = 닫기 */
  onKey(code: string): boolean {
    const op = this.opening, now = this.now, enter = code === 'Enter' || code === 'Space';
    if (op) {
      if (op.stage === 'done' && (enter || code === 'Escape')) op.confirm('ok', now);
      else op.onKey(code, now);
      return true;
    }
    if (code === 'Escape') return false;
    if (code === 'Digit1' || code === 'Digit2') this.tab = code === 'Digit1' ? 'pack' : 'buy';
    else if (code === 'KeyQ' || code === 'KeyE') this.wi = (this.wi + (code === 'KeyQ' ? MVP_WEAPONS.length - 1 : 1)) % MVP_WEAPONS.length;
    else if (this.tab === 'pack') this.packKey(code, enter);
    else this.buyKey(code, enter);
    return true;
  }

  private packKey(code: string, enter: boolean): void {
    const i = PACK_NUMBERS.indexOf(this.selPack);
    if (code === 'ArrowUp' || code === 'ArrowDown') this.selPack = PACK_NUMBERS[Math.max(0, Math.min(PACK_NUMBERS.length - 1, i + (code === 'ArrowUp' ? -1 : 1)))]!;
    else if (enter) {
      const k = this.packs().find((o) => o.n === this.selPack), c = this.conn;
      if (!k) return;
      this.openPack(k.n === WELCOME_PACKS.pack && c.cards.gifts > 0 ? 'gift' : c.me.wallet >= k.price ? 'coin' : 'dust');
    }
  }

  private buyKey(code: string, enter: boolean): void {
    if (enter) return this.buy();
    if (code === 'Tab') return void (this.view = this.view === 'active' ? 'passive' : 'active');
    const G = this.rows().map((r) => r.ids), d = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[code];
    if (!d) return;
    let ry = Math.max(0, G.findIndex((r) => r.includes(this.sel)));
    const rx = Math.max(0, G[ry]!.indexOf(this.sel)) + d[0]!;
    ry = Math.max(0, Math.min(G.length - 1, ry + d[1]!));
    this.sel = G[ry]![Math.max(0, Math.min(G[ry]!.length - 1, rx))]!;
  }
}
