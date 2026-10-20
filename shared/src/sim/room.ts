// 방 시뮬레이션 한 틱 (클라이언트 로컬·서버 공용): 몬스터 AI → 투사체·장판 → 플레이어 행동·판정 → 몬스터끼리 겹침 풀기
import type { ActionDef, ActionRun, FighterEvent, WeaponDef } from '../actions';
import { applyHit, canBeHit, stepBody } from '../body';
import { PLAYER, COMBAT } from '../data/load';
import type { MonsterAttack } from '../data/schema';
import { damageOf } from '../hit';
import { stepMonsterAi, type AiContext, type MonsterEvent } from '../monster/ai';
import { spawnProjectile, spawnZone, stepProjectile, stepZone, type Projectile, type ZoneArea } from '../monster/hazards';
import { monsterBounds, newMonster, type Monster } from '../monster/state';
import { AttackTokens } from '../monster/tokens';
import type { Bounds, Vec2 } from '../movement';
import { isInvulnerable, newPlayerState, stepPlayerState, type PlayerInput, type PlayerState } from '../player';
import { actionHits, type HitTarget } from '../shapes';
import { attackPhase } from '../monster/state';

export interface Spawn {
  kind: string;
  x: number;
  y: number;
}

export type SimEvent =
  | { type: 'fighter'; e: FighterEvent }
  | { type: 'backstep' }
  /** 플레이어 → 몬스터 적중 */
  | { type: 'hit'; m: Monster; def: ActionDef; damage: number }
  | { type: 'monster'; m: Monster; e: MonsterEvent }
  /** 몬스터 공격·투사체 → 플레이어 적중 (데미지·경직은 M1 1-5) */
  | { type: 'playerHit'; from: Monster | undefined; def: MonsterAttack; damage: number };

export interface SimOptions {
  /** false면 몬스터가 움직이거나 공격하지 않음 (tools/motion-preview) */
  ai?: boolean;
  partySize?: number;
  rng?: () => number;
}

export class RoomSim {
  player: PlayerState;
  monsters: Monster[] = [];
  projectiles: Projectile[] = [];
  zones: ZoneArea[] = [];
  tokens: AttackTokens;
  private ids = 1;
  /** 행동마다 이미 맞은 몬스터 id (같은 행동에 한 대상은 한 번, combat.md 2장) */
  private struck = new WeakMap<ActionRun, Set<number>>();

  constructor(readonly weapon: WeaponDef, readonly bounds: Bounds, playerPos: Vec2, readonly opts: SimOptions = {}) {
    this.player = newPlayerState({ ...playerPos });
    this.tokens = new AttackTokens(opts.partySize ?? 1);
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

  /** 맞을 수 있는 플레이어 (백스텝 무적이면 null) */
  playerTarget(): HitTarget | null {
    const p = this.player;
    return isInvulnerable(p) ? null : { x: p.pos.x, y: p.pos.y, airborne: false, hurtbox: PLAYER.hurtbox };
  }

  tick(dt: number, input: PlayerInput): { events: SimEvent[]; moved: number } {
    const events: SimEvent[] = [];
    const p = this.player, b = this.bounds;
    const ctx: AiContext = {
      player: { x: p.pos.x, y: p.pos.y }, target: this.playerTarget(), tokens: this.tokens, bounds: b,
      eliteBusy: (self) => this.alive.some((m) => m !== self && m.def.rank === 'elite' && m.mode === 'attack'),
      rng: this.opts.rng ?? Math.random,
    };
    // 1. 몬스터 먼저: 이번 틱에 맞은 번쩍임·경직이 같은 틱에 깎이지 않게
    for (const m of this.alive) {
      const evs: MonsterEvent[] = this.opts.ai === false
        ? stepBody(m.body, dt, monsterBounds(m, b).minX, monsterBounds(m, b).maxX).map((e) => ({ type: 'body' as const, e }))
        : stepMonsterAi(m, dt, ctx);
      if (this.opts.ai === false && m.body.state === 'idle') m.facing = p.pos.x < m.body.x ? -1 : 1;
      for (const e of evs) {
        events.push({ type: 'monster', m, e });
        if (e.type === 'playerHit') events.push({ type: 'playerHit', from: m, def: e.def, damage: e.damage });
        if (e.type === 'shoot') this.projectiles.push(spawnProjectile(this.ids++, m.id, e.def, m.body.x, m.body.y, m.attack?.dir ?? m.facing));
        if (e.type === 'zone') this.zones.push(spawnZone(this.ids++, e.def, { x: m.body.x, y: m.body.y, facing: m.facing }));
      }
    }
    // 2. 투사체·장판
    for (const pr of this.projectiles) {
      if (stepProjectile(pr, dt, b.minX, b.maxX, this.playerTarget())) {
        events.push({ type: 'playerHit', from: this.monsters.find((m) => m.id === pr.ownerId), def: pr.def, damage: pr.def.damage });
      }
    }
    this.projectiles = this.projectiles.filter((pr) => !pr.done);
    this.zones.forEach((z) => stepZone(z, dt));
    this.zones = this.zones.filter((z) => z.left > 0);
    // 3. 플레이어 행동과 판정 (active 동안 매 틱)
    const res = stepPlayerState(p, this.weapon, input, dt, b);
    if (res.backstepStarted) events.push({ type: 'backstep' });
    const runs = new Set<ActionRun>();
    for (const e of res.events) {
      events.push({ type: 'fighter', e });
      if (e.type === 'active') runs.add(e.run);
    }
    if (p.fighter.run && phaseIsActive(p.fighter.run)) runs.add(p.fighter.run);
    for (const run of runs) for (const h of this.strike(run)) events.push(h);
    // 4. 몬스터끼리 겹침 풀기 (지상·공격 중 아닐 때)
    this.separate();
    return { events, moved: res.moved };
  }

  /** 판정에 든 몬스터 모두에게 적중. 체력 0이면 기절 (combat.md 3장) */
  private strike(run: ActionRun): SimEvent[] {
    const p = this.player, def = run.def, out: SimEvent[] = [];
    let done = this.struck.get(run);
    if (!done) this.struck.set(run, (done = new Set()));
    const a = { x: p.pos.x, y: p.pos.y, facing: p.facing };
    for (const m of this.alive) {
      if (done.has(m.id) || !canBeHit(m.body, def.flags)) continue;
      const t = { x: m.body.x, y: m.body.y, airborne: m.body.state === 'air', hurtbox: m.def.hurtbox };
      if (!actionHits(a, def, t)) continue;
      done.add(m.id);
      applyHit(m.body, { dir: p.facing, strength: def.strength ?? 'light', flags: def.flags, launchVz: def.launchVz });
      const damage = damageOf(def.coef);
      m.hp = Math.max(0, m.hp - damage);
      if (m.hp === 0) m.body.ko = true;
      out.push({ type: 'hit', m, def, damage });
    }
    return out;
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

function phaseIsActive(run: ActionRun): boolean {
  const { windup, active } = run.def.phases;
  return run.t >= windup && run.t < windup + active;
}
