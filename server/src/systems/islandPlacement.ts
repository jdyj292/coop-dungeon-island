// 섬 장식 배치·시설 옮기기 (docs/island.md 2·3장, CLAUDE.md 방 구조): 메시지를 받은 순서대로 처리 → 같은 칸은 먼저 온 요청만 성공
// 규칙(shared canPlace·canMoveFacility) 검사 → DB 트랜잭션(IslandStore) → 상태(placements·facilities·storage) 반영 → 바뀐 가방은 본인에게
import { canMoveFacility, canPlace, defaultFacilities, facilitiesWith, ITEMS, parseC2S, type Facility, type Placed, type Vec2 } from '@game/shared';
import type { IslandStore, PlacementRow } from '../db/islandStore';
import { FacilityPos, Placement, type IslandState } from '../schema/IslandState';

export interface PlacementOut {
  send: (userId: string, type: string, msg: unknown) => void;
}

export class IslandPlacement {
  constructor(
    private store: IslandStore,
    private state: IslandState,
    private out: PlacementOut,
    /** 지금 섬에 있는 주민 위치 (걸을 수 없는 장식을 사람 위에 놓지 않게) */
    private residents: () => Vec2[],
    private dev: boolean,
  ) {
    for (const p of store.placements()) this.show(p);
    for (const f of facilitiesWith(store.facilities())) state.facilities.set(f.id, Object.assign(new FacilityPos(), { x: f.x, y: f.y }));
    this.syncStorage();
  }

  /** 이 섬의 시설 위치 (상태에서) */
  facilities(): Facility[] {
    return defaultFacilities().map((f) => {
      const p = this.state.facilities.get(f.id);
      return p ? { ...f, x: p.x, y: p.y } : f;
    });
  }

  /** 상태의 장식 목록 (규칙 검사용) */
  placed(): Placed[] {
    return [...this.state.placements.values()].map((p) => ({ id: p.id, itemId: p.itemId, x: p.x, y: p.y, rot: p.rot }));
  }

  /** 들어온 주민에게 가방 */
  sendInventory(userId: string): void {
    this.out.send(userId, 'inv', { items: this.store.inventory(Number(userId)) });
  }

  /** 섬 메시지. 배치가 바뀌었으면 true (걷기 장애물 다시 계산) */
  onMessage(userId: string, type: string, raw: unknown, now: number): boolean {
    const uid = Number(userId);
    const fail = (op: 'place' | 'move' | 'remove' | 'moveFacility', reason: string) => { this.out.send(userId, 'placeFail', { op, reason }); return false; };
    switch (type) {
      case 'place': {
        const m = parseC2S('place', raw);
        if (!m) return false;
        const def = ITEMS.decorations[m.itemId];
        if (!def) return fail('place', 'unknown');
        const why = canPlace(m.itemId, m.x, m.y, m.rot, this.placed(), this.residents(), undefined, this.facilities());
        if (why) return fail('place', why);
        const row = this.store.place(uid, m.itemId, m.x, m.y, m.rot, m.from, now);
        if (!row) return fail('place', 'none');
        this.show(row);
        if (m.from === 'storage') this.syncStorage();
        else this.sendInventory(userId);
        return true;
      }
      case 'move': {
        const m = parseC2S('move', raw);
        const p = m && this.state.placements.get(m.placementId);
        if (!m || !p) return m ? fail('move', 'gone') : false;
        const why = canPlace(p.itemId, m.x, m.y, m.rot, this.placed(), this.residents(), p.id, this.facilities());
        if (why) return fail('move', why);
        if (!this.store.move(uid, Number(p.id), m.x, m.y, m.rot, now)) return fail('move', 'gone');
        Object.assign(p, { x: m.x, y: m.y, rot: m.rot });
        return true;
      }
      case 'moveFacility': {
        const m = parseC2S('moveFacility', raw);
        if (!m) return false;
        const why = canMoveFacility(m.facilityId, m.x, m.y, this.facilities(), this.placed(), this.residents());
        if (why) return fail('moveFacility', why);
        this.store.moveFacility(uid, m.facilityId, m.x, m.y, now);
        this.state.facilities.get(m.facilityId)?.assign({ x: m.x, y: m.y });
        return true;
      }
      case 'remove': {
        const m = parseC2S('remove', raw);
        if (!m) return false;
        const row = this.state.placements.has(m.placementId) ? this.store.remove(uid, Number(m.placementId), now) : null;
        if (!row) return fail('remove', 'gone');
        this.state.placements.delete(m.placementId);
        if (row.communal || row.placedBy === null) this.syncStorage();
        else this.sendInventory(String(row.placedBy));
        return true;
      }
      case 'give': {
        const m = parseC2S('give', raw);
        if (!m || !this.dev || !ITEMS.decorations[m.itemId]) return false;
        this.store.give(uid, m.itemId, m.count);
        this.sendInventory(userId);
        return false;
      }
    }
    return false;
  }

  private show(r: PlacementRow): void {
    const p = new Placement();
    Object.assign(p, { id: String(r.id), itemId: r.itemId, x: r.x, y: r.y, rot: r.rot, placedBy: r.placedBy === null ? '' : String(r.placedBy), communal: r.communal });
    this.state.placements.set(p.id, p);
  }

  /** 공용 창고 개수를 상태에 (구매로 바뀌었을 때도) */
  syncStorage(): void {
    const s = this.store.storage();
    for (const k of [...this.state.storage.keys()]) if (!(k in s)) this.state.storage.delete(k);
    for (const [k, v] of Object.entries(s)) this.state.storage.set(k, v);
  }
}
