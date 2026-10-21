// 방 시뮬레이션 한 틱 (클라이언트 로컬·서버 공용): 몬스터 AI → 투사체·장판 → 플레이어 행동·판정 → 몬스터끼리 겹침 풀기
// 플레이어는 여러 명 (pid로 구분). 솔로는 첫 플레이어만 쓰는 tick(dt, input)
import type { ActionDef, ActionRun, FighterEvent, WeaponDef } from '../actions';
import { stepBody } from '../body';
import { PLAYER, COMBAT } from '../data/load';
import type { MonsterAttack } from '../data/schema';
import { stepMonsterAi, type AiContext, type MonsterEvent } from '../monster/ai';
import { inZone, spawnProjectile, spawnZone, stepProjectile, stepZone, type Projectile, type ZoneArea } from '../monster/hazards';
import { monsterBounds, newMonster, type Monster } from '../monster/state';
import { AttackTokens } from '../monster/tokens';
import type { Bounds, Vec2 } from '../movement';
import { newPlayerState, stepPlayerState, type PlayerInput, type PlayerState } from '../player';
import { gainUlt, hurtPlayer, isInvulnerable, type HurtEvent, type PotionKind } from '../playerHurt';
import { comboHit, newCombo, stepCombo, type Combo } from '../combo';
import type { PlayerTarget } from '../shapes';
import { attackPhase } from '../monster/state';
import { chooseTarget } from './aim';
import { phaseIsActive, strike } from './strike';

export interface Spawn {
  kind: string;
  x: number;
  y: number;
}

/** 방 안 플레이어 한 명 */
export interface SimPlayer {
  pid: string;
  state: PlayerState;
  weapon: WeaponDef;
  /** 개인 콤보 (팀 콤보는 2-6) */
  combo: Combo;
}

/** pid = 그 사건의 플레이어 (hit은 공격자, playerHit·playerHurt는 맞은 사람) */
export type SimEvent =
  | { type: 'fighter'; pid: string; e: FighterEvent }
  | { type: 'backstep'; pid: string }
  /** 플레이어 → 몬스터 적중 */
  | { type: 'hit'; pid: string; m: Monster; def: ActionDef; damage: number }
  | { type: 'monster'; m: Monster; e: MonsterEvent }
  /** 몬스터 공격·투사체 → 플레이어 적중 (HP 감소·경직·다운은 playerHurt) */
  | { type: 'playerHit'; pid: string; from: Monster | undefined; def: MonsterAttack; damage: number }
  | { type: 'playerHurt'; pid: string; e: HurtEvent }
  | { type: 'potion'; pid: string; kind: PotionKind };

export interface SimOptions {
  /** false면 몬스터가 움직이거나 공격하지 않음 (tools/motion-preview) */
  ai?: boolean;
  partySize?: number;
  rng?: () => number;
}

/** 솔로·로컬 플레이어 id */
export const SOLO_PID = 'p1';
const IDLE: PlayerInput = { x: 0, y: 0, attack: false, skill: null, backstep: false };

export class RoomSim {
  readonly players = new Map<string, SimPlayer>();
  monsters: Monster[] = [];
  projectiles: Projectile[] = [];
  zones: ZoneArea[] = [];
  tokens: AttackTokens;
  private ids = 1;
  /** 몬스터 id → 노리는 플레이어 */
  private aim = new Map<number, string>();
  /** 행동마다 이미 맞은 몬스터 id (같은 행동에 한 대상은 한 번, combat.md 2장) */
  private struck = new WeakMap<ActionRun, Set<number>>();

  /** playerPos가 있으면 솔로 플레이어(SOLO_PID)를 바로 넣는다 */
  constructor(readonly weapon: WeaponDef, readonly bounds: Bounds, playerPos: Vec2 | null, readonly opts: SimOptions = {}) {
    if (playerPos) this.addPlayer(SOLO_PID, playerPos);
    this.tokens = new AttackTokens(opts.partySize ?? 1);
  }

  addPlayer(pid: string, pos: Vec2, weapon: WeaponDef = this.weapon): SimPlayer {
    const sp: SimPlayer = { pid, state: newPlayerState({ ...pos }), weapon, combo: newCombo() };
    this.players.set(pid, sp);
    return sp;
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
    const made = list.map((s) => newMonster(this.ids++, s.kind, s.x, s.y));
    this.monsters.push(...made);
    return made;
  }

  /** 퇴장하지 않은 몬스터 */
  get alive(): Monster[] {
    return this.monsters.filter((m) => !m.body.gone);
  }

  /** 맞을 수 있는 플레이어들 (백스텝·기상 무적, 다운, 쓰러짐 제외) */
  playerTargets(): PlayerTarget[] {
    const out: PlayerTarget[] = [];
    for (const { pid, state: p } of this.players.values()) {
      if (!isInvulnerable(p)) out.push({ pid, x: p.pos.x, y: p.pos.y, airborne: false, hurtbox: PLAYER.hurtbox });
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
    const b = this.bounds, targets = this.playerTargets();
    for (const sp of this.players.values()) stepCombo(sp.combo, dt);
    // 1. 몬스터 먼저: 이번 틱에 맞은 번쩍임·경직이 같은 틱에 깎이지 않게
    for (const m of this.alive) {
      const aimed = this.aimFor(m);
      const ctx: AiContext = {
        player: { x: aimed.state.pos.x, y: aimed.state.pos.y }, target: targets.find((t) => t.pid === aimed.pid) ?? null,
        targets, tokens: this.tokens, bounds: b,
        eliteBusy: (self) => this.alive.some((o) => o !== self && o.def.rank === 'elite' && o.mode === 'attack'),
        rng: this.opts.rng ?? Math.random,
      };
      const evs: MonsterEvent[] = this.opts.ai === false
        ? stepBody(m.body, dt, monsterBounds(m, b).minX, monsterBounds(m, b).maxX).map((e) => ({ type: 'body' as const, e }))
        : stepMonsterAi(m, dt, ctx);
      if (this.opts.ai === false && m.body.state === 'idle') m.facing = aimed.state.pos.x < m.body.x ? -1 : 1;
      for (const e of evs) {
        events.push({ type: 'monster', m, e });
        if (e.type === 'playerHit') this.hitPlayer(events, e.pid, m, e.def, e.damage);
        if (e.type === 'shoot') this.projectiles.push(spawnProjectile(this.ids++, m.id, e.def, m.body.x, m.body.y, m.attack?.dir ?? m.facing));
        if (e.type === 'zone') this.zones.push(spawnZone(this.ids++, e.def, { x: m.body.x, y: m.body.y, facing: m.facing }));
      }
    }
    // 2. 투사체·장판
    for (const pr of this.projectiles) {
      for (const pid of stepProjectile(pr, dt, b.minX, b.maxX, this.playerTargets())) {
        this.hitPlayer(events, pid, this.monsters.find((m) => m.id === pr.ownerId), pr.def, pr.def.damage);
      }
    }
    this.projectiles = this.projectiles.filter((pr) => !pr.done);
    this.zones.forEach((z) => stepZone(z, dt));
    this.zones = this.zones.filter((z) => z.left > 0);
    // 3. 플레이어 행동과 판정 (active 동안 매 틱)
    const moved = new Map<string, number>();
    for (const sp of this.players.values()) moved.set(sp.pid, this.stepPlayer(sp, inputs.get(sp.pid) ?? IDLE, dt, events));
    // 4. 몬스터끼리 겹침 풀기 (지상·공격 중 아닐 때)
    this.separate();
    return { events, moved };
  }

  /** 이 몬스터가 노리는 플레이어 */
  private aimFor(m: Monster): SimPlayer {
    const list = [...this.players.values()];
    const pid = chooseTarget(m, list, this.aim.get(m.id));
    if (pid) this.aim.set(m.id, pid);
    return (pid && this.players.get(pid)) || this.first;
  }

  private stepPlayer(sp: SimPlayer, input: PlayerInput, dt: number, events: SimEvent[]): number {
    const { pid, state: p } = sp;
    const res = stepPlayerState(p, sp.weapon, input, dt, this.bounds, this.zoneSpeedMul(p));
    if (res.backstepStarted) events.push({ type: 'backstep', pid });
    res.hurt.forEach((e) => events.push({ type: 'playerHurt', pid, e }));
    if (res.potion) events.push({ type: 'potion', pid, kind: res.potion });
    const runs = new Set<ActionRun>();
    for (const e of res.events) {
      events.push({ type: 'fighter', pid, e });
      if (e.type === 'active') runs.add(e.run);
    }
    if (p.fighter.run && phaseIsActive(p.fighter.run)) runs.add(p.fighter.run);
    let hits = 0;
    for (const run of runs) {
      let done = this.struck.get(run);
      if (!done) this.struck.set(run, (done = new Set()));
      for (const h of strike(p, run, this.alive, done)) {
        events.push({ type: 'hit', pid, m: h.m, def: run.def, damage: h.damage });
        hits++;
      }
    }
    comboHit(sp.combo, hits);
    return res.moved;
  }

  /** 몬스터 공격 적중 → HP·경직·다운 (무적이면 무시) */
  private hitPlayer(events: SimEvent[], pid: string, from: Monster | undefined, def: MonsterAttack, damage: number): void {
    const p = this.players.get(pid)?.state;
    if (!p) return;
    const hurt = hurtPlayer(p, damage, def.strength);
    if (!hurt.length) return;
    events.push({ type: 'playerHit', pid, from, def, damage });
    gainUlt(p, PLAYER.ultimate.onHurt);
    hurt.forEach((e) => events.push({ type: 'playerHurt', pid, e }));
  }

  /** 감속 장판(졸음 구름) 안이면 이동 속도 × (1 - amount) */
  private zoneSpeedMul(p: PlayerState): number {
    const t = { x: p.pos.x, y: p.pos.y, airborne: false, hurtbox: PLAYER.hurtbox };
    let mul = 1;
    for (const z of this.zones) {
      if (z.def.effect.type === 'slow' && inZone(z, t)) mul = Math.min(mul, 1 - (z.def.effect.amount ?? 0));
    }
    return mul;
  }

  private separate(): void {
    // 피격 상자가 겹치면 좌우로 벌린다 (+ separation 여유)
    const margin = COMBAT.ai.separation;
    const list = this.alive.filter((m) => m.body.state === 'idle' && attackPhase(m) === null && m.body.z === 0);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const ma = list[i]!, mc = list[j]!, a = ma.body, c = mc.body;
        const gapX = (ma.def.hurtbox.width + mc.def.hurtbox.width) / 2 + margin;
        const gapY = (ma.def.hurtbox.depth + mc.def.hurtbox.depth) / 2;
        const dx = c.x - a.x;
        if (Math.abs(dx) >= gapX || Math.abs(c.y - a.y) >= gapY) continue;
        const push = (gapX - Math.abs(dx)) / 2, dir = dx >= 0 ? 1 : -1;
        const ba = monsterBounds(ma, this.bounds), bc = monsterBounds(mc, this.bounds);
        a.x = Math.min(ba.maxX, Math.max(ba.minX, a.x - dir * push));
        c.x = Math.min(bc.maxX, Math.max(bc.minX, c.x + dir * push));
      }
    }
  }
}
