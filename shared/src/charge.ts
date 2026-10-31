// 대검 충전 (docs/skills.md 2장, combat.md 1장): 스킬 키를 누르고 있으면 준비(windup) 끝에서 멈춰 충전, 떼거나 최대가 되면 발동.
// 충전한 시간에 비례해 피해·판정 범위가 커진다 (weapons.json trait charge). 충전 중 슈퍼아머, 보조 노드 무거운 손 = 충전 속도·받는 피해
import { scaleExtraCoefs, type ActionDef, type ActionRun } from './actions';

/** 충전 진행 (ActionRun.charge). t = 충전한 초, done = 끝남(발동했거나 충전 없이 지나감), armor = 충전 중 슈퍼아머 */
export interface ChargeState {
  t: number;
  done: boolean;
  armor: boolean;
}

/** 이번 틱 충전 입력: hold = 그 스킬 키를 누르고 있음, maxTime = 최대까지 걸리는 초 (충전 속도 반영), bonusMax = 최대 보너스 */
export interface ChargeInput {
  hold: boolean;
  maxTime: number;
  bonusMax: number;
  armor: boolean;
}

/** 충전 중 멈춰 있는 시각: windup 끝 바로 앞 (phaseAt이 계속 windup을 돌려주게) */
export const CHARGE_HOLD_EPS = 1e-6;

/** 충전 없이 지나가게 표시 (재입력 변형의 다음 입력) */
export const noCharge = (): ChargeState => ({ t: 0, done: true, armor: false });

/** 지금 충전 중인가 (준비 끝에서 멈춰 있음) */
export const isCharging = (run: ActionRun | null | undefined): boolean => !!run?.charge && !run.charge.done && run.charge.t > 0;

/**
 * 한 틱 충전. 반환 = 이번 틱에 run.t를 얼마나 진행할지.
 * 준비 중이면 그대로, 준비 끝에서 키를 누르고 있으면 멈추고 충전, 떼거나 최대면 충전한 만큼 정의를 키우고 발동
 */
export function stepCharge(run: ActionRun, c: ChargeInput, dt: number): number {
  if (run.kind !== 'skill') return dt;
  const rule = run.def.chargeRule;
  // 충전 없는 스킬(즉발 변형)은 처음부터 끝난 것으로
  const ch = (run.charge ??= rule?.off ? noCharge() : { t: 0, done: false, armor: c.armor });
  if (ch.done) return dt;
  // 스킬별 충전 규칙 (파쇄참 3단 충전: 최대 시간·보너스 ×2)
  if (rule) c = { ...c, maxTime: c.maxTime * (rule.timeMul ?? 1), bonusMax: c.bonusMax * (rule.bonusMul ?? 1) };
  const end = run.def.phases.windup - CHARGE_HOLD_EPS;
  if (run.t + dt < end) return dt;
  if (!c.hold) {
    ch.done = true;
    if (ch.t > 0) run.def = chargedDef(run.def, (c.bonusMax * ch.t) / c.maxTime);
    return dt;
  }
  const toEnd = Math.max(0, end - run.t);
  ch.t = Math.min(c.maxTime, ch.t + dt - toEnd);
  if (ch.t >= c.maxTime) {
    ch.done = true;
    run.def = chargedDef(run.def, c.bonusMax);
  }
  return toEnd;
}

/** 충전 보너스(0~bonusMax)만큼 피해(coef·후속·벽꿍·투사체 끝 판정·검흔)와 판정 범위(상자 길이·깊이, 원·부채꼴 반지름, 투사체 반지름)를 키운 정의 (id는 그대로) */
export function chargedDef(def: ActionDef, bonus: number): ActionDef {
  if (bonus <= 0) return def;
  const k = 1 + bonus;
  const out: ActionDef = { ...def, coef: def.coef * k };
  if (def.hitbox) out.hitbox = { ...def.hitbox, width: def.hitbox.width * k, depth: def.hitbox.depth * k, ...(def.hitbox.back ? { back: def.hitbox.back * k } : {}) };
  if (def.area) {
    const a = def.area;
    out.area = { ...a, ...(a.radius ? { radius: a.radius * k } : {}), ...(a.width ? { width: a.width * k } : {}), ...(a.depth ? { depth: a.depth * k } : {}) };
  }
  if (def.projectile) out.projectile = { ...def.projectile, radius: def.projectile.radius * k };
  if (def.after) out.after = { ...def.after, coef: def.after.coef * k };
  if (def.onWall) out.onWall = { ...def.onWall, coef: def.onWall.coef * k };
  if (def.onStatusEnd) out.onStatusEnd = { ...def.onStatusEnd, coef: def.onStatusEnd.coef * k };
  scaleExtraCoefs(out, k);
  return out;
}
