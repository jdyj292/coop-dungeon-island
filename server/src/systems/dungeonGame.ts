// 던전 한 판의 진행 (Colyseus 없이 테스트 가능): 방마다 RoomSim + 웨이브 + 방 진행 + 입력 대기열 + 상태 반영 + 이벤트
// DungeonRoom(rooms/)은 연결·전송만 맡는다. 흐름은 docs/network.md 3~6장
import {
  COMBAT, entryPos, mapOf, NET, parseC2S, ROOMS, RoomSim, TICK, WaveRunner, weaponDef,
  type C2SMessage, type C2SType, type RoomDef, type PlayerInput, type Projectile, type S2C, type SimOptions, type SimPlayer,
} from '@game/shared';
import { DungeonState, PlayerState } from '../schema/DungeonState';
import { eventsFor, projectileEvents, type Outgoing } from './events';
import { InputQueue } from './inputs';
import { dungeonRules, RateLimit } from './rateLimit';
import { LootBook, type LootMessage } from './reward';
import { buildRoom, exitCount, floorRooms, FLOOR } from './roomFlow';
import { RunFlow } from './runFlow';
import { settle, type RunEnd } from './settle';
import { syncPlayer, syncWorld } from './sync';

export interface Outbox {
  broadcast<K extends keyof S2C>(type: K, msg: S2C[K]): void;
  send<K extends keyof S2C>(pid: string, type: K, msg: S2C[K]): void;
}

export interface DungeonOptions {
  /** 시작할 1층 방 번호 1~6 (개발용, 기본 1). 한 판은 여기서 보스 방까지 */
  room?: number;
  /** 던전 인원 1~4 (공격 토큰) */
  partySize?: number;
  /** 테스트용 난수 */
  rng?: () => number;
  /** 개발 명령 허용 (서버 개발 모드, 배포에서는 false) */
  dev?: boolean;
}

const NAME_MAX = 12;

interface Member {
  inputs: InputQueue;
  limit: RateLimit;
  /** 입장 순서 (입장 위치) */
  index: number;
}

export class DungeonGame {
  readonly state = new DungeonState();
  sim: RoomSim;
  waves: WaveRunner;
  /** 서버 시각 (ms, 방 생성부터) */
  now = 0;
  private members = new Map<string, Member>();
  private joined = 0;
  private room: RoomDef;
  private readonly simOpts: SimOptions;
  private readonly dev: boolean;
  private readonly loot: LootBook;
  private readonly flow = new RunFlow();

  constructor(opts: DungeonOptions, private out: Outbox) {
    const rooms = floorRooms();
    const n = Math.min(rooms.length, Math.max(1, Math.floor(opts.room ?? 1)));
    const party = Math.min(4, Math.max(1, Math.floor(opts.partySize ?? 1)));
    this.simOpts = { partySize: party, rng: opts.rng, hitstop: 'entity' };
    this.dev = !!opts.dev;
    this.loot = new LootBook(opts.rng ?? Math.random);
    this.state.assign({ partySize: party, roomCount: rooms.length });
    this.room = rooms[n - 1]!;
    this.sim = buildRoom(this.room, weaponDef('greatsword'), this.simOpts, null, () => 0);
    this.waves = new WaveRunner(this.room);
    this.enter(n - 1);
  }

  /** 방 들어가기: 첫 웨이브, 출구 닫힘 (생성자·다음 방 공용) */
  private enter(index: number): void {
    // 몬스터 번호는 방마다 1부터라 이전 방 상태를 비운다
    this.state.monsters.clear();
    this.state.zones.clear();
    this.sim.spawn(this.waves.next());
    this.state.assign({ roomIndex: index, wave: this.waves.wave, doorOpen: false, exitAt: 0, exitNeed: 0, chestOpen: false });
    syncWorld(this.state, this.sim, this.now);
  }

  /** 다음 방: 플레이어를 데려와 새 시뮬레이션 (dungeon.md 2장) */
  private nextRoom(): Outgoing {
    const index = this.state.roomIndex + 1;
    this.room = floorRooms()[index]!;
    this.sim = buildRoom(this.room, this.sim.weapon, this.simOpts, this.sim, (pid) => this.members.get(pid)?.index ?? 0);
    this.waves = new WaveRunner(this.room);
    this.enter(index);
    this.flow.resetRoom();
    return { type: 'roomEnter', msg: { roomIndex: index } };
  }

  join(pid: string, name: unknown): void {
    const index = this.joined++;
    const sp = this.sim.addPlayer(pid, entryPos(this.room, index % 4));
    // 부활의 깃털은 솔로만 (dungeon.md 3장). 파티는 동료 부활
    if (this.state.partySize > 1) sp.state.feathers = 0;
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
      case 'dev': {
        const msg = parseC2S('dev', raw);
        if (!msg || !this.dev) return 'ignored';
        if (msg.cmd === 'down') {
          Object.assign(sp.state, { hp: 0, downed: true, feathers: 0, hurt: null });
          return 'ok';
        }
        // 기절 처리: 보상은 처치와 같게, 웨이브 진행은 다음 틱
        for (const mon of this.sim.alive.filter((x) => !x.body.ko)) {
          Object.assign(mon, { hp: 0 }).body.ko = true;
          this.deliver(this.loot.kill(mon.def, this.pids()));
        }
        return 'ok';
      }
      case 'interact': {
        const msg = parseC2S('interact', raw);
        if (!msg) return 'ignored';
        if (msg.targetId === 'chest') this.openChest(sp);
        else if (msg.targetId.startsWith('revive:')) this.flow.hold(this.sim, pid, msg.targetId.slice('revive:'.length), this.now);
        return 'ok';
      }
      default:
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

  private pids(): string[] {
    return [...this.sim.players.keys()];
  }

  private deliver(list: LootMessage[]): void {
    for (const m of list) {
      if (m.to) this.out.send(m.to, m.type, m.msg as never);
      else this.out.broadcast(m.type, m.msg as never);
    }
  }

  /** 보물상자: 방 클리어 뒤, 가까이 (combat.json interactRange), 방마다 한 번 (rooms.json chest) */
  private openChest(sp: SimPlayer): void {
    const at = mapOf(this.room).chest, c = ROOMS[FLOOR]!.chest;
    if (!at || !c || !this.state.doorOpen || this.state.chestOpen) return;
    if (Math.hypot(sp.state.pos.x - at.x, sp.state.pos.y - at.y) > COMBAT.interactRange) return;
    this.state.chestOpen = true;
    this.deliver(this.loot.chest(c, this.pids()));
  }

  /** 1/60초 한 틱 */
  /** 한 판 끝: 정산해서 전원에게 결과 (저장은 M4) */
  private finish(kind: RunEnd): void {
    this.state.assign({ phase: 'result', returnLeft: 0 });
    const members = [...this.sim.players.keys()].map((pid) => ({ pid, name: this.state.players.get(pid)?.name ?? pid, level: 1, levelExp: 0 }));
    this.out.broadcast('result', settle(kind, members, (pid) => this.loot.of(pid)));
  }

  tick(): void {
    this.now += TICK * 1000;
    // 결과가 나온 뒤에는 세계를 멈춘다 (정산 화면)
    if (this.state.phase === 'result') {
      this.state.serverTime = this.now;
      return;
    }
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
    // 보상: 기절 → 전원, 콤보 단계 → 보너스 (솔로 개인 / 파티 팀)
    for (const e of events) {
      if (e.type === 'ko') this.deliver(this.loot.kill(e.m.def, this.pids()));
      else if (e.type === 'comboMilestone') this.deliver(this.loot.milestone(e.count, [e.pid], true));
      else if (e.type === 'teamMilestone') this.deliver(this.loot.milestone(e.count, this.pids(), false));
    }
    // 웨이브: 모두 기절 → 다음 웨이브, 마지막이면 방 클리어
    const w = this.waves.check(this.sim.alive.length);
    if (Array.isArray(w)) {
      this.sim.spawn(w);
      this.state.wave = this.waves.wave;
    } else if (w === 'clear') {
      this.state.doorOpen = true;
      out.push({ type: 'roomClear', msg: { roomIndex: this.state.roomIndex } });
    }
    // 출구: 살아 있는 전원이 모이면 다음 방 (보스 방은 출구 없음)
    if (this.state.doorOpen) {
      const { at, need } = exitCount(this.sim, this.room);
      this.state.assign({ exitAt: at, exitNeed: need });
      if (need > 0 && at === need && this.state.roomIndex + 1 < floorRooms().length) out.push(this.nextRoom());
    }
    // 부활·귀환·전멸·보스 처치
    const run = this.flow.tick(this.sim, this.room, this.state.doorOpen, this.state.roomIndex === floorRooms().length - 1, this.now);
    this.state.returnLeft = run.returnLeft;
    for (const sp of this.sim.players.values()) {
      const s = this.state.players.get(sp.pid);
      if (!s) continue;
      s.reviveProgress = Math.round((run.revive.get(sp.pid) ?? 0) * 255);
      syncPlayer(s, sp, moved.get(sp.pid) ?? 0, this.now);
      const l = this.loot.of(sp.pid);
      s.priv.assign({ coins: l.coins, materials: l.materials, exp: l.exp, bonusPct: Math.round(l.bonus * 100) });
      s.lastInputSeq = seqs.get(sp.pid) ?? s.lastInputSeq;
    }
    syncWorld(this.state, this.sim, this.now);
    this.state.teamCombo = this.sim.team.count;
    this.state.serverTime = this.now;
    for (const o of out) this.out.broadcast(o.type, o.msg as never);
    if (run.end) this.finish(run.end);
  }
}
