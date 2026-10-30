// 던전 한 판의 진행 (Colyseus 없이 테스트 가능): 방마다 RoomSim + 웨이브 + 방 진행 + 입력 대기열 + 상태 반영 + 이벤트
// DungeonRoom(rooms/)은 연결·전송만 맡는다. 흐름은 docs/network.md 3~6장
import {
  arriveSecOf, atkFor, COMBAT, decodeBuild, encodeBuild, entryPos, mapOf, maxHpFor, MVP_WEAPONS, parseC2S, ROOMS, RoomSim, TICK, WaveRunner, weaponDef,
  type C2SType, type RoomDef, type PlayerInput, type Projectile, type S2C, type SimOptions, type SimPlayer,
} from '@game/shared';
import { DungeonState, PlayerState } from '../schema/DungeonState';
import { eventsFor, projectileEvents, type Outgoing } from './events';
import { InputQueue } from './inputs';
import { dungeonRules, RateLimit } from './rateLimit';
import { LootBook, type LootMessage } from './reward';
import { buildRoom, exitCount, floorRooms, FLOOR } from './roomFlow';
import { lagCompensate } from './lagComp';
import { Presence } from './presence';
import { RunFlow } from './runFlow';
import { settle, type RunEnd } from './settle';
import { syncPlayer, syncWorld } from './sync';

export type { DungeonOptions, Outbox } from './gameTypes';
import { NAME_MAX, type DungeonOptions, type Member, type Outbox, type PartyMember } from './gameTypes';

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
  private readonly presence = new Presence();
  /** 이탈한 사람의 정산 (저장은 Outbox.settled) */
  readonly dropped: ReturnType<typeof settle>[] = [];

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
    if (this.room.wakeSec) this.sim.sleepAll(this.room.wakeSec);
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

  /** party = 섬에서 출발한 파티원 정보 (이름·색·숙련도(최대 HP·ATK)·가져온 물약). 없으면 개발용 (Lv1, 물약 한도만큼) */
  join(pid: string, name: unknown, party?: PartyMember, devWeapon?: unknown, devSkills?: unknown): void {
    const index = this.joined++;
    // 무기: 섬 파티는 파티 정보(users.weapon), 개발 방은 접속 옵션 weapon (MVP 무기만), 없으면 대검
    const want = party ? party.weapon : devWeapon;
    const weapon = (MVP_WEAPONS as readonly unknown[]).includes(want) ? want as string : 'greatsword';
    const sp = this.sim.addPlayer(pid, entryPos(this.room, index % 4), weaponDef(weapon));
    // 스킬 노드: 섬 파티는 DB에서 읽은 파티 정보, 개발 방은 접속 옵션 (skills.md 1장, 판정은 이 값으로)
    const skills = party ? party.skills : devSkills;
    sp.skills = decodeBuild(typeof skills === 'string' ? skills.slice(0, 400) : '');
    // 부활의 깃털은 솔로만 (dungeon.md 3장). 파티는 동료 부활
    if (this.state.partySize > 1) sp.state.feathers = 0;
    sp.state.arrive = arriveSecOf(this.room); // 층 첫 방은 우물에서 떨어져 들어옴 (dungeon.md 2장)
    const level = party?.level ?? 1;
    if (party) Object.assign(sp.state, { maxHp: maxHpFor(level), hp: maxHpFor(level), atk: atkFor(level), potions: { ...party.potions } });
    const raw = party?.name ?? name;
    const nick = typeof raw === 'string' && raw.trim() ? raw.trim().slice(0, NAME_MAX) : `모험가${index + 1}`;
    const color = party?.color ?? index % 4;
    const s = new PlayerState().assign({ id: pid, name: nick, look: `beginner:${party?.hair ?? 0}:${party?.hairColor ?? 0}:${color}`, color, weapon, skills: encodeBuild(sp.skills) });
    syncPlayer(s, sp, 0, this.now);
    this.state.players.set(pid, s);
    this.members.set(pid, { inputs: new InputQueue(), limit: new RateLimit(dungeonRules()), index, level, levelExp: party?.levelExp ?? 0 });
  }

  /** 정산에 쓸 파티원 (이름·숙련도) */
  private member(pid: string): { pid: string; name: string; level: number; levelExp: number } {
    const m = this.members.get(pid);
    return { pid, name: this.state.players.get(pid)?.name ?? pid, level: m?.level ?? 1, levelExp: m?.levelExp ?? 0 };
  }

  /** 남은 물약 (정산 때 쓴 만큼만 가방에서 뺌) */
  private potionsLeft(pids: string[]): Record<string, { hp: number; mp: number }> {
    return Object.fromEntries(pids.map((pid) => [pid, { ...(this.sim.players.get(pid)?.state.potions ?? { hp: 0, mp: 0 }) }]));
  }

  /**
   * 이탈 (스스로 나감·재접속 시간 초과, network.md 10장): 그 사람은 전멸과 같은 정산 (저장은 M4),
   * 남은 인원으로 몬스터 체력 배율·공격 토큰 다시 계산. 아무도 안 남으면 방 종료
   */
  leave(pid: string): void {
    if (!this.members.has(pid)) return;
    if (this.state.phase !== 'result') {
      const r = settle('wipe', [this.member(pid)], (id) => this.loot.of(id));
      this.dropped.push(r);
      this.out.settled?.(r, this.potionsLeft([pid]));
    }
    this.sim.removePlayer(pid);
    this.state.players.delete(pid);
    this.members.delete(pid);
    this.presence.forget(pid);
    if (!this.members.size) return this.out.close?.();
    this.sim.setPartySize(this.members.size);
    this.state.partySize = this.members.size;
  }

  /** 끊김: 제자리에 멈춤·무적·대상 제외. 반환 = 재접속을 기다릴 초 */
  disconnect(pid: string): number {
    const sp = this.sim.players.get(pid);
    if (!sp) return 0;
    sp.away = true;
    return this.presence.disconnect(pid, this.now, this.members.size);
  }

  /** 재접속: 그대로 이어서 (입력 대기열은 새로) */
  reconnect(pid: string): void {
    const sp = this.sim.players.get(pid), m = this.members.get(pid);
    if (!sp || !m) return;
    sp.away = false;
    m.inputs = new InputQueue();
    this.presence.reconnect(pid);
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
        lagCompensate(this.sim, sp, msg, this.now);
        const reason = m.inputs.onAction(msg, sp.state, sp.weapon, sp.skills);
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
    if (!at || !c || !this.state.doorOpen || this.state.chestOpen || Math.hypot(sp.state.pos.x - at.x, sp.state.pos.y - at.y) > COMBAT.interactRange) return;
    this.state.chestOpen = true;
    this.deliver(this.loot.chest(c, this.pids()));
  }

  /** 1/60초 한 틱 */
  /** 한 판 끝: 정산해서 전원에게 결과, 저장 (Outbox.settled) */
  private finish(kind: RunEnd): void {
    this.state.assign({ phase: 'result', returnLeft: 0 });
    const pids = [...this.sim.players.keys()];
    const r = settle(kind, pids.map((pid) => this.member(pid)), (pid) => this.loot.of(pid));
    this.out.broadcast('result', r);
    this.out.settled?.(r, this.potionsLeft(pids));
  }

  tick(): void {
    this.now += TICK * 1000;
    // 재접속 시간이 다 된 사람은 이탈
    for (const pid of this.presence.expired(this.now)) this.leave(pid);
    // 결과가 나온 뒤, 또는 솔로·전원 끊김이면 세계를 멈춘다
    if (this.state.phase === 'result' || this.presence.paused(this.members.size)) {
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
    for (const [pid, m] of this.members) {
      const sp = this.sim.players.get(pid);
      const dropped = sp ? m.inputs.settleDodge(sp.state, TICK) : null;
      if (dropped !== null) this.out.send(pid, 'rejected', { seq: dropped, reason: 'state' });
    }
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
