// 섬 패널 (hud.md 8장 패널): 잡화점(물약·장식, 의상은 MVP 이후) / 가방(장식·물약·재료) / 게시판(기록·메모·주민)
// 키: ↑↓ 고르기, ←→ 수량, Q·E·Tab 탭, Enter 사기·메모 쓰기, Esc 닫기 (공동 금고 구매는 확인 한 번). 마우스: 탭·줄·버튼 클릭, 바깥 클릭 닫기
import type Phaser from 'phaser';
import { ISLAND, ITEMS, MVP_WEAPONS, NET, WEAPONS } from '@game/shared';
import type { IslandConnection } from '../net/islandNet';
import { ListPanel, PANEL, type PanelRow, type PanelView } from '../ui/listPanel';
import { ResidentsTab } from './islandResidents';

export type PanelKind = 'shop' | 'bag' | 'board' | 'well';

const TABS: Record<PanelKind, { label: string; disabled?: boolean }[]> = {
  shop: [{ label: '물약' }, { label: '장식' }, { label: '의상', disabled: true }],
  bag: [{ label: '장식' }, { label: '물약' }, { label: '재료' }],
  board: [{ label: '기록' }, { label: '메모' }, { label: '주민' }],
  // 층 선택 (해금된 층만, island.json well.floors)
  well: ISLAND.well.floors.map((f) => ({ label: `${f.replace(/\D/g, '')}층` })),
};
const TITLE: Record<PanelKind, string> = { shop: '잡화점', bag: '가방', board: '게시판', well: '우물' };
const POTION_COLOR: Record<string, string> = { hpPotion: 'global.ui.hp', mpPotion: 'global.ui.mp' };
const VERB: Record<string, string> = {
  found: '섬을 만듦', 'dungeon:clear': '1층 클리어', 'dungeon:return': '1층에서 귀환', 'dungeon:wipe': '1층 전멸', join: '섬에 들어옴', invite: '초대 코드를 바꿈', place: '놓음', move: '옮김', remove: '치움', buy: '삼', treasury: '금고로 삼',
};
const MAX_QTY = 99;
/** 무기 이름·다음 무기 (우물 패널, MVP_WEAPONS 순서로 돎) */
const weaponName = (id = 'greatsword') => WEAPONS[id]?.name ?? id;
const nextWeapon = (id = 'greatsword') => MVP_WEAPONS[(MVP_WEAPONS.indexOf(id as typeof MVP_WEAPONS[number]) + 1) % MVP_WEAPONS.length]!;
/** 게시판 주민 탭 번호 */
const RESIDENTS_TAB = 2;

/** 몇 분 전 */
export function ago(at: number, now: number): string {
  const m = Math.floor((now - at) / 60_000);
  if (m < 1) return '방금';
  if (m < 60) return `${m}분 전`;
  return m < 1440 ? `${Math.floor(m / 60)}시간 전` : `${Math.floor(m / 1440)}일 전`;
}

const itemName = (id: string | null) => (id ? ITEMS.decorations[id]?.name ?? ITEMS.consumables[id]?.name ?? ITEMS.materials[id]?.name ?? id : '');

export class IslandPanels {
  open: PanelKind | null = null;
  private tab = 0;
  private sel = 0;
  private qty = 1;
  /** 공동 금고 구매 확인 중 */
  private confirm = false;
  private panel: ListPanel;
  private residents: ResidentsTab;

  /** writeMemo = 메모 입력창 열기 (DOM, Scene이 띄움) */
  constructor(scene: Phaser.Scene, private conn: IslandConnection, depth: number, private writeMemo: () => void) {
    this.panel = new ListPanel(scene, depth);
    this.residents = new ResidentsTab(conn);
  }

  /** 입장 신청 알림이 옴: 주민 탭을 보고 있으면 새로 */
  onJoinRequest(): void {
    if (this.onResidents()) this.residents.refresh();
  }

  show(kind: PanelKind): void {
    this.open = kind;
    this.tab = 0;
    this.sel = 0;
    this.qty = 1;
    this.confirm = false;
    if (kind === 'board') this.conn.send('board', {});
  }

  private setTab(t: number): void {
    this.tab = t;
    this.sel = 0;
    this.qty = 1;
    this.confirm = false;
    // 신청·기록은 다른 주민이 바꿨을 수 있으니 탭을 열 때마다 새로
    if (this.onResidents()) this.residents.refresh();
    else if (this.open === 'board') this.conn.send('board', {});
  }

  private onResidents(): boolean {
    return this.open === 'board' && this.tab === RESIDENTS_TAB;
  }

  close(): void {
    this.open = null;
    this.panel.hide();
  }

  destroy(): void {
    this.panel.destroy();
  }

  /** 지금 탭의 줄과 줄마다의 품목 id */
  private rows(): { rows: PanelRow[]; ids: string[] } {
    const c = this.conn, wallet = c.me.wallet, treasury = c.island.treasury;
    if (this.open === 'shop') {
      const list = this.tab === 0
        ? Object.entries(ITEMS.consumables).map(([id, d]) => ({ id, name: d.name, price: d.price, communal: false }))
        : Object.entries(ITEMS.decorations).map(([id, d]) => ({ id, name: d.source === 'treasury' ? `${d.name} (금고)` : d.name, price: d.price, communal: d.source === 'treasury' }));
      return {
        ids: list.map((r) => r.id),
        rows: list.map((r) => ({
          icon: POTION_COLOR[r.id] ? { kind: 'potion' as const, color: POTION_COLOR[r.id]! } : { kind: 'deco' as const, itemId: r.id },
          label: r.name, right: String(r.price), coin: true, dim: r.price > (r.communal ? treasury : wallet),
        })),
      };
    }
    if (this.open === 'bag') {
      const inv = c.inventory, src = [ITEMS.decorations, ITEMS.consumables, ITEMS.materials][this.tab]!;
      const ids = Object.keys(src).filter((id) => (inv[id] ?? 0) > 0);
      return {
        ids,
        rows: ids.map((id) => ({
          icon: this.tab === 0 ? { kind: 'deco' as const, itemId: id } : this.tab === 1 ? { kind: 'potion' as const, color: POTION_COLOR[id] ?? 'global.ui.hp' } : { kind: 'material' as const },
          label: itemName(id), right: `X${inv[id]}`,
        })),
      };
    }
    if (this.open === 'well') {
      const w = c.well, res = c.residents.latest?.items;
      return {
        ids: w.members,
        rows: w.members.map((id, i) => ({ icon: { kind: 'face' as const, color: res?.get(id)?.color ?? 0, hair: { style: res?.get(id)?.hair ?? 0, color: res?.get(id)?.hairColor ?? 0 } }, label: `${res?.get(id)?.name ?? '?'}${i === 0 ? ' (대기 시작)' : ''} · ${weaponName(res?.get(id)?.weapon)}` })),
      };
    }
    if (this.onResidents()) {
      const rows = this.residents.rows();
      return { ids: rows.map(() => ''), rows };
    }
    const b = c.board, now = Date.now();
    if (!b) return { ids: [], rows: [] };
    const rows = this.tab === 0
      ? b.log.map((l) => ({ label: `${l.who} · ${l.itemId ? `${itemName(l.itemId)} ` : ''}${VERB[l.action] ?? l.action} · ${ago(l.at, now)}` }))
      : b.memos.map((m) => ({ label: `${m.who}: ${m.text}` }));
    return { ids: rows.map(() => ''), rows };
  }

  private view(): PanelView {
    const kind = this.open!, { rows, ids } = this.rows(), c = this.conn;
    let footer = '', buttons: PanelView['buttons'] = [];
    if (kind === 'shop') {
      const id = ids[this.sel], price = id ? (ITEMS.consumables[id]?.price ?? ITEMS.decorations[id]?.price ?? 0) : 0;
      const communal = !!id && ITEMS.decorations[id]?.source === 'treasury';
      const total = price * this.qty, have = communal ? c.island.treasury : c.me.wallet;
      footer = this.confirm ? `금고에서 ${total} 씁니다` : `${this.qty}개 ${total} · ${communal ? '금고' : '지갑'} ${have}`;
      buttons = this.confirm
        ? [{ id: 'cancel', label: '취소' }, { id: 'buy', label: '확인' }]
        : [{ id: 'minus', label: '-' }, { id: 'plus', label: '+' }, { id: 'buy', label: '사기', disabled: !id || total > have }];
    } else if (kind === 'well') {
      const w = c.well, me = c.userId, mine = w.members.includes(me), left = Math.ceil((w.departAt - c.clock.serverNow()) / 1000);
      footer = w.departAt ? `출발까지 ${Math.max(0, left)}초` : w.members.length ? `${w.members.length}/${ISLAND.well.maxParty}명` : '함께 출발';
      // 무기 버튼: 누르면 다음 무기 (카운트다운 중인 대기자는 못 바꿈)
      const weaponBtn = { id: 'weapon', label: weaponName(c.residents.latest?.items.get(me)?.weapon), disabled: mine && !!w.departAt };
      buttons = !mine ? [weaponBtn, { id: 'join', label: '합류', disabled: w.members.length >= ISLAND.well.maxParty }]
        : [weaponBtn, { id: 'leave', label: '나가기' }, ...(w.members[0] === me && !w.departAt ? [{ id: 'depart', label: w.members.length > 1 ? '출발' : '혼자 출발' }] : [])];
    } else if (this.onResidents()) {
      footer = this.residents.footer();
      buttons = this.residents.buttons(this.sel);
    } else if (kind === 'board' && this.tab === 1) buttons = [{ id: 'memo', label: '메모 쓰기' }];
    else if (kind === 'board') footer = '최근 100건';
    return {
      title: TITLE[kind], tabs: TABS[kind], tab: this.tab, rows, sel: (kind === 'board' && !this.onResidents()) || kind === 'well' ? -1 : Math.min(this.sel, rows.length - 1), footer, buttons,
      ...(kind === 'board' && !this.onResidents() ? { scrollTop: this.sel } : {}),
      empty: this.onResidents() ? '불러오는 중…' : kind === 'board' ? (c.board ? '아직 없습니다' : '불러오는 중…') : kind === 'well' ? '대기 중인 주민이 없습니다' : '비어 있습니다',
    };
  }

  private act(id: string): void {
    if (this.onResidents()) return this.residents.act(id, this.sel);
    const ids = this.rows().ids, item = ids[this.sel];
    if (id === 'minus') this.qty = Math.max(1, this.qty - 1);
    else if (id === 'plus') this.qty = Math.min(MAX_QTY, this.qty + 1);
    else if (id === 'cancel') this.confirm = false;
    else if (id === 'memo') this.writeMemo();
    else if (id === 'weapon') this.conn.send('weapon', { id: nextWeapon(this.conn.residents.latest?.items.get(this.conn.userId)?.weapon) });
    else if (id === 'join' || id === 'leave' || id === 'depart') this.conn.send('well', { op: id, floor: ISLAND.well.floors[this.tab] });
    else if (id === 'buy' && item) {
      if (ITEMS.decorations[item]?.source === 'treasury' && !this.confirm) this.confirm = true;
      else {
        this.conn.send('buy', { itemId: item, count: this.qty });
        this.confirm = false;
      }
    }
  }

  /** 키 (패널이 열려 있으면 모두 여기서) */
  onKey(code: string): void {
    if (!this.open) return;
    const tabs = TABS[this.open], n = this.rows().rows.length;
    const nextTab = (d: number) => {
      let t = this.tab;
      do t = (t + d + tabs.length) % tabs.length; while (tabs[t]!.disabled);
      this.setTab(t);
    };
    if (code === 'Escape') {
      if (this.confirm) this.confirm = false;
      else this.close();
    }
    else if (code === 'ArrowUp' || code === 'KeyW') this.sel = Math.max(0, this.sel - 1);
    else if (code === 'ArrowDown' || code === 'KeyS') this.sel = Math.min(Math.max(0, this.open === 'board' && !this.onResidents() ? n - PANEL.rows : n - 1), this.sel + 1);
    else if (code === 'ArrowLeft' || code === 'KeyA') this.act('minus');
    else if (code === 'ArrowRight' || code === 'KeyD') this.act('plus');
    else if (code === 'KeyQ') nextTab(-1);
    else if (code === 'KeyE' || code === 'Tab') nextTab(1);
    else if (code === 'Enter' || code === 'Space') this.act(this.open === 'board' ? (this.tab === 1 ? 'memo' : this.tab === RESIDENTS_TAB ? 'accept' : '') : this.open === 'shop' ? 'buy' : this.open === 'well' ? this.wellKey() : '');
  }

  /** 마우스 (화면 좌표). 패널이 열려 있으면 true */
  onPointer(x: number, y: number): boolean {
    if (!this.open) return false;
    const h = this.panel.hit(x, y);
    if (h.kind === 'outside') this.close();
    else if (h.kind === 'tab') this.setTab(h.i);
    else if (h.kind === 'row') this.sel = h.i;
    else if (h.kind === 'button') this.act(h.id);
    return true;
  }

  /** 우물 패널 Enter: 합류 → (대기 시작자면) 출발 */
  private wellKey(): string {
    const w = this.conn.well, me = this.conn.userId;
    if (!w.members.includes(me)) return 'join';
    return w.members[0] === me && !w.departAt ? 'depart' : '';
  }

  update(width: number, fieldH: number): void {
    if (this.open) this.panel.render(this.view(), width, fieldH);
  }

  /** 메모 글자 수 (입력창 maxLength) */
  static readonly memoMax = NET.memoMaxLen;
}
