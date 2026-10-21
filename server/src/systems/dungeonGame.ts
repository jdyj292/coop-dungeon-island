// 던전 한 방의 진행 (Colyseus 없이 테스트 가능): RoomSim + 웨이브 + 입력 대기열 + 상태 반영 + 이벤트
// DungeonRoom(rooms/)은 연결·전송만 맡는다. 흐름은 docs/network.md 3~6장
import {
  entryPos, floorRoom, NET, parseC2S, roomBounds, RoomSim, TICK, WaveRunner, weaponDef,
  type C2SMessage, type C2SType, type RoomDef, type PlayerInput, type Projectile, type S2C, type SimPlayer,
} from '@game/shared';
import { DungeonState, PlayerState } from '../schema/DungeonState';
import { eventsFor, projectileEvents, type Outgoing } from './events';
import { InputQueue } from './inputs';
import { dungeonRules, RateLimit } from './rateLimit';
import { syncPlayer, syncWorld } from './sync';

export interface Outbox {
  broadcast<K extends keyof S2C>(type: K, msg: S2C[K]): void;
  send<K extends keyof S2C>(pid: string, type: K, msg: S2C[K]): void;
}

export interface DungeonOptions {
  /** 1층 방 번호 1~6 */
  room?: number;
  /** 던전 인원 1~4 (공격 토큰) */
  partySize?: number;
  /** 테스트용 난수 */
  rng?: () => number;
}

const FLOOR = 'floor1';
const NAME_MAX = 12;

interface Member {
  inputs: InputQueue;
  limit: RateLimit;
  /** 입장 순서 (입장 위치) */
  index: number;
}

export class DungeonGame {
  readonly state = new DungeonState();
  readonly sim: RoomSim;
  readonly waves: WaveRunner;
  /** 서버 시각 (ms, 방 생성부터) */
  now = 0;
  private members = new Map<string, Member>();
  private joined = 0;
  private readonly room: RoomDef;

  constructor(opts: DungeonOptions, private out: Outbox) {
    const n = Math.min(6, Math.max(1, Math.floor(opts.room ?? 1)));
    const party = Math.min(4, Math.max(1, Math.floor(opts.partySize ?? 1)));
    const room = floorRoom(FLOOR, n);
    const { bounds } = roomBounds(room);
    this.room = room;
    this.sim = new RoomSim(weaponDef('greatsword'), bounds, null, { partySize: party, rng: opts.rng, hitstop: 'entity' });
    this.waves = new WaveRunner(room);
    this.sim.spawn(this.waves.next());
    this.state.assign({ roomIndex: n - 1, partySize: party, wave: this.waves.wave });
    syncWorld(this.state, this.sim, this.now);
  }

  join(pid: string, name: unknown): void {
    const index = this.joined++;
    const sp = this.sim.addPlayer(pid, entryPos(this.room, index % 4));
    const nick = typeof name === 'string' && name.trim() ? name.trim().slice(0, NAME_MAX) : `모험가${index + 1}`;
    const s = new PlayerState().assign({ id: pid, name: nick, look: 'beginner:short:0:0', weapon: 'greatsword' });
    syncPlayer(s, sp, 0, this.now);
    this.state.players.set(pid, s);
    this.members.set(pid, { inputs: new InputQueue(), limit: new RateLimit(dungeonRules()), index });
  }

  leave(pid: string): void {
    this.sim.removePlayer(pid);
    this.state.players.delete(pid);
    this.members.delete(pid);
  }

  /** 메시지 하나. 'kick' = 제한을 계속 넘김 → 연결 종료 */
  onMessage(pid: string, type: C2SType, raw: unknown): 'ok' | 'ignored' | 'kick' {
    const m = this.members.get(pid), sp = this.sim.players.get(pid);
    if (!m || !sp) return 'ignored';
    if (!m.limit.allow(type, this.now)) return m.limit.shouldKick(this.now) ? 'kick' : 'ignored';
    switch (type) {
      case 'input': {
        const msg = parseC2S('input', raw);
        if (!msg) return 'ignored';
        m.inputs.onInput(msg);
        return 'ok';
      }
      case 'action': {
        const msg = parseC2S('action', raw);
        if (!msg) return 'ignored';
        this.lagCompensate(sp, msg);
        const reason = m.inputs.onAction(msg, sp.state, sp.weapon);
        if (reason) this.out.send(pid, 'rejected', { seq: msg.seq, reason });
        return 'ok';
      }
      case 'item': {
        const msg = parseC2S('item', raw);
        if (!msg) return 'ignored';
        const reason = m.inputs.onItem(msg, sp.state);
        if (reason) this.out.send(pid, 'rejected', { seq: msg.seq, reason });
        return 'ok';
      }
      case 'ping': {
        const msg = parseC2S('ping', raw);
        if (!msg) return 'ignored';
        this.out.send(pid, 'pong', { t: msg.t, server: this.now });
        return 'ok';
      }
      case 'emote': {
        const msg = parseC2S('emote', raw);
        if (!msg) return 'ignored';
        this.out.broadcast('emote', { player: pid, id: msg.id });
        return 'ok';
      }
      case 'chat': {
        const msg = parseC2S('chat', raw);
        if (!msg) return 'ignored';
        this.out.broadcast('chat', { player: pid, text: msg.text, t: this.now });
        return 'ok';
      }
      default:
        // interact(부활·줍기·레버)는 M3
        return 'ignored';
    }
  }

  /**
   * 지연 보정 (network.md 9장): 백스텝은 입력 시각 뒤 짧은 피격을 취소하고,
   * 공격은 그 플레이어가 본 시점(action.t − 보간 지연, 최대 150ms 전)의 몬스터 위치로 판정. 공격자 위치는 12px 안이면 클라이언트 값
   */
  private lagCompensate(sp: SimPlayer, msg: C2SMessage<'action'>): void {
    if (msg.kind === 'backstep') {
      this.sim.cancelHitsSince(sp.pid, msg.t / 1000);
      return;
    }
    const back = this.now - (msg.t - NET.interpDelayMs);
    sp.rewind = Math.min(NET.rewindMaxMs, Math.max(0, back)) / 1000;
    const p = sp.state;
    if (!p.fighter.run && Math.hypot(msg.x - p.pos.x, msg.y - p.pos.y) <= NET.attackerTrustPx) {
      const b = this.sim.bounds;
      p.pos = { x: Math.min(b.maxX, Math.max(b.minX, msg.x)), y: Math.min(b.maxY, Math.max(b.minY, msg.y)) };
    }
  }

  /** 1/60초 한 틱 */
  tick(): void {
    this.now += TICK * 1000;
    const inputs = new Map<string, PlayerInput>();
    const seqs = new Map<string, number>();
    for (const [pid, m] of this.members) {
      const { input, seq } = m.inputs.take();
      inputs.set(pid, input);
      seqs.set(pid, seq);
    }
    const before = new Map<number, Projectile>(this.sim.projectiles.map((p) => [p.id, p]));
    const { events, moved } = this.sim.step(TICK, inputs);
    const combos = new Map([...this.sim.players.values()].map((sp) => [sp.pid, sp.combo.count]));
    const out: Outgoing[] = [...eventsFor(events, this.now, combos), ...projectileEvents(before, this.sim.projectiles, this.now)];
    // 웨이브: 모두 기절 → 다음 웨이브, 마지막이면 방 클리어
    const w = this.waves.check(this.sim.alive.length);
    if (Array.isArray(w)) {
      this.sim.spawn(w);
      this.state.wave = this.waves.wave;
    } else if (w === 'clear') {
      this.state.doorOpen = true;
      out.push({ type: 'roomClear', msg: { roomIndex: this.state.roomIndex } });
    }
    for (const sp of this.sim.players.values()) {
      const s = this.state.players.get(sp.pid);
      if (!s) continue;
      syncPlayer(s, sp, moved.get(sp.pid) ?? 0, this.now);
      s.lastInputSeq = seqs.get(sp.pid) ?? s.lastInputSeq;
    }
    syncWorld(this.state, this.sim, this.now);
    this.state.teamCombo = this.sim.team.count;
    this.state.serverTime = this.now;
    for (const o of out) this.out.broadcast(o.type, o.msg as never);
  }
}
