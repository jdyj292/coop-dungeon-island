// 섬 진행 (Colyseus 없이 테스트 가능, docs/network.md 3·5장): 주민 접속·이동, 장식 배치(islandPlacement.ts). 상점·우물은 4-7~4-8
// 60Hz로 각 주민의 마지막 입력을 적용하고 상태(정수 위치)에 반영. 상태는 20Hz로 전송 (IslandRoom)
import { ISLAND, islandBounds, NET, newWalker, parseC2S, placementBlocks, spawnPos, stepWalker, TICK, type WalkInput, type Walker } from '@game/shared';
import type { IslandStore } from '../db/islandStore';
import type { ShopStore } from '../db/shopStore';
import { IslandState, Resident } from '../schema/IslandState';
import { IslandPlacement } from './islandPlacement';
import { dungeonStatus, islandBus } from './islandBus';
import { IslandShop } from './islandShop';
import { IslandWell } from './islandWell';
import { RateLimit } from './rateLimit';

export interface ResidentInfo {
  id: string;
  name: string;
  color: number;
  hair?: number;
  hairColor?: number;
  weapon?: string;
}

export interface IslandOut {
  send: (id: string, type: string, msg: unknown) => void;
  broadcast: (type: string, msg: unknown) => void;
}

interface Live {
  walker: Walker;
  input: WalkInput & { seq: number };
  limit: RateLimit;
}

/** 섬 메시지 제한 (network.md 4장): 이동 초당 30, 배치 등 섬 메시지 초당 5 */
const islandRules = (): Record<string, readonly [number, number]> => {
  const l = NET.limits;
  const island = [1000, l.island] as const;
  return {
    input: [1000, l.input], ping: [1000, l.input], chat: [l.chatWindowMs, l.chatMax], emote: island, look: island, weapon: island,
    place: island, move: island, remove: island, give: island, giveCoins: island, buy: island, board: island, memo: island, well: island,
  };
};

export class IslandGame {
  readonly state = new IslandState();
  private live = new Map<string, Live>();
  private bounds = islandBounds();
  /** 장식 배치 (DB가 있을 때만: 테스트는 이동만 볼 수 있음) */
  readonly placement: IslandPlacement | null = null;
  /** 잡화점·게시판·채팅 (DB가 있을 때만) */
  readonly shop: IslandShop | null = null;
  readonly well: IslandWell;
  /** 방 생성부터의 서버 시각 ms */
  now = 0;

  constructor(name: string, treasury: number, residents: ResidentInfo[], private out: IslandOut, opts: { store?: IslandStore; shopStore?: ShopStore; dev?: boolean; onDepart?: (userIds: string[], floor: string) => void } = {}) {
    this.state.name = name;
    this.state.treasury = treasury;
    for (const r of residents) this.addResident(r);
    this.well = new IslandWell(this.state, out, (id) => this.live.get(id)?.walker.pos, (ids, floor) => {
      for (const id of ids) this.state.residents.get(id)?.assign({ status: dungeonStatus(floor) });
      opts.onDepart?.(ids, floor);
    });
    if (opts.store) {
      this.placement = new IslandPlacement(opts.store, this.state, out, () => [...this.live.values()].map((l) => l.walker.pos), !!opts.dev);
      this.updateBounds();
    }
    if (opts.shopStore) {
      const placement = this.placement;
      this.shop = new IslandShop(opts.shopStore, this.state, out, {
        inventoryChanged: (id) => placement?.sendInventory(id), storageChanged: () => placement?.syncStorage(),
      }, !!opts.dev);
    }
  }

  /** 걸을 수 없는 장식을 장애물로 */
  private updateBounds(): void {
    this.bounds = islandBounds(placementBlocks(this.placement?.placed() ?? []));
  }

  /** 주민 목록에 (새로 가입한 주민 포함) */
  addResident(info: ResidentInfo): void {
    if (this.state.residents.has(info.id)) return;
    const r = new Resident();
    const floor = islandBus.floorOf(info.id);
    Object.assign(r, { id: info.id, name: info.name, color: info.color, hair: info.hair ?? 0, hairColor: info.hairColor ?? 0, weapon: info.weapon ?? 'greatsword', status: floor ? dungeonStatus(floor) : 'away' });
    this.state.residents.set(info.id, r);
  }

  /** 섬에 들어옴: 던전에서 막 나왔으면 우물 앞, 아니면 선착장 (접속한 사람 수로 옆으로, island.md 2장) */
  join(id: string): void {
    const r = this.state.residents.get(id);
    if (!r) return;
    const back = islandBus.takeReturn(id, ISLAND.returnWindowSec * 1000), pos = spawnPos(this.live.size, back ? 'return' : 'login');
    this.live.set(id, { walker: newWalker(pos), input: { mx: 0, my: 0, run: false, seq: 0 }, limit: new RateLimit(islandRules()) });
    Object.assign(r, { online: true, status: 'island', x: Math.round(pos.x), y: Math.round(pos.y), facing: 1, state: 'idle', lastInputSeq: 0, wellAt: back ? Math.max(1, this.now) : 0 });
    this.placement?.sendInventory(id);
    this.shop?.sendMe(id);
  }

  /** 섬을 나감 (끊김·던전 출발). 던전에 간 사람은 "탐험 중" 그대로 */
  leave(id: string): void {
    this.live.delete(id);
    this.well.drop(id);
    const r = this.state.residents.get(id), floor = islandBus.floorOf(id);
    if (r) Object.assign(r, { online: false, status: floor ? dungeonStatus(floor) : 'away', state: 'idle' });
  }

  /** 던전에서 나옴 (섬에 아직 안 들어왔으면 away) */
  returned(ids: string[]): void {
    for (const id of ids) {
      const r = this.state.residents.get(id);
      if (r && !this.live.has(id)) r.status = 'away';
    }
  }

  /** 메시지. 제한을 계속 넘기면 'kick' */
  onMessage(id: string, type: string, raw: unknown): 'kick' | void {
    const l = this.live.get(id);
    if (!l) return;
    if (!l.limit.allow(type, this.now)) return l.limit.shouldKick(this.now) ? 'kick' : undefined;
    if (type === 'input') {
      const m = parseC2S('input', raw);
      if (m && m.seq > l.input.seq) l.input = { mx: m.mx, my: m.my, run: m.run, seq: m.seq };
    } else if (type === 'ping') {
      const m = parseC2S('ping', raw);
      if (m) this.out.send(id, 'pong', { t: m.t, server: this.now });
    } else if (type === 'well') this.well.onMessage(id, raw, this.now);
    else if (this.shop?.onMessage(id, type, raw, Date.now())) {
      // 잡화점·게시판·채팅
    } else if (this.placement?.onMessage(id, type, raw, Date.now())) this.updateBounds();
  }

  tick(): void {
    this.now += TICK * 1000;
    this.well.tick(this.now);
    for (const [id, l] of this.live) {
      stepWalker(l.walker, l.input, TICK, this.bounds);
      const r = this.state.residents.get(id)!, w = l.walker;
      r.x = Math.round(w.pos.x);
      r.y = Math.round(w.pos.y);
      r.facing = w.facing;
      r.state = !w.moving ? 'idle' : w.run.running ? 'run' : 'walk';
      r.lastInputSeq = l.input.seq;
    }
    this.state.serverTime = this.now;
  }

  /** 테스트·디버그용 실제 위치 */
  walkerOf(id: string): Walker | undefined {
    return this.live.get(id)?.walker;
  }
}
