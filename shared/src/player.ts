// 플레이어 한 틱 (클라이언트 예측·서버 판정 공용): 행동·대시·회피(코드 이름 backstep)·지구력·스킬 쿨타임·걷기·달리기 (docs/combat.md 1·2장)
import {
  actionMoveDelta, canTurn, newFighter, stepFighter,
  type ActionDef, type ActionRun, type Fighter, type FighterEvent, type WeaponDef,
} from './actions';
import { COMBAT, PLAYER } from './data/load';
import { moveSpeed, newRunState, stepMove, stepRun, type Bounds, type RunState, type Vec2, playerHalf } from './movement';
import { moveBox } from './map/collision';
import { newVitals, stepVitals, usePotion, type HurtEvent, type PotionKind, type Vitals } from './playerHurt';

export interface PlayerState extends Vitals {
  pos: Vec2;
  /** 1 = 오른쪽, -1 = 왼쪽 */
  facing: number;
  fighter: Fighter;
  run: RunState;
  /** 회피 중이면 경과 시간과 이동 방향 (1 = 오른쪽, -1 = 왼쪽) */
  backstep: { t: number; dir: number } | null;
  backstepCd: number;
  /** 지구력 (회피·달리기에 씀), 회복까지 남은 대기 시간 */
  stamina: number;
  staminaWait: number;
  /** 달리다 지구력이 바닥남: 달리기 입력을 뗄 때까지 걷기 */
  tired: boolean;
  /** 스킬 id → 남은 쿨타임 (실제 쿨 = 기준 쿨 × cooldownScale) */
  cooldowns: Record<string, number>;
}

export const newPlayerState = (pos: Vec2): PlayerState => ({
  pos, facing: 1, fighter: newFighter(), run: newRunState(), backstep: null, backstepCd: 0, stamina: PLAYER.stamina.max, staminaWait: 0, tired: false, cooldowns: {}, ...newVitals(),
});

export interface PlayerInput {
  x: number;
  y: number;
  /** 이번 틱에 누름 */
  attack: boolean;
  skill: ActionDef | null;
  backstep: boolean;
  /** Z = hp, X = mp */
  potion?: PotionKind | null;
  /** 있으면 두 번 누르기 판정 대신 이 값으로 달리기 (네트워크 입력) */
  run?: boolean;
}

export interface PlayerStep {
  events: FighterEvent[];
  /** 걷기·달리기로 움직인 거리 (걷기 박자용) */
  moved: number;
  running: boolean;
  backstepStarted: boolean;
  /** 경직 끝남·기상 등 (피격 자체는 playerHurt.hurtPlayer가 돌려줌) */
  hurt: HurtEvent[];
  potion: PotionKind | null;
}

/** 쿨타임이 끝났고 MP가 충분한가 (MP = skills.json mp) */
export const skillReady = (p: PlayerState, skill: ActionDef): boolean =>
  (p.cooldowns[skill.id] ?? 0) <= 0 && p.mp >= (skill.mp ?? 0);

/** 회피 가능: 쿨타임이 끝났고 지구력이 1회분 이상 (공격 중 여부는 stepPlayerState가 본다) */
export const canDodge = (p: PlayerState): boolean => p.backstepCd <= 0 && p.stamina >= PLAYER.stamina.dodge;

function spendStamina(p: PlayerState, n: number): void {
  p.stamina = Math.max(0, p.stamina - n);
  p.staminaWait = PLAYER.stamina.regenDelay;
}

/** 행동·회피의 좌우 이동 (방 경계·장애물에 막힘) */
const moveX = (p: PlayerState, x: number, b: Bounds) => { p.pos = moveBox(p.pos, { x, y: p.pos.y }, playerHalf(), b); };

/** speedMul: 장판 감속 등 이동 속도 배율 */
export function stepPlayerState(
  p: PlayerState, weapon: WeaponDef, input: PlayerInput, dt: number, bounds: Bounds, speedMul = 1,
): PlayerStep {
  const bs = PLAYER.backstep, st = PLAYER.stamina;
  for (const id of Object.keys(p.cooldowns)) p.cooldowns[id] = Math.max(0, p.cooldowns[id]! - dt);
  p.backstepCd = Math.max(0, p.backstepCd - dt);
  p.staminaWait = Math.max(0, p.staminaWait - dt);
  if (p.staminaWait <= 0) p.stamina = Math.min(st.max, p.stamina + st.regen * dt);
  const out: PlayerStep = { events: [], moved: 0, running: false, backstepStarted: false, hurt: stepVitals(p, dt), potion: null };
  // 쓰러짐·경직·다운 중에는 조작 불가 (물약도 다운 중 불가, playerHurt.usePotion)
  if (p.downed) return out;
  if (input.potion && usePotion(p, input.potion)) out.potion = input.potion;
  if (p.hurt) {
    // 맞아서 밀려남 (벽·장애물에 막힘)
    const push = p.hurt.push;
    if (push && push.left > 0) {
      const t = Math.min(dt, push.left);
      moveX(p, p.pos.x + push.v * t, bounds);
      push.left -= t;
    }
    stepRun(p.run, 0, dt);
    return out;
  }

  // 회피: 공격 중(어느 구간이든) 불가, 지구력 소모. 좌우 입력 방향(없으면 바라보는 반대쪽)으로 고르게 이동하고
  // 그동안 다른 입력은 무시. 바라보는 방향은 그대로
  if (!p.backstep && input.backstep && !p.fighter.run && canDodge(p)) {
    p.backstep = { t: 0, dir: Math.sign(input.x) || -p.facing };
    p.backstepCd = bs.cooldown;
    spendStamina(p, st.dodge);
    out.backstepStarted = true;
  }
  if (p.backstep) {
    const t0 = p.backstep.t, t1 = Math.min(bs.sec, t0 + dt);
    moveX(p, p.pos.x + p.backstep.dir * (bs.distance * (t1 - t0)) / bs.sec, bounds);
    p.backstep.t = t0 + dt;
    if (p.backstep.t >= bs.sec) p.backstep = null;
    stepRun(p.run, 0, dt);
    return out;
  }

  // 지구력이 바닥나면 달리기 입력을 뗄 때까지 걷기 (다시 달리려면 두 번 누르기)
  const wantRun = stepRun(p.run, input.x, dt, input.run);
  if (!wantRun) p.tired = false;
  if (p.tired) p.run.running = false;
  const running = wantRun && !p.tired && !p.fighter.run;
  const skill = input.skill && skillReady(p, input.skill) ? input.skill : null;
  const before = p.fighter.run && { run: p.fighter.run, t: p.fighter.run.t };
  out.events = stepFighter(p.fighter, weapon, { attack: input.attack, skill, dashing: running }, dt);
  for (const e of out.events) {
    // 쿨타임은 windup 진입 시점부터 (balance.md 2장)
    if (e.type === 'start' && e.run.kind === 'skill') {
      if (e.run.def.cooldown) p.cooldowns[e.run.def.id] = e.run.def.cooldown * COMBAT.cooldownScale;
      p.mp -= e.run.def.mp ?? 0;
    }
  }
  if (input.x && canTurn(p.fighter)) p.facing = Math.sign(input.x);
  const started = out.events.flatMap((e) => (e.type === 'start' ? [e.run] : []));
  const act = actionMoved(before, started);
  if (act) moveX(p, p.pos.x + act * p.facing, bounds);
  if (!p.fighter.run) {
    const next = stepMove(p.pos, input, dt, moveSpeed(running, weapon.moveMul * speedMul), bounds);
    out.moved = Math.hypot(next.x - p.pos.x, next.y - p.pos.y);
    p.pos = next;
    if (running && out.moved > 0) {
      spendStamina(p, st.runPerSec * dt);
      if (p.stamina <= 0) p.tired = true;
    }
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

/** 상태 이름 (서버 상태 스키마·클라이언트 예측 공용, network.md 5장). moved = 이번 틱에 걸은 거리 */
export function playerStateName(p: PlayerState, moved: number): string {
  if (p.downed) return 'knocked';
  if (p.hurt) return p.hurt.kind === 'down' ? 'down' : 'hitstun';
  if (p.backstep) return 'backstep';
  if (p.fighter.run) return 'action';
  if (moved > 0) return p.run.running ? 'run' : 'walk';
  return 'idle';
}

/** 누름(공격·스킬·백스텝·물약)만 합친다: 히트스톱으로 멈춘 동안 들어온 누름을 멈춤이 끝난 틱에 쓰기 위해 */
export function mergePresses(held: PlayerInput | null, input: PlayerInput): PlayerInput | null {
  const pressed = input.attack || input.skill || input.backstep || input.potion;
  if (!pressed) return held;
  return {
    ...input,
    attack: input.attack || !!held?.attack, skill: input.skill ?? held?.skill ?? null,
    backstep: input.backstep || !!held?.backstep, potion: input.potion ?? held?.potion ?? null,
  };
}
