// 서버 던전 방 접속 (docs/network.md 3~6장): 상태 패치 → 스냅샷 버퍼, 이벤트 → 콜백, 메시지 보내기
import { Client, type Room } from 'colyseus.js';
import { NET, type C2SMessage, type C2SType, type S2C } from '@game/shared';
import { ServerClock } from './clock';
import { SnapshotBuffer, type Pos } from './interp';

/** 보간용 플레이어 값 (상태에서 복사) */
export interface PlayerSnap extends Pos {
  id: string;
  name: string;
  facing: number;
  state: string;
  /** 지금 state가 시작된 서버 시각 (백스텝·피격 진행 계산용) */
  since: number;
  actionId: string;
  actionStart: number;
  hp: number;
  maxHp: number;
  ult: number;
  /** 서버가 처리한 마지막 입력 (본인 예측 보정용) */
  lastInputSeq: number;
}

export interface MonsterSnap extends Pos {
  id: string;
  type: string;
  facing: number;
  state: string;
  since: number;
  actionId: string;
  actionStart: number;
  hpRatio: number;
  superArmor: boolean;
}

/** 본인 전용 값 (보간 없이 최신) */
export interface PrivateView {
  mp: number;
  cooldowns: Map<string, number>;
  potionHp: number;
  potionMp: number;
  feathers: number;
}

/** 서버 상태 모양 (colyseus.js가 디코드한 객체) */
type Live = {
  serverTime: number;
  wave: number;
  doorOpen: boolean;
  players: Map<string, Omit<PlayerSnap, 'z' | 'since' | 'ult'> & { ultGauge: number; priv?: PrivateView }>;
  monsters: Map<string, Omit<MonsterSnap, 'since'>>;
  zones: Map<string, { id: string; attackId: string; x: number; y: number; endsAt: number }>;
};

export type EventHandler = <K extends keyof S2C>(type: K, msg: S2C[K]) => void;

const EVENTS: (keyof S2C)[] = ['hit', 'playerHit', 'rejected', 'combo', 'emote', 'chat', 'projSpawn', 'projEnd', 'roomClear'];

export function serverUrl(): string {
  return (import.meta.env.VITE_SERVER_URL as string | undefined) ?? `ws://${location.hostname}:2567`;
}

export class Connection {
  readonly clock = new ServerClock();
  readonly players = new SnapshotBuffer<PlayerSnap>();
  readonly monsters = new SnapshotBuffer<MonsterSnap>();
  onEvent: EventHandler = () => {};
  /** 새 스냅샷이 버퍼에 들어간 직후 (예측 보정) */
  onSnapshot: () => void = () => {};
  private seq = 0;
  private pingTimer = 0;

  /** lagMs = 개발용 왕복 지연 (보낼 때·받을 때 절반씩, roadmap 2-4. 조정 패널은 2-6) */
  private constructor(readonly room: Room, private lagMs = 0) {
    room.onStateChange((s) => this.snapshot(s as unknown as Live));
    for (const type of EVENTS) room.onMessage(type, (msg) => this.later(() => this.onEvent(type, msg)));
    room.onMessage('pong', (m: S2C['pong']) => this.later(() => this.clock.onPong(m.t, m.server)));
    this.ping();
    this.pingTimer = window.setInterval(() => this.ping(), NET.pingMs);
    room.onLeave(() => window.clearInterval(this.pingTimer));
  }

  static async join(opts: { room: number; partySize: number; name?: string }, lagMs = 0): Promise<Connection> {
    const room = await new Client(serverUrl()).joinOrCreate('dungeon', opts);
    return new Connection(room, Math.max(0, lagMs));
  }

  /** 지연 흉내: 한 방향 = 왕복의 절반 */
  private later(fn: () => void): void {
    if (this.lagMs > 0) window.setTimeout(fn, this.lagMs / 2);
    else fn();
  }

  get myId(): string {
    return this.room.sessionId;
  }

  get live(): Live {
    return this.room.state as unknown as Live;
  }

  /** 본인 전용 값 (아직 안 왔으면 undefined) */
  get mine(): PrivateView | undefined {
    return this.live.players?.get(this.myId)?.priv;
  }

  /** 다음 seq 번호 */
  nextSeq(): number {
    return ++this.seq;
  }

  send<K extends C2SType>(type: K, msg: C2SMessage<K>): void {
    this.later(() => this.room.send(type, msg));
  }

  leave(): void {
    window.clearInterval(this.pingTimer);
    void this.room.leave();
  }

  private ping(): void {
    this.send('ping', { t: performance.now() });
  }

  /** 패치 하나 = 스냅샷 하나 (같은 serverTime이면 버퍼가 무시) */
  private snapshot(s: Live): void {
    if (!s.players) return;
    const t = s.serverTime;
    const prevP = this.players.latest?.items, prevM = this.monsters.latest?.items;
    const since = (prev: { state: string; since: number } | undefined, state: string) => (prev && prev.state === state ? prev.since : t);
    const players = new Map<string, PlayerSnap>();
    s.players.forEach((p, id) => players.set(id, {
      id, name: p.name, x: p.x, y: p.y, z: 0, facing: p.facing, state: p.state, since: since(prevP?.get(id), p.state),
      actionId: p.actionId, actionStart: p.actionStart, hp: p.hp, maxHp: p.maxHp, ult: p.ultGauge, lastInputSeq: p.lastInputSeq,
    }));
    const monsters = new Map<string, MonsterSnap>();
    s.monsters.forEach((m, id) => monsters.set(id, {
      id, type: m.type, x: m.x, y: m.y, z: m.z, facing: m.facing, state: m.state, since: since(prevM?.get(id), m.state),
      actionId: m.actionId, actionStart: m.actionStart, hpRatio: m.hpRatio, superArmor: m.superArmor,
    }));
    // 상태 객체는 계속 바뀌므로 값은 지금 복사하고, 버퍼에 넣는 것만 지연
    this.later(() => {
      this.clock.hint(t);
      this.players.push({ t, items: players });
      this.monsters.push({ t, items: monsters });
      this.onSnapshot();
    });
  }
}
