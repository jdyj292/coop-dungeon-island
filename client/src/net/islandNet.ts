// 섬 방 접속 (docs/network.md 3·5장): 세션 쿠키로 입장, 주민 상태 → 스냅샷 버퍼(다른 주민 보간), 본인 값 메시지
// 끊기면 2초마다 다시 입장 (섬 변경은 즉시 DB에 저장되므로 새로 들어가 전체 상태를 받으면 된다, network.md 10장)
import { Client, type Room } from 'colyseus.js';
import { NET, type C2SMessage, type C2SType, type S2C } from '@game/shared';
import { ServerClock } from './clock';
import { serverUrl } from './connection';
import { SnapshotBuffer, type Pos } from './interp';

export interface ResidentSnap extends Pos {
  id: string;
  name: string;
  color: number;
  online: boolean;
  status: string;
  facing: number;
  state: string;
  lastInputSeq: number;
}

type Live = {
  serverTime: number;
  name: string;
  treasury: number;
  residents: Map<string, Omit<ResidentSnap, 'z'>>;
};

const RETRY_MS = 2000;
/** 서버 IslandRoom.REPLACED_CODE: 같은 계정이 다른 곳에서 접속 */
const REPLACED_CODE = 4002;

export class IslandConnection {
  readonly clock = new ServerClock();
  readonly residents = new SnapshotBuffer<ResidentSnap>();
  /** 본인 값 (입장 때 me 메시지) */
  me: S2C['me'] = { wallet: 0, level: 1 };
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
        id, name: r.name, color: r.color ?? 0, online: !!r.online, status: r.status ?? 'away', x: r.x ?? 0, y: r.y ?? 0, z: 0,
        facing: r.facing ?? 1, state: r.state ?? 'idle', lastInputSeq: r.lastInputSeq ?? 0,
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
