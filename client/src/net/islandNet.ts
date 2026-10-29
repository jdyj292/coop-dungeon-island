// 섬 방 접속 (docs/network.md 3·5장): 세션 쿠키로 입장, 주민 상태 → 스냅샷 버퍼(다른 주민 보간), 본인 값 메시지
// 끊기면 2초마다 다시 입장 (섬 변경은 즉시 DB에 저장되므로 새로 들어가 전체 상태를 받으면 된다, network.md 10장)
import { Client, type Room } from 'colyseus.js';
import { facilitiesWith, NET, type C2SMessage, type C2SType, type Facility, type S2C } from '@game/shared';
import { ServerClock } from './clock';
import { serverUrl } from './connection';
import { SnapshotBuffer, type Pos } from './interp';

export interface ResidentSnap extends Pos {
  id: string;
  name: string;
  color: number;
  /** 머리 모양·머리색 번호 (view/look.ts) */
  hair: number;
  hairColor: number;
  /** 고른 무기 (우물 패널) */
  weapon: string;
  online: boolean;
  status: string;
  facing: number;
  state: string;
  lastInputSeq: number;
  /** 우물 앞으로 들어온 서버 시각 (ms, 0 = 선착장 입장) */
  wellAt: number;
}

/** 놓인 장식 (상태 그대로, 보간 없음) */
export interface PlacementSnap {
  id: string;
  itemId: string;
  x: number;
  y: number;
  rot: number;
  placedBy: string;
  communal: boolean;
}

type Live = {
  serverTime: number;
  name: string;
  treasury: number;
  residents: Map<string, Omit<ResidentSnap, 'z'>>;
  placements?: Map<string, Partial<PlacementSnap>>;
  facilities?: Map<string, { x?: number; y?: number }>;
  well?: { members?: string[]; floor?: string; departAt?: number };
  storage?: Map<string, number>;
};

const RETRY_MS = 2000;
/** 서버 IslandRoom.REPLACED_CODE: 같은 계정이 다른 곳에서 접속 */
const REPLACED_CODE = 4002;

export class IslandConnection {
  readonly clock = new ServerClock();
  readonly residents = new SnapshotBuffer<ResidentSnap>();
  /** 본인 값 (입장 때 me 메시지) */
  me: S2C['me'] = { wallet: 0, level: 1 };
  /** 내 가방 (inv 메시지) */
  inventory: Record<string, number> = {};
  /** 배치 실패 (화면 알림) */
  onPlaceFail: (m: S2C['placeFail']) => void = () => {};
  /** 구매 결과·게시판 내용·채팅·이모트 */
  onBuy: (m: S2C['buyResult']) => void = () => {};
  board: S2C['board'] | null = null;
  onChat: (m: S2C['chat']) => void = () => {};
  onEmote: (m: S2C['emote']) => void = () => {};
  /** 우물 출발 → 던전 방 / 우물 요청 실패 */
  onDepart: (m: S2C['depart']) => void = () => {};
  onWellFail: (m: S2C['wellFail']) => void = () => {};
  /** 섬 주인에게만: 입장 신청이 들어옴 */
  onJoinRequest: (m: S2C['joinRequest']) => void = () => {};
  /** 새 스냅샷 직후 (예측 보정) */
  onSnapshot: () => void = () => {};
  /** 다시 들어갔을 때 (화면의 내 위치를 새로 받음) */
  onRejoined: () => void = () => {};
  status: 'ok' | 'reconnecting' | 'replaced' = 'ok';
  private seq = 0;
  private pingTimer = 0;
  private leaving = false;

  private constructor(public room: Room, readonly userId: string, private islandId: number) {
    this.attach(room);
    this.ping();
    this.pingTimer = window.setInterval(() => this.ping(), NET.pingMs);
  }

  /** 첫 상태까지 받은 뒤 돌려준다 */
  static async join(islandId: number, userId: string): Promise<IslandConnection> {
    const room = await new Client(serverUrl()).joinOrCreate('island', { islandId });
    const conn = new IslandConnection(room, userId, islandId);
    await new Promise<void>((res) => (conn.live.residents?.get(userId) ? res() : room.onStateChange.once(() => res())));
    return conn;
  }

  private attach(room: Room): void {
    room.onStateChange((s) => this.snapshot(s as unknown as Live));
    room.onMessage('pong', (m: S2C['pong']) => this.clock.onPong(m.t, m.server));
    room.onMessage('me', (m: S2C['me']) => { this.me = m; });
    room.onMessage('inv', (m: S2C['inv']) => { this.inventory = m.items; });
    room.onMessage('placeFail', (m: S2C['placeFail']) => this.onPlaceFail(m));
    room.onMessage('buyResult', (m: S2C['buyResult']) => this.onBuy(m));
    room.onMessage('board', (m: S2C['board']) => { this.board = m; });
    room.onMessage('chat', (m: S2C['chat']) => this.onChat(m));
    room.onMessage('emote', (m: S2C['emote']) => this.onEmote(m));
    room.onMessage('depart', (m: S2C['depart']) => this.onDepart(m));
    room.onMessage('wellFail', (m: S2C['wellFail']) => this.onWellFail(m));
    room.onMessage('joinRequest', (m: S2C['joinRequest']) => this.onJoinRequest(m));
    room.onLeave((code) => {
      if (this.leaving) return;
      if (code === REPLACED_CODE) {
        this.status = 'replaced';
        window.clearInterval(this.pingTimer);
      } else void this.rejoin();
    });
  }

  private async rejoin(): Promise<void> {
    this.status = 'reconnecting';
    while (!this.leaving) {
      await new Promise((r) => window.setTimeout(r, RETRY_MS));
      try {
        this.room = await new Client(serverUrl()).joinOrCreate('island', { islandId: this.islandId });
        this.residents.clear();
        this.attach(this.room);
        this.status = 'ok';
        this.onRejoined();
        return;
      } catch {
        // 서버가 아직 안 받음: 다시
      }
    }
  }

  get live(): Live {
    return this.room.state as unknown as Live;
  }

  /** 놓인 장식 (기본값 0·false는 전송되지 않으므로 채움) */
  get placements(): PlacementSnap[] {
    return [...(this.live.placements?.values() ?? [])].map((p) => ({
      id: p.id ?? '', itemId: p.itemId ?? '', x: p.x ?? 0, y: p.y ?? 0, rot: p.rot ?? 0, placedBy: p.placedBy ?? '', communal: p.communal ?? false,
    }));
  }

  /** 이 섬의 시설 위치 (옮긴 시설 반영, 0은 전송되지 않으므로 채움) */
  get facilities(): Facility[] {
    return facilitiesWith([...(this.live.facilities?.entries() ?? [])].map(([id, p]) => ({ id, x: p.x ?? 0, y: p.y ?? 0 })));
  }

  /** 우물 대기 (기본값은 전송되지 않으므로 채움) */
  get well(): { members: string[]; floor: string; departAt: number } {
    const w = this.live.well;
    return { members: [...(w?.members ?? [])], floor: w?.floor ?? '', departAt: w?.departAt ?? 0 };
  }

  /** 공용 창고 (장식 id → 개수) */
  get storage(): Record<string, number> {
    return Object.fromEntries(this.live.storage?.entries() ?? []);
  }

  /** 섬 이름·금고 (기본값이면 전송되지 않으므로 채움) */
  get island(): { name: string; treasury: number } {
    return { name: this.live.name ?? '', treasury: this.live.treasury ?? 0 };
  }

  private snapshot(s: Live): void {
    if (!s.residents) return;
    this.clock.hint(s.serverTime ?? 0);
    const items = new Map<string, ResidentSnap>();
    for (const [id, r] of s.residents) {
      items.set(id, {
        id, name: r.name, color: r.color ?? 0, hair: r.hair ?? 0, hairColor: r.hairColor ?? 0, weapon: r.weapon || 'greatsword', online: !!r.online, status: r.status ?? 'away', x: r.x ?? 0, y: r.y ?? 0, z: 0,
        facing: r.facing ?? 1, state: r.state ?? 'idle', lastInputSeq: r.lastInputSeq ?? 0, wellAt: r.wellAt ?? 0,
      });
    }
    this.residents.push({ t: s.serverTime ?? 0, items });
    this.onSnapshot();
  }

  nextSeq(): number {
    return ++this.seq;
  }

  send<K extends C2SType>(type: K, msg: C2SMessage<K>): void {
    this.room.send(type, msg);
  }

  private ping(): void {
    if (this.status === 'ok') this.send('ping', { t: performance.now() });
  }

  leave(): void {
    this.leaving = true;
    window.clearInterval(this.pingTimer);
    void this.room.leave();
  }
}
