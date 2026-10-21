// 몬스터 공격 진행: 구간·이동·벽 충돌·플레이어 판정·투사체/장판 발사 (docs/combat.md 2·6장)
import { actionMoveDelta } from '../actions';
import type { BodyEvent } from '../body';
import type { MonsterAttack } from '../data/schema';
import type { Bounds } from '../movement';
import { actionHits, type HitTarget, type PlayerTarget } from '../shapes';
import { attackPhase, monsterBounds, type Monster } from './state';
import type { AttackTokens } from './tokens';

export interface AiContext {
  /** 이 몬스터가 노리는 플레이어 위치 (dungeon.md 3장 대상 선택) */
  player: { x: number; y: number };
  /** 노리는 플레이어의 판정 (무적이면 null) — 닿을지 고를 때 */
  target: HitTarget | null;
  /** 맞을 수 있는 모든 플레이어 — 실제 적중 판정 */
  targets: PlayerTarget[];
  tokens: AttackTokens;
  bounds: Bounds;
  /** 다른 정예가 공격 중인가 (정예는 동시에 1마리만, dungeon.md 3장) */
  eliteBusy: (self: Monster) => boolean;
  rng: () => number;
}

export type MonsterEvent =
  | { type: 'attackStart'; def: MonsterAttack }
  | { type: 'active'; def: MonsterAttack }
  | { type: 'attackEnd'; def: MonsterAttack }
  | { type: 'playerHit'; pid: string; def: MonsterAttack; damage: number }
  | { type: 'wallHit'; groggy: boolean }
  | { type: 'shoot'; def: MonsterAttack }
  | { type: 'zone'; def: MonsterAttack }
  | { type: 'body'; e: BodyEvent };

export function startAttack(m: Monster, def: MonsterAttack, ctx: AiContext): MonsterEvent {
  if (m.def.usesToken) ctx.tokens.tryTake(m.id);
  m.hasToken = m.def.usesToken;
  m.attack = { def, t: 0, dir: m.facing, struck: [] };
  m.mode = 'attack';
  return { type: 'attackStart', def };
}

/** 공격 중단·종료: 토큰 반납 */
export function endAttack(m: Monster, ctx: AiContext): void {
  m.attack = null;
  if (m.mode === 'attack') m.mode = 'idle';
  if (m.hasToken) ctx.tokens.release(m.id);
  m.hasToken = false;
}

/** 보스 공격이 끝나면 다음 순서로 넘기고 쉬는 시간 (data.md 4장 ai.idleBetween) */
function afterBossAttack(m: Monster, ctx: AiContext): void {
  if (m.def.pattern.type !== 'loop') return;
  const seq = m.def.pattern.phases[m.loop.phase]!.sequence;
  m.loop.index = (m.loop.index + 1) % seq.length;
  const [a, b] = m.def.ai.idleBetween ?? [0, 0];
  m.timer = a + (b - a) * ctx.rng();
}

export function stepAttack(m: Monster, dt: number, ctx: AiContext): MonsterEvent[] {
  const a = m.attack!, def = a.def, ev: MonsterEvent[] = [];
  const before = attackPhase(m), t0 = a.t;
  a.t += dt;
  const after = attackPhase(m);

  // 행동 중 이동 (몸통 박치기 전진, 돌진·구르기). 벽에 막히면 onWallHit
  const mv = actionMoveDelta(def, t0, a.t);
  if (mv) {
    const want = m.body.x + a.dir * mv;
    const bd = monsterBounds(m, ctx.bounds);
    m.body.x = Math.min(bd.maxX, Math.max(bd.minX, want));
    const blocked = m.body.x !== want;
    if (blocked && def.move && 'speed' in def.move && def.move.stopOnWall) {
      const hit = def.onWallHit;
      const groggy = !!hit && 'groggy' in hit;
      m.cooldowns[def.id] = def.cooldown ?? 0;
      afterBossAttack(m, ctx);
      endAttack(m, ctx);
      // 멧돼지: 어지러움 selfStun초, 이끼곰: 그로기 (슈퍼아머 해제)
      if (groggy) Object.assign(m, { mode: 'groggy', timer: m.def.groggy?.duration ?? 0 });
      else if (hit && 'selfStun' in hit) Object.assign(m, { mode: 'selfStun', timer: hit.selfStun });
      ev.push({ type: 'wallHit', groggy });
      return ev;
    }
  }

  if (before === 'windup' && after !== 'windup') {
    ev.push({ type: 'active', def });
    if (def.projectile) ev.push({ type: 'shoot', def });
    if (def.zone) ev.push({ type: 'zone', def });
  }
  const activeNow = after === 'active' || (before === 'windup' && after !== 'windup');
  if (activeNow && def.damage > 0) {
    for (const t of ctx.targets) {
      if (a.struck.includes(t.pid) || !actionHits({ x: m.body.x, y: m.body.y, facing: a.dir }, def, t)) continue;
      a.struck.push(t.pid);
      ev.push({ type: 'playerHit', pid: t.pid, def, damage: def.damage });
    }
  }
  // 토큰은 windup~active 동안만 (recovery부터 반납)
  if (after !== 'windup' && after !== 'active' && m.hasToken) {
    ctx.tokens.release(m.id);
    m.hasToken = false;
  }
  if (after === null) {
    m.cooldowns[def.id] = def.cooldown ?? 0;
    afterBossAttack(m, ctx);
    endAttack(m, ctx);
    ev.push({ type: 'attackEnd', def });
  }
  return ev;
}
