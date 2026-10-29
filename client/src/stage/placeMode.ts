// 배치 모드 (docs/hud.md 8장 배치 모드, island.md 3장): 키보드와 마우스 둘 다
// 방향키·마우스 = 커서, 1~7·Q/E·클릭 = 장식 고르기, Enter·Space·클릭 = 놓기(장식·시설 위면 집어서 옮기기, island.md 2장), R 회전, X 치우기, Esc 취소·나가기
// 클라이언트는 요청만 보내고 결과는 서버 상태로 (같은 칸은 먼저 온 요청만 성공)
import type Phaser from 'phaser';
import { cellOf, facilityAt, facilityName, isFixedFacility, ISLAND, ITEMS, placedAt, type Vec2 } from '@game/shared';
import type { IslandConnection, PlacementSnap } from '../net/islandNet';
import { PlaceTray, TRAY, type TrayItem } from '../ui/placeTray';
import { FLOOR_TOP } from '../view/layout';
import { PlaceOverlay } from '../view/placeOverlay';

const ROW_PX = 10;
const TILE_PX = 16;

export class PlaceMode {
  active = false;
  /** 옮기는 중인 장식 */
  moving: PlacementSnap | null = null;
  /** 옮기는 중인 시설 (dx·dy = 집은 칸 − 시설 왼쪽 위, 커서를 따라 같은 자리를 잡고 다님) */
  movingFacility: { id: string; dx: number; dy: number } | null = null;
  private sel = 0;
  private rot = 0;
  private cursor = { x: 0, y: 0 };
  /** 마지막 마우스 위치 (월드 화면 좌표, 마우스를 안 쓰면 null) */
  private pointer: Vec2 | null = null;
  private tray: PlaceTray;
  private overlay: PlaceOverlay | null = null;

  constructor(private scene: Phaser.Scene, private conn: IslandConnection, private nameOf: (userId: string) => string, depth: number) {
    this.tray = new PlaceTray(scene, depth);
    this.tray.setVisible(false);
  }

  /** 마우스로 커서를 움직이는 중 (카메라는 따라가지 않음) */
  get usingPointer(): boolean {
    return this.pointer !== null;
  }

  /** 카메라가 따라갈 커서 위치 (월드 화면 좌표) */
  get focus(): Vec2 {
    return { x: this.cursor.x * TILE_PX + 8, y: FLOOR_TOP + this.cursor.y * ROW_PX + 5 };
  }

  /** 가방 + 공용 창고 (items.json 순서) */
  items(): TrayItem[] {
    const mine = this.conn.inventory, store = this.conn.storage;
    return Object.keys(ITEMS.decorations).flatMap((id) => [
      ...(mine[id] ? [{ itemId: id, count: mine[id]!, from: 'mine' as const }] : []),
      ...(store[id] ? [{ itemId: id, count: store[id]!, from: 'storage' as const }] : []),
    ]);
  }

  /** 내 캐릭터 앞 칸에서 시작 */
  enter(me: Vec2): void {
    this.active = true;
    this.moving = null;
    this.movingFacility = null;
    const c = cellOf(me);
    this.cursor = { x: c.x, y: c.y - 1 };
    this.pointer = null;
    this.overlay = new PlaceOverlay(this.scene);
    this.tray.setVisible(true);
  }

  exit(): void {
    this.active = false;
    this.moving = null;
    this.movingFacility = null;
    this.overlay?.destroy();
    this.overlay = null;
    this.tray.setVisible(false);
  }

  private clampCursor(): void {
    const g = ISLAND.grid;
    this.cursor.x = Math.max(0, Math.min(g.w - 1, this.cursor.x));
    this.cursor.y = Math.max(0, Math.min(g.h - ISLAND.shoreRows - 1, this.cursor.y));
  }

  /** 키 (Phaser KeyboardEvent.code) */
  onKey(code: string): void {
    if (!this.active) return;
    const n = this.items().length;
    const move = (dx: number, dy: number) => { this.cursor.x += dx; this.cursor.y += dy; this.pointer = null; this.clampCursor(); };
    if (code === 'ArrowLeft' || code === 'KeyA') move(-1, 0);
    else if (code === 'ArrowRight' || code === 'KeyD') move(1, 0);
    else if (code === 'ArrowUp' || code === 'KeyW') move(0, -1);
    else if (code === 'ArrowDown' || code === 'KeyS') move(0, 1);
    else if (code === 'KeyR') this.rot = (this.rot + 1) % 4;
    else if (code === 'KeyQ') this.sel = (this.sel + n - 1) % Math.max(1, n);
    else if (code === 'KeyE') this.sel = (this.sel + 1) % Math.max(1, n);
    else if (/^Digit[1-7]$/.test(code)) this.pick(PlaceTray.firstShown(this.sel, n) + Number(code.slice(5)) - 1);
    else if (code === 'Enter' || code === 'Space') this.act();
    else if (code === 'KeyX') this.remove();
    else if (code === 'Escape') {
      if (this.moving || this.movingFacility) this.moving = this.movingFacility = null;
      else this.exit();
    }
  }

  private pick(i: number): void {
    if (i < this.items().length) {
      this.sel = i;
      this.moving = null;
      this.movingFacility = null;
    }
  }

  /** 마우스 이동 (월드 좌표) */
  onPointerMove(world: Vec2): void {
    if (!this.active) return;
    this.pointer = world;
    this.cursor = { x: Math.floor(world.x / TILE_PX), y: Math.floor((world.y - FLOOR_TOP) / ROW_PX) };
    this.clampCursor();
  }

  /** 마우스 누름: 아래 띠의 장식 칸이면 고르기(true 반환), 아니면 놓기·집기 */
  onPointerDown(screen: Vec2, world: Vec2, bandTop: number): boolean {
    if (!this.active) return false;
    if (screen.y >= bandTop) {
      const i = Math.floor((screen.x - TRAY.x) / TRAY.step);
      if (i >= 0 && i < TRAY.max && screen.x - TRAY.x - i * TRAY.step < TRAY.size) this.pick(PlaceTray.firstShown(this.sel, this.items().length) + i);
      return true;
    }
    this.onPointerMove(world);
    this.act();
    return true;
  }

  /** 놓기: 옮기는 중이면 옮기고, 커서가 시설·장식 위면 집고, 아니면 고른 장식을 놓는다 */
  private act(): void {
    const { x, y } = this.cursor;
    const f = this.movingFacility;
    if (f) {
      this.conn.send('moveFacility', { facilityId: f.id, x: Math.max(0, x - f.dx), y: Math.max(0, y - f.dy) });
      this.movingFacility = null;
      return;
    }
    if (this.moving) {
      this.conn.send('move', { placementId: this.moving.id, x, y, rot: this.rot });
      this.moving = null;
      return;
    }
    const fac = facilityAt(this.conn.facilities, x, y);
    if (fac) {
      if (isFixedFacility(fac.id)) this.conn.onPlaceFail({ op: 'moveFacility', reason: 'fixed' });
      else this.movingFacility = { id: fac.id, dx: x - fac.x, dy: y - fac.y };
      return;
    }
    const under = placedAt(this.conn.placements, x, y);
    if (under) {
      this.moving = this.conn.placements.find((p) => p.id === under.id) ?? null;
      this.rot = under.rot;
      return;
    }
    const it = this.items()[this.sel];
    if (it) this.conn.send('place', { itemId: it.itemId, x, y, rot: this.rot, from: it.from });
  }

  private remove(): void {
    if (facilityAt(this.conn.facilities, this.cursor.x, this.cursor.y)) this.conn.onPlaceFail({ op: 'remove', reason: 'facilityRemove' });
    const under = placedAt(this.conn.placements, this.cursor.x, this.cursor.y);
    if (under) this.conn.send('remove', { placementId: under.id });
    this.moving = this.movingFacility = null;
  }

  /** 프레임마다 (그리기) */
  update(timeSec: number, width: number, bandTop: number, view: { x: number; y: number; w: number; h: number }): void {
    if (!this.active || !this.overlay) return;
    const items = this.items();
    this.sel = Math.max(0, Math.min(this.sel, items.length - 1));
    const it = items[this.sel];
    const mf = this.movingFacility, facilities = this.conn.facilities;
    const holding = mf ? null : this.moving ? { itemId: this.moving.itemId, rot: this.rot, ignoreId: this.moving.id } : it ? { itemId: it.itemId, rot: this.rot } : null;
    const facility = mf && { id: mf.id, x: this.cursor.x - mf.dx, y: this.cursor.y - mf.dy };
    const under = placedAt(this.conn.placements, this.cursor.x, this.cursor.y);
    const p = under && this.conn.placements.find((q) => q.id === under.id);
    const fac = facilityAt(facilities, this.cursor.x, this.cursor.y);
    const tip = this.moving || mf ? null
      : fac ? `${facilityName(fac.id) ?? fac.id} · ${isFixedFacility(fac.id) ? '고정' : '옮기기'}`
      : p ? `${ITEMS.decorations[p.itemId]?.name ?? p.itemId} · ${p.communal ? '공용' : this.nameOf(p.placedBy)}` : null;
    const pointer = this.pointer ?? this.focus;
    this.overlay.draw({ view, placed: this.conn.placements, facilities, cursor: this.cursor, holding, facility, pointer, tip, timeSec });
    this.tray.draw(items, this.sel, this.conn.me.wallet, width, bandTop);
  }
}
