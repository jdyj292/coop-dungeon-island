// 플레이어 한 틱 (클라이언트 예측·서버 판정 공용): 행동·대시·백스텝·스킬 쿨타임·걷기·달리기 (docs/combat.md 1·2장)
import {
  actionMoveDelta, canTurn, newFighter, stepFighter,
  type ActionDef, type ActionRun, type Fighter, type FighterEvent, type WeaponDef,
} from './actions';
import { COMBAT, PLAYER } from './data/load';
import { moveSpeed, newRunState, stepMove, stepRun, type Bounds, type RunState, type Vec2 } from './movement';

export interface PlayerState {
  pos: Vec2;
  /** 1 = 오른쪽, -1 = 왼쪽 */
  facing: number;
  fighter: Fighter;
  run: RunState;
  /** 백스텝 중이면 경과 시간 */
  backstep: { t: number } | null;
  backstepCd: number;
  /** 스킬 id → 남은 쿨타임 (실제 쿨 = 기준 쿨 × cooldownScale) */
  cooldowns: Record<string, number>;
}

export const newPlayerState = (pos: Vec2): PlayerState => ({
  pos, facing: 1, fighter: newFighter(), run: newRunState(), backstep: null, backstepCd: 0, cooldowns: {},
});

export interface PlayerInput {
  x: number;
  y: number;
  /** 이번 틱에 누름 */
  attack: boolean;
  skill: ActionDef | null;
  backstep: boolean;
}

export interface PlayerStep {
  events: FighterEvent[];
  /** 걷기·달리기로 움직인 거리 (걷기 박자용) */
  moved: number;
  running: boolean;
  backstepStarted: boolean;
}

/** 백스텝 앞 invuln초 동안 무적 */
export const isInvulnerable = (p: PlayerState): boolean => !!p.backstep && p.backstep.t < PLAYER.backstep.invuln;

export const skillReady = (p: PlayerState, skill: ActionDef): boolean => (p.cooldowns[skill.id] ?? 0) <= 0;

const clampX = (x: number, b: Bounds) => Math.min(b.maxX, Math.max(b.minX, x));

export function stepPlayerState(p: PlayerState, weapon: WeaponDef, input: PlayerInput, dt: number, bounds: Bounds): PlayerStep {
  const bs = PLAYER.backstep;
  for (const id of Object.keys(p.cooldowns)) p.cooldowns[id] = Math.max(0, p.cooldowns[id]! - dt);
  p.backstepCd = Math.max(0, p.backstepCd - dt);
  const out: PlayerStep = { events: [], moved: 0, running: false, backstepStarted: false };

  // 백스텝: 공격 중(어느 구간이든) 불가, 쿨 2초. 바라보는 반대쪽으로 고르게 이동하고 그동안 다른 입력은 무시
  if (!p.backstep && input.backstep && !p.fighter.run && p.backstepCd <= 0) {
    p.backstep = { t: 0 };
    p.backstepCd = bs.cooldown;
    out.backstepStarted = true;
  }
  if (p.backstep) {
    const t0 = p.backstep.t, t1 = Math.min(bs.sec, t0 + dt);
    p.pos.x = clampX(p.pos.x - p.facing * (bs.distance * (t1 - t0)) / bs.sec, bounds);
    p.backstep.t = t0 + dt;
    if (p.backstep.t >= bs.sec) p.backstep = null;
    stepRun(p.run, 0, dt);
    return out;
  }

  const running = stepRun(p.run, input.x, dt) && !p.fighter.run;
  const skill = input.skill && skillReady(p, input.skill) ? input.skill : null;
  const before = p.fighter.run && { run: p.fighter.run, t: p.fighter.run.t };
  out.events = stepFighter(p.fighter, weapon, { attack: input.attack, skill, dashing: running }, dt);
  for (const e of out.events) {
    // 쿨타임은 windup 진입 시점부터 (balance.md 2장)
    if (e.type === 'start' && e.run.kind === 'skill' && e.run.def.cooldown) {
      p.cooldowns[e.run.def.id] = e.run.def.cooldown * COMBAT.cooldownScale;
    }
  }
  if (input.x && canTurn(p.fighter)) p.facing = Math.sign(input.x);
  const started = out.events.flatMap((e) => (e.type === 'start' ? [e.run] : []));
  const act = actionMoved(before, started);
  if (act) p.pos.x = clampX(p.pos.x + act * p.facing, bounds);
  if (!p.fighter.run) {
    const next = stepMove(p.pos, input, dt, moveSpeed(running, weapon.moveMul), bounds);
    out.moved = Math.hypot(next.x - p.pos.x, next.y - p.pos.y);
    p.pos = next;
  }
  out.running = running && !p.fighter.run;
  return out;
}

/** 이번 틱의 행동 중 이동 거리: 진행 중이던 행동(끝났으면 끝까지) + 이번 틱에 시작한 행동 */
function actionMoved(before: { run: ActionRun; t: number } | null, started: ActionRun[]): number {
  let d = before ? actionMoveDelta(before.run.def, before.t, before.run.t) : 0;
  for (const r of started) if (r !== before?.run) d += actionMoveDelta(r.def, 0, r.t);
  return d;
}
