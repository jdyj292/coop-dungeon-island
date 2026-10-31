// 서버 던전 방 접속 (docs/network.md 3~6장): 상태 패치 → 스냅샷 버퍼, 이벤트 → 콜백, 메시지 보내기
import { Client, type Room } from 'colyseus.js';
import { NET, type C2SMessage, type C2SType, type S2C } from '@game/shared';
import { ServerClock } from './clock';
import { DelayLine, type NetSim } from './delayLine';
import { SnapshotBuffer, type Pos } from './interp';

/** 보간용 플레이어 값 (상태에서 복사) */
export interface PlayerSnap extends Pos {
  id: string;
  name: string;
  facing: number;
  /** 회피 이동 방향: 좌우·깊이 (회피 아니면 둘 다 0) */
  dodgeDir: number;
  dodgeDy: number;
  /** 회피 시작 서버 시각 (회피 아니면 0) */
  dodgeStart: number;
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
  /** 쓰러진 동안 동료 부활 진행도 0~255 */
  reviveProgress: number;
  /** 플레이어 색 번호 (섬 주민 순서, 개발 방은 입장 순서) */
  color: number;
  /** 외형 키 "의상:머리:머리색:플레이어 색" (view/look.ts hairOfLook) */
  look: string;
  /** 무기 id (weapons.json) */
  weapon: string;
  /** 스킬 노드 (skillTree.encodeBuild): 변형에 따라 행동 시간·판정이 다름 */
  skills: string;
  /** 가속장 가속 중·역장 보호막 (표시용) */
  hasted?: boolean;
  shielded?: boolean;
  /** 대검 충전: 이 행동에서 충전한 ms, 충전 중 비율 1~255 (아니면 0) */
  chargeMs?: number;
  chargeLv?: number;
}

export interface MonsterSnap extends Pos {
  id: string;
  type: string;
  facing: number;
  state: string;
  since: number;
  actionId: string;
  actionStart: number;
  /** 공격의 대각선 조준 깊이 px */
  aimY: number;
  hpRatio: number;
  superArmor: boolean;
  /** 감속 중 (변형 동토) */
  slowed?: boolean;
  /** 보조 노드 표식 (연소, 중압) */
  burning?: boolean;
  pressed?: boolean;
  scarred?: boolean;
}

/** 본인 전용 값 (보간 없이 최신) */
export interface PrivateView {
  stamina: number;
  tired: boolean;
  mp: number;
  coins?: number;
  materials?: number;
  exp?: number;
  bonusPct?: number;
  cooldowns: Map<string, number>;
  potionHp: number;
  potionMp: number;
  feathers: number;
  /** 재입력 대기 (변형 reinput): 스킬 id(없으면 빈 문자열)·남은 횟수·받는 시간이 끝나는 서버 시각 */
  reinputId?: string;
  reinputLeft?: number;
  reinputEnd?: number;
  /** 가속 (가속장): 끝나는 서버 시각(0 = 없음)·쿨이 도는 배율 */
  hasteEnd?: number;
  hasteMul?: number;
}

/** 서버 상태 모양 (colyseus.js가 디코드한 객체) */
type Live = {
  serverTime: number;
  roomIndex: number;
  roomCount: number;
  doorOpen: boolean;
  exitAt: number;
  exitNeed: number;
  chestOpen: boolean;
  returnLeft: number;
  phase: string;
  partySize: number;
  teamCombo: number;
  wave: number;
  players: Map<string, Omit<PlayerSnap, 'z' | 'since' | 'ult'> & { ultGauge: number; priv?: PrivateView }>;
  monsters: Map<string, Omit<MonsterSnap, 'since'>>;
  zones: Map<string, { id: string; attackId: string; x: number; y: number; endsAt: number }>;
};

export type EventHandler = <K extends keyof S2C>(type: K, msg: S2C[K]) => void;

/** 재접속 시도 간격·최대 시간 (서버 대기: 파티 30초, 솔로·전원 60초) */
const RECONNECT_EVERY_MS = 2000;
const RECONNECT_MAX_MS = 60_000;

const EVENTS: (keyof S2C)[] = [
  'hit', 'playerHit', 'rejected', 'combo', 'emote', 'chat', 'projSpawn', 'projEnd', 'bolt', 'boltEnd', 'echo', 'roomClear', 'teamMilestone', 'reward', 'comboBonus', 'roomEnter', 'result',
];

/**
 * 게임 서버 주소. 배포(빌드)는 페이지와 같은 주소 (Nginx → 게임 서버가 정적 파일·/api·소켓을 모두 받음, docs/deploy.md),
 * 개발은 Vite(5173)와 따로 뜬 게임 서버 2567. VITE_SERVER_URL로 덮어쓸 수 있음
 */
export function serverUrl(): string {
  const env = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (env) return env;
  if (import.meta.env.PROD) return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
  return `ws://${location.hostname}:2567`;
}

export class Connection {
  readonly clock = new ServerClock();
  readonly players = new SnapshotBuffer<PlayerSnap>();
  readonly monsters = new SnapshotBuffer<MonsterSnap>();
  onEvent: EventHandler = () => {};
  /** 새 스냅샷이 버퍼에 들어간 직후 (예측 보정) */
  onSnapshot: () => void = () => {};
  private seq = 0;
  /** 버퍼에 쌓인 스냅샷의 방 번호 (바뀌면 비운다: 다른 방 위치끼리 보간하지 않게) */
  private bufferedRoom = -1;
  private pingTimer = 0;

  /** 개발용 네트워크 흉내 (지연 시뮬레이터 패널에서 바꾼다, net/lagPanel.ts) */
  readonly netSim: NetSim;
  private outLine: DelayLine;
  private inLine: DelayLine;

  /** 접속 상태: 끊기면 재접속을 시도 (network.md 10장), 시간 안에 못 하면 lost */
  status: 'ok' | 'reconnecting' | 'lost' = 'ok';
  /** 재접속에 성공했을 때 (화면을 다시 만든다) */
  onReconnected: () => void = () => {};
  /** 우리가 나가는 중 (이때 끊긴 것은 재접속하지 않음) */
  private leaving = false;
  room: Room;

  private constructor(room: Room, sim: NetSim) {
    this.room = room;
    this.netSim = sim;
    this.outLine = new DelayLine(() => this.netSim);
    this.inLine = new DelayLine(() => this.netSim);
    this.attach(room);
    this.ping();
    this.pingTimer = window.setInterval(() => this.ping(), NET.pingMs);
  }

  /** 방 메시지 연결 (처음·재접속 때) */
  private attach(room: Room): void {
    room.onStateChange((s) => this.snapshot(s as unknown as Live));
    for (const type of EVENTS) room.onMessage(type, (msg) => this.later(() => this.onEvent(type, msg)));
    room.onMessage('pong', (m: S2C['pong']) => this.later(() => this.clock.onPong(m.t, m.server)));
    room.onLeave(() => {
      if (this.leaving) window.clearInterval(this.pingTimer);
      else void this.reconnect();
    });
  }

  /**
   * 끊김: RECONNECT_EVERY_MS마다 재접속 시도, RECONNECT_MAX_MS 안에 못 하면 lost (서버는 파티 30초·솔로 60초 기다림)
   * 성공하면 전체 상태를 다시 받으므로 보간 버퍼를 비운다
   */
  private async reconnect(): Promise<void> {
    if (this.status === 'reconnecting') return;
    this.status = 'reconnecting';
    const token = this.room.reconnectionToken, until = performance.now() + RECONNECT_MAX_MS;
    while (performance.now() < until && !this.leaving) {
      await new Promise((r) => window.setTimeout(r, RECONNECT_EVERY_MS));
      try {
        const room = await new Client(serverUrl()).reconnect(token);
        this.room = room;
        this.players.clear();
        this.monsters.clear();
        this.bufferedRoom = -1;
        this.attach(room);
        this.status = 'ok';
        this.onReconnected();
        return;
      } catch {
        // 서버가 아직 못 받거나 이미 이탈 처리됨: 다시 시도
      }
    }
    this.status = 'lost';
  }

  /** 개발용: 소켓만 닫아 끊김을 흉내 (서버는 동의 없는 끊김으로 본다) */
  debugDrop(): void {
    (this.room.connection as unknown as { close(): void }).close();
  }

  /** 첫 상태까지 받은 뒤 돌려준다 (방 번호를 알아야 화면을 만든다) */
  /** 개발 방: ?room=1~6 (기본 1) ?party=1~4 (기본 2) ?weapon ?skills=gs_launch:3:double (스킬 노드, skillTree.encodeBuild) */
  static devRoom(p: URLSearchParams): { room: number; partySize: number; weapon?: string; skills?: string } {
    const room = Number(p.get('room') ?? 1), partySize = Math.min(4, Math.max(1, Number(p.get('party') ?? 2)));
    return { room, partySize, ...(p.has('weapon') ? { weapon: p.get('weapon')! } : {}), ...(p.has('skills') ? { skills: p.get('skills')! } : {}) };
  }

  /** 개발용 네트워크 흉내 초기값: ?lag=왕복ms&jitter=±ms&loss=% (` 키 패널에서 조정) */
  static netSimFrom(p: URLSearchParams): NetSim {
    const num = (k: string) => Math.max(0, Number(p.get(k) ?? 0) || 0);
    return { lagMs: num('lag'), jitterMs: num('jitter'), loss: num('loss') / 100 };
  }

  /** 개발 방(joinOrCreate, ?online=1) 또는 섬에서 출발한 방(roomId, 세션 쿠키로 인증) */
  static async join(opts: { room: number; partySize: number; name?: string; weapon?: string } | { roomId: string }, sim: NetSim): Promise<Connection> {
    const client = new Client(serverUrl());
    const room = 'roomId' in opts ? await client.joinById(opts.roomId) : await client.joinOrCreate('dungeon', opts);
    const conn = new Connection(room, sim);
    await new Promise<void>((res) => (conn.live.players ? res() : room.onStateChange.once(() => res())));
    return conn;
  }

  /** 받은 것: 흉내 지연 뒤 처리 (순서 유지) */
  private later(fn: () => void): void {
    this.inLine.push(fn);
  }

  get myId(): string {
    return this.room.sessionId;
  }

  get live(): Live {
    return this.room.state as unknown as Live;
  }

  /**
   * 방 진행 값 (서버 기본값과 같으면 전송되지 않아 비어 있을 수 있다 → 서버 스키마 기본값으로 채움)
   */
  get progress(): {
    roomIndex: number; roomCount: number; doorOpen: boolean; exitAt: number; exitNeed: number; chestOpen: boolean; returnLeft: number; phase: string;
  } {
    const l = this.live;
    return {
      roomIndex: l.roomIndex ?? 0, roomCount: l.roomCount ?? 6, doorOpen: l.doorOpen ?? false, exitAt: l.exitAt ?? 0, exitNeed: l.exitNeed ?? 0,
      chestOpen: l.chestOpen ?? false, returnLeft: l.returnLeft ?? 0, phase: l.phase ?? 'play',
    };
  }

  /** 본인 전용 값 (아직 안 왔으면 undefined) */
  get mine(): PrivateView | undefined {
    return this.live.players?.get(this.myId)?.priv;
  }

  /** 내 스킬 노드 (서버가 정한 값) */
  get mySkills(): string {
    return this.live.players?.get(this.myId)?.skills ?? '';
  }

  /** 다음 seq 번호 */
  nextSeq(): number {
    return ++this.seq;
  }

  send<K extends C2SType>(type: K, msg: C2SMessage<K>): void {
    this.outLine.push(() => this.room.send(type, msg));
  }

  leave(): void {
    this.leaving = true;
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
      id, name: p.name, x: p.x, y: p.y, z: 0, facing: p.facing, dodgeDir: p.dodgeDir ?? 0, dodgeDy: p.dodgeDy ?? 0, dodgeStart: p.dodgeStart ?? 0, state: p.state, since: since(prevP?.get(id), p.state),
      actionId: p.actionId, actionStart: p.actionStart, hp: p.hp, maxHp: p.maxHp, ult: p.ultGauge, lastInputSeq: p.lastInputSeq, reviveProgress: p.reviveProgress ?? 0, color: p.color ?? 0, look: p.look ?? '', weapon: p.weapon || 'greatsword', skills: p.skills ?? '',
      hasted: !!p.hasted, shielded: !!p.shielded, chargeMs: p.chargeMs ?? 0, chargeLv: p.chargeLv ?? 0,
    }));
    const monsters = new Map<string, MonsterSnap>();
    s.monsters.forEach((m, id) => monsters.set(id, {
      id, type: m.type, x: m.x, y: m.y, z: m.z, facing: m.facing, state: m.state, since: since(prevM?.get(id), m.state),
      actionId: m.actionId, actionStart: m.actionStart, aimY: m.aimY, hpRatio: m.hpRatio, superArmor: m.superArmor, slowed: !!m.slowed, burning: !!m.burning, pressed: !!m.pressed, scarred: !!m.scarred,
    }));
    // 상태 객체는 계속 바뀌므로 값은 지금 복사하고, 버퍼에 넣는 것만 지연
    const roomIndex = s.roomIndex ?? 0;
    this.later(() => {
      if (roomIndex !== this.bufferedRoom) {
        this.players.clear();
        this.monsters.clear();
        this.bufferedRoom = roomIndex;
      }
      this.clock.hint(t);
      this.players.push({ t, items: players });
      this.monsters.push({ t, items: monsters });
      this.onSnapshot();
    });
  }
}
