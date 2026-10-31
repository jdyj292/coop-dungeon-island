// 방 시뮬레이션 한 틱 (클라이언트 로컬·서버 공용): 몬스터 AI → 투사체·장판 → 플레이어 행동·판정(마법탄 포함) → 몬스터끼리 겹침 풀기
// 예약 판정·투사체 끝 판정·검흔·연쇄·아군 버프는 echoes.ts
// 플레이어는 여러 명 (pid로 구분). 솔로는 첫 플레이어만 쓰는 tick(dt, input)
import type { ActionDef, ActionRun, WeaponDef } from '../actions';
import { COMBAT, PLAYER } from '../data/load';
import type { MonsterAttack } from '../data/schema';
import { stepMonsterAi, type AiContext, type MonsterEvent } from '../monster/ai';
import { spawnProjectiles, zoneSpeedMul, spawnZone, stepProjectile, stepZone, type Projectile, type ZoneArea } from '../monster/hazards';
import { newMonster, stepBodyIn, type Monster } from '../monster/state';
import { recordGroggyHit } from '../monster/groggy';
import { AttackTokens } from '../monster/tokens';
import type { Bounds, Vec2 } from '../movement';
import { canDodge, mergePresses, newPlayerState, stepPlayerState, type PlayerInput, type PlayerState } from '../player';
import { gainUlt, hurtPlayer, isInvulnerable } from '../playerHurt';
import { comboHit, milestoneHit, newCombo, stepCombo, teamComboHit, type Combo } from '../combo';
import type { PlayerTarget } from '../shapes';
import { gradeTiming } from '../hit';
import { chooseTarget } from './aim';
import { separateMonsters } from './separate';
import { PositionHistory, type PastPos } from './history';
import { HitLog } from './hitLog';
import { perksOf } from '../passives';
import { phaseIsActive, strike, type PosOf, type StrikeHit } from './strike';
import { spawnBolt, type Bolt, type Cast } from './bolts';
import { afterLand, overheatShot, skillActive, slam, stepEchoes, stepPlayerBolts, tickPerkTimers } from './echoes';
import { markScar } from './scar';
import type { Echo } from './skillExtras';

export type { SimEvent, SimOptions, SimPlayer, Spawn } from './types';
import type { SimEvent, SimOptions, SimPlayer, Spawn } from './types';

/** 솔로·로컬 플레이어 id */
export const SOLO_PID = 'p1';
const IDLE: PlayerInput = { x: 0, y: 0, attack: false, skill: null, backstep: false };

export class RoomSim {
  readonly players = new Map<string, SimPlayer>();
  monsters: Monster[] = [];
  projectiles: Projectile[] = [];
  zones: ZoneArea[] = [];
  /** 플레이어 마법탄 (스태프) */
  bolts: Bolt[] = [];
  /** 변형 예약 판정 (반복·후속, skillExtras.ts) */
  echoes: Echo[] = [];
  tokens: AttackTokens;
  private ids = 1;
  /** 몬스터 id → 노리는 플레이어 */
  private aim = new Map<number, string>();
  /** 행동마다 이미 맞은 몬스터 id (같은 행동에 한 대상은 한 번, combat.md 2장) */
  private struck = new WeakMap<ActionRun, Set<number>>();
  /** 시뮬레이션 시각 (초) */
  time = 0;
  /** 몬스터 위치 기록 (되감기 판정) */
  readonly history = new PositionHistory();
  /** 몬스터 id → 히트스톱 남은 시간 */
  private monsterStop = new Map<number, number>();
  /** 팀 콤보 (partySize 2 이상일 때만 센다, 솔로는 개인 콤보) */
  readonly team: Combo = newCombo();

  /** playerPos가 있으면 솔로 플레이어(SOLO_PID)를 바로 넣는다 */
  constructor(readonly weapon: WeaponDef, readonly bounds: Bounds, playerPos: Vec2 | null, readonly opts: SimOptions = {}) {
    if (playerPos) this.addPlayer(SOLO_PID, playerPos).skills = opts.skills ?? {};
    this.tokens = new AttackTokens(opts.partySize ?? 1);
  }

  addPlayer(pid: string, pos: Vec2, weapon: WeaponDef = this.weapon): SimPlayer {
    const sp: SimPlayer = { pid, state: newPlayerState({ ...pos }), weapon, combo: newCombo(), rewind: 0, stop: 0, hits: new HitLog(), held: null, away: false, skills: {} };
    this.players.set(pid, sp);
    return sp;
  }

  /**
   * 다른 방에서 온 플레이어 (방 진행, dungeon.md 2장): HP·MP·물약·쿨타임·필살기·깃털은 그대로,
   * 위치는 새 방 시작 지점, 행동·백스텝·경직과 지연 보정 기록은 비운다
   */
  adoptPlayer(from: SimPlayer, pos: Vec2): SimPlayer {
    const fresh = newPlayerState({ ...pos });
    const p = from.state;
    const state: PlayerState = { ...p, pos: fresh.pos, fighter: fresh.fighter, run: fresh.run, backstep: null, hurt: null };
    const sp: SimPlayer = { pid: from.pid, state, weapon: from.weapon, combo: newCombo(), rewind: 0, stop: 0, hits: new HitLog(), held: null, away: from.away, skills: from.skills };
    this.players.set(sp.pid, sp);
    return sp;
  }

  /**
   * 인원이 바뀜 (이탈, network.md 10장): 공격 토큰 수와 몬스터 체력 배율을 새 인원으로. 지금 체력 비율은 유지
   */
  setPartySize(n: number): void {
    this.opts.partySize = n;
    this.tokens = new AttackTokens(n);
    for (const m of this.monsters) m.hasToken = false;
    const mul = COMBAT.partyHpMul[Math.min(4, Math.max(1, n)) - 1]!;
    for (const m of this.alive) {
      const ratio = m.hp / m.maxHp;
      m.maxHp = Math.round(m.def.hp * mul);
      m.hp = m.hp > 0 ? Math.max(1, Math.round(m.maxHp * ratio)) : 0;
    }
  }

  removePlayer(pid: string): void {
    this.players.delete(pid);
  }

  /** 첫 플레이어 (솔로) */
  get player(): PlayerState {
    return this.first.state;
  }

  get combo(): Combo {
    return this.first.combo;
  }

  private get first(): SimPlayer {
    const sp = this.players.values().next().value;
    if (!sp) throw new Error('RoomSim: 플레이어 없음');
    return sp;
  }

  spawn(list: Spawn[]): Monster[] {
    const mul = COMBAT.partyHpMul[Math.min(4, Math.max(1, this.opts.partySize ?? 1)) - 1]!;
    const made = list.map((s) => newMonster(this.ids++, s.kind, s.x, s.y, mul));
    this.monsters.push(...made);
    return made;
  }

  /** 지금 있는 몬스터를 잠든 채로 (rooms.json wakeSec, dungeon.md 5장) */
  sleepAll(sec: number): void {
    for (const m of this.alive) m.sleep = sec;
  }

  /** 퇴장하지 않은 몬스터 */
  get alive(): Monster[] {
    return this.monsters.filter((m) => !m.body.gone);
  }

  /** 맞을 수 있는 플레이어들 (백스텝·기상 무적, 다운, 쓰러짐 제외) */
  playerTargets(): PlayerTarget[] {
    const out: PlayerTarget[] = [];
    for (const { pid, state: p, away } of this.players.values()) {
      if (!away && !isInvulnerable(p)) out.push({ pid, x: p.pos.x, y: p.pos.y, airborne: false, hurtbox: PLAYER.hurtbox });
    }
    return out;
  }

  /** 솔로: 첫 플레이어 입력으로 한 틱 */
  tick(dt: number, input: PlayerInput): { events: SimEvent[]; moved: number } {
    const { events, moved } = this.step(dt, new Map([[this.first.pid, input]]));
    return { events, moved: moved.get(this.first.pid) ?? 0 };
  }

  /** 한 틱. inputs에 없는 플레이어는 입력 없음. moved = 플레이어별 걸은 거리 */
  step(dt: number, inputs: ReadonlyMap<string, PlayerInput>): { events: SimEvent[]; moved: Map<string, number> } {
    const events: SimEvent[] = [];
    this.time += dt;
    const b = this.bounds, targets = this.playerTargets();
    for (const sp of this.players.values()) stepCombo(sp.combo, dt);
    stepCombo(this.team, dt);
    this.tokens.step(dt);
    // 잠은 누군가 우물에서 떨어져 착지한 뒤부터 줄어든다
    const landed = [...this.players.values()].some((sp) => !sp.away && sp.state.arrive <= 0);
    // 1. 몬스터 먼저: 이번 틱에 맞은 번쩍임·경직이 같은 틱에 깎이지 않게
    for (const m of this.alive) {
      if (m.sleep > 0 && landed) m.sleep = Math.max(0, m.sleep - dt);
      // 히트스톱 중인 몬스터는 그대로 멈춤
      const stop = this.monsterStop.get(m.id) ?? 0;
      if (stop > 0) {
        this.monsterStop.set(m.id, Math.max(0, stop - dt));
        continue;
      }
      const aimed = this.aimFor(m);
      // 플레이어가 아직 없으면(서버 방 생성 직후) 몸 물리만
      if (!aimed) {
        stepBodyIn(m, dt, b);
        continue;
      }
      const ctx: AiContext = {
        player: { x: aimed.state.pos.x, y: aimed.state.pos.y }, target: targets.find((t) => t.pid === aimed.pid) ?? null,
        targets, tokens: this.tokens, bounds: b,
        eliteBusy: (self) => this.alive.some((o) => o !== self && o.def.rank === 'elite' && o.mode === 'attack'),
        others: this.alive,
        rng: this.opts.rng ?? Math.random,
      };
      const evs: MonsterEvent[] = this.opts.ai === false
        ? stepBodyIn(m, dt, b).map((e) => ({ type: 'body' as const, e }))
        : stepMonsterAi(m, dt, ctx);
      if (this.opts.ai === false && m.body.state === 'idle') m.facing = aimed.state.pos.x < m.body.x ? -1 : 1;
      for (const e of evs) {
        events.push({ type: 'monster', m, e });
        if (e.type === 'playerHit') this.hitPlayer(events, e.pid, m, e.def, e.damage, this.awayFrom(m, e.pid));
        if (e.type === 'shoot') this.projectiles.push(...spawnProjectiles(() => this.ids++, m.id, e.def, m.body.x, m.body.y, m.attack?.dir ?? m.facing, ctx.player));
        if (e.type === 'zone') this.zones.push(spawnZone(this.ids++, e.def, { x: m.body.x, y: m.body.y, facing: m.facing }));
        if (e.type === 'body' && e.e === 'wall' && m.wallBy) slam(this, m, events);
      }
    }
    // 2. 투사체·장판
    for (const pr of this.projectiles) {
      for (const pid of stepProjectile(pr, dt, b, this.playerTargets())) {
        this.hitPlayer(events, pid, this.monsters.find((m) => m.id === pr.ownerId), pr.def, pr.def.damage, pr.dir);
      }
    }
    this.projectiles = this.projectiles.filter((pr) => !pr.done);
    this.zones.forEach((z) => stepZone(z, dt));
    this.zones = this.zones.filter((z) => z.left > 0);
    // 3. 플레이어 행동과 판정 (active 동안 매 틱)
    const moved = new Map<string, number>();
    for (const sp of this.players.values()) moved.set(sp.pid, this.stepPlayer(sp, inputs.get(sp.pid) ?? IDLE, dt, events));
    stepEchoes(this, events);
    this.stepTeamCombo(events);
    // 4. 몬스터끼리 겹침 풀기 (지상·공격 중 아닐 때)
    separateMonsters(this.alive, this.bounds);
    this.recordHistory();
    return { events, moved };
  }

  /** 이 몬스터가 노리는 플레이어 (아무도 없으면 undefined) */
  private aimFor(m: Monster): SimPlayer | undefined {
    // 접속이 끊긴 사람은 노리지 않는다 (network.md 10장)
    const pid = chooseTarget(m, [...this.players.values()].filter((sp) => !sp.away), this.aim.get(m.id));
    if (pid) this.aim.set(m.id, pid);
    return pid ? this.players.get(pid) : undefined;
  }

  private stepTeamCombo(events: SimEvent[]): void {
    if ((this.opts.partySize ?? 1) < 2) return;
    const hits = events.filter((e) => e.type === 'hit').length;
    const milestone = teamComboHit(this.team, hits);
    if (milestone === null) return;
    for (const sp of this.players.values()) gainUlt(sp.state, PLAYER.ultimate.onTeamMilestone);
    events.push({ type: 'teamMilestone', count: milestone });
  }

  /** 회피 소급 무적: 입력 시각(초) 뒤 짧은 시간 안의 피격 취소 (쿨타임 중·지구력 부족이면 안 함). 취소한 피격 수 */
  cancelHitsSince(pid: string, inputT: number): number {
    const sp = this.players.get(pid);
    if (!sp || !canDodge(sp.state)) return 0;
    return sp.hits.cancelSince(sp.state, inputT);
  }

  private recordHistory(): void {
    const items = new Map<number, PastPos>();
    for (const m of this.alive) items.set(m.id, { x: m.body.x, y: m.body.y, z: m.body.z, airborne: m.body.state === 'air' });
    this.history.record(this.time, items);
  }

  private stepPlayer(sp: SimPlayer, raw: PlayerInput, dt: number, events: SimEvent[]): number {
    const { pid, state: p } = sp;
    if (sp.away) return 0;
    if (sp.stop > 0) {
      sp.stop = Math.max(0, sp.stop - dt);
      sp.held = mergePresses(sp.held, raw);
      return 0;
    }
    const input = sp.held ? { ...mergePresses(sp.held, raw)!, x: raw.x, y: raw.y, run: raw.run } : raw;
    sp.held = null;
    p.perks = perksOf(sp.weapon, sp.skills);
    tickPerkTimers(p, dt);
    const res = stepPlayerState(p, sp.weapon, input, dt, this.bounds, zoneSpeedMul(this.zones, p.pos, PLAYER.hurtbox));
    if (res.backstepStarted) events.push({ type: 'backstep', pid });
    res.hurt.forEach((e) => events.push({ type: 'playerHurt', pid, e }));
    if (res.potion) events.push({ type: 'potion', pid, kind: res.potion });
    const runs = new Set<ActionRun>();
    for (const e of res.events) {
      events.push({ type: 'fighter', pid, e });
      if (e.type !== 'active') continue;
      runs.add(e.run);
      const def = e.run.def, cast = e.run.kind === 'skill' ? { n: (sp.casts = (sp.casts ?? 0) + 1), skill: def.id } : undefined;
      // 투사체 행동은 active 순간 한 번 발사 (판정은 날아가는 마법탄이, 판정 모양이 없어 strike는 맞히지 않음). 평타면 과열 추가 발
      if (def.projectile) this.shoot(sp, def, events, cast);
      if (def.projectile && !cast) overheatShot(this, sp, def);
      if (cast) skillActive(this, sp, def, cast, events);
    }
    if (p.fighter.run && phaseIsActive(p.fighter.run)) runs.add(p.fighter.run);
    let hits = 0;
    const posOf: PosOf | undefined = sp.rewind > 0
      ? (m) => this.history.at(m.id, this.time - sp.rewind) ?? { x: m.body.x, y: m.body.y, airborne: m.body.state === 'air' }
      : undefined;
    for (const run of runs) {
      let done = this.struck.get(run);
      if (!done) this.struck.set(run, (done = new Set()));
      hits += this.landHits(sp, run.def, strike(p, run, this.alive, done, posOf), events);
    }
    hits += stepPlayerBolts(this, sp, dt, events);
    this.bolts = this.bolts.filter((b) => (b.done ? (events.push({ type: 'boltEnd', bolt: b }), false) : true));
    this.countCombo(sp, hits, events);
    return res.moved;
  }

  /** 솔로는 개인 콤보 단계가 코인 보너스 (파티는 팀 콤보, stepTeamCombo). countCombo·shoot·landHits·nextId는 echoes.ts도 쓴다 */
  countCombo(sp: SimPlayer, hits: number, events: SimEvent[]): void {
    if ((this.opts.partySize ?? 1) < 2) {
      const ms = milestoneHit(sp.combo, hits, COMBAT.combo.soloMilestones);
      if (ms !== null) events.push({ type: 'comboMilestone', pid: sp.pid, count: ms });
    } else comboHit(sp.combo, hits);
  }

  /** 마법탄 발사 (lanes면 깊이마다 한 발씩) */
  shoot(sp: SimPlayer, def: ActionDef, events: SimEvent[], cast?: Cast): void {
    for (const dy of def.projectile?.lanes ?? [0]) {
      const b = spawnBolt(this.nextId(), sp.pid, def, sp.state.pos.x, sp.state.pos.y + dy, sp.state.facing, undefined, cast);
      this.bolts.push(b);
      events.push({ type: 'bolt', bolt: b });
    }
  }

  nextId(): number {
    return this.ids++;
  }

  /** 적중 사건·기절·보스 졸음 연장(파티: 서로 다른 2명, 솔로: 15히트)·히트스톱. 적중 수. echo = 예약 판정 (공격자는 멈추지 않음) */
  landHits(sp: SimPlayer, def: ActionDef, hits: StrikeHit[], events: SimEvent[], echo = false): number {
    for (const h of hits) {
      const sec = gradeTiming(def.fx?.grade ?? 'light').hitstop;
      // 근접 역경직: 근접 무기는 더 오래 멈추고, 맞은 몬스터도 같은 시간 멈춘다 (weapons.json recoilMul, combat.md 5장)
      const recoil = echo ? 0 : sec * (sp.weapon.recoilMul ?? 1);
      // actT = 맞힌 틱의 내 행동 진행 시간 (클라이언트가 예측 기록에서 같은 틱을 찾아 멈춤을 맞춘다, network.md 9장)
      const run = echo ? null : sp.state.fighter.run;
      events.push({ type: 'hit', pid: sp.pid, m: h.m, def, damage: h.damage, recoil, act: run?.def.id ?? '', actT: run?.t ?? -1 });
      if (h.ko) events.push({ type: 'ko', pid: sp.pid, m: h.m });
      recordGroggyHit(h.m, sp.pid, (this.opts.partySize ?? 1) >= 2);
      // 해제 판정을 걸어둠 (그 행동이 건 빙결이 풀릴 때), 벽꿍은 다음 적중이 덮어쓴다
      if (def.onStatusEnd && h.m.frozen > 0) h.m.frozenBy = { pid: sp.pid, def };
      markScar(sp.pid, def, h.m);
      if (def.onWall) h.m.wallBy = { pid: sp.pid, def };
      else delete h.m.wallBy;
      if (this.opts.hitstop === 'entity') {
        sp.stop = Math.max(sp.stop, recoil);
        this.monsterStop.set(h.m.id, Math.max(this.monsterStop.get(h.m.id) ?? 0, recoil || sec));
      }
    }
    afterLand(this, sp, def, hits);
    return hits.length;
  }

  /** 몬스터에서 멀어지는 방향 (같은 x면 몬스터가 바라보는 쪽) */
  private awayFrom(m: Monster, pid: string): number {
    const p = this.players.get(pid)?.state;
    return (p && Math.sign(p.pos.x - m.body.x)) || m.facing;
  }

  /** 몬스터 공격 적중 → HP·경직·다운·넉백 (무적이면 무시). pushDir = 밀려날 방향 */
  private hitPlayer(events: SimEvent[], pid: string, from: Monster | undefined, def: MonsterAttack, damage: number, pushDir: number): void {
    const sp = this.players.get(pid), p = sp?.state;
    if (!sp || !p || sp.away) return;
    if (!isInvulnerable(p)) sp.hits.save(this.time, p);
    const hurt = hurtPlayer(p, damage, def.strength, pushDir);
    if (!hurt.length) return;
    events.push({ type: 'playerHit', pid, from, def, damage });
    gainUlt(p, PLAYER.ultimate.onHurt);
    hurt.forEach((e) => events.push({ type: 'playerHurt', pid, e }));
  }
}
