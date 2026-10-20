// 행동 진행: windup → active → recovery, 평타 연타·선입력·캔슬 (docs/combat.md 1·2장, 형식 docs/data.md 1·2장)
import { COMBAT, SKILLS, WEAPONS } from './data/load';
import type { ActionMove, PlayerAction, Weapon } from './data/schema';

export type Phase = 'windup' | 'active' | 'recovery';
export type Strength = 'light' | 'medium' | 'heavy';
export type FxGrade = 'light' | 'medium' | 'heavy' | 'ultimate';


/** 플레이어 행동 (평타·대시·스킬). 형식은 data/schema.ts */
export type ActionDef = PlayerAction;
export type WeaponDef = Weapon;

export function weaponDef(id: string): WeaponDef {
  const w = WEAPONS[id];
  if (!w) throw new Error(`무기 '${id}' 없음`);
  return w;
}

export function skillDef(id: string): ActionDef {
  const s = SKILLS[id];
  if (!s) throw new Error(`스킬 '${id}' 없음`);
  return s;
}

/** 행동 시작부터 t초 지났을 때의 구간. 끝났으면 null */
export function phaseAt(def: ActionDef, t: number): Phase | null {
  const { windup, active, recovery } = def.phases;
  if (t < windup) return 'windup';
  if (t < windup + active) return 'active';
  if (t < windup + active + recovery) return 'recovery';
  return null;
}

export interface ActionRun {
  def: ActionDef;
  kind: 'basic' | 'skill';
  /** 평타 단계 (0부터). 스킬은 0 */
  step: number;
  t: number;
}

/** 평타·스킬을 쓰는 쪽의 행동 상태 (클라이언트 예측·서버 판정 공용) */
export interface Fighter {
  run: ActionRun | null;
  /** active~recovery 중 다음 평타 선입력 */
  queued: boolean;
  /** 다음 평타 단계 */
  nextStep: number;
  /** recovery 뒤 다음 평타를 받아주는 남은 시간 */
  windowLeft: number;
}

export const newFighter = (): Fighter => ({ run: null, queued: false, nextStep: 0, windowLeft: 0 });

export interface FighterInput {
  /** 이번 틱에 평타 키를 눌렀나 */
  attack: boolean;
  /** 이번 틱에 누른 스킬 */
  skill?: ActionDef | null;
}

export type FighterEvent =
  | { type: 'start'; run: ActionRun }
  | { type: 'active'; run: ActionRun }
  | { type: 'end'; run: ActionRun };

/** 한 틱 진행. 새로 시작한 행동도 같은 틱에 dt만큼 진행된다 */
export function stepFighter(f: Fighter, weapon: WeaponDef, input: FighterInput, dt: number): FighterEvent[] {
  const events: FighterEvent[] = [];
  const start = (def: ActionDef, kind: ActionRun['kind'], step: number) => {
    f.run = { def, kind, step, t: 0 };
    f.queued = false;
    f.windowLeft = 0;
    events.push({ type: 'start', run: f.run });
  };
  const phase = f.run && phaseAt(f.run.def, f.run.t);

  if (input.skill && (!f.run || (f.run.kind === 'basic' && phase === 'recovery'))) {
    start(input.skill, 'skill', 0);
  } else if (input.attack) {
    if (!f.run) start(weapon.basic[f.nextStep]!, 'basic', f.nextStep);
    else if (f.run.kind === 'basic' && phase !== 'windup' && f.run.step < weapon.basic.length - 1) f.queued = true;
  }

  const run = f.run;
  if (!run) {
    f.windowLeft = Math.max(0, f.windowLeft - dt);
    if (f.windowLeft === 0) f.nextStep = 0;
    return events;
  }
  const before = phaseAt(run.def, run.t);
  run.t += dt;
  const after = phaseAt(run.def, run.t);
  if (before === 'windup' && after !== 'windup') events.push({ type: 'active', run });
  if (after === null) {
    events.push({ type: 'end', run });
    f.run = null;
    const next = run.kind === 'basic' && run.step + 1 < weapon.basic.length ? run.step + 1 : 0;
    if (f.queued && next > 0) start(weapon.basic[next]!, 'basic', next);
    else {
      f.nextStep = next;
      f.windowLeft = next > 0 ? weapon.comboWindow : 0;
      f.queued = false;
    }
  }
  return events;
}

/** 지금 구간의 포즈 이름 (행동 중이 아니면 null) */
export function fighterPose(f: Fighter): string | null {
  if (!f.run) return null;
  const phase = phaseAt(f.run.def, f.run.t);
  return (phase && f.run.def.poses?.[phase]) ?? null;
}

export const fighterPhase = (f: Fighter): Phase | null => (f.run ? phaseAt(f.run.def, f.run.t) : null);

/** 방향 전환 가능: 행동 중이 아니거나, 평타 recovery 진입 직후 (combat.md 1장 "공격 중 제약") */
export function canTurn(f: Fighter): boolean {
  if (!f.run) return true;
  const { windup, active } = f.run.def.phases;
  const since = f.run.t - windup - active;
  return f.run.kind === 'basic' && since >= 0 && since < COMBAT.turnWindow;
}

/** 구간의 시작·끝 시각 */
export function phaseRange(def: { phases: Record<Phase, number> }, phase: Phase): [number, number] {
  const { windup, active, recovery } = def.phases;
  if (phase === 'windup') return [0, windup];
  if (phase === 'active') return [windup, windup + active];
  return [windup + active, windup + active + recovery];
}

/**
 * 행동 중 이동 (data.md 1장 move): t0 → t1 사이에 바라보는 방향으로 움직일 거리 (px, 0 이상).
 * distance형은 해당 구간 동안 고르게, speed형은 maxDistance까지 일정 속도. 벽(stopOnWall)은 호출하는 쪽에서 처리
 */
export function actionMoveDelta(def: { phases: Record<Phase, number>; move?: ActionMove }, t0: number, t1: number): number {
  const m = def.move;
  if (!m || t1 <= t0) return 0;
  const [s, e] = phaseRange(def, m.during);
  if (e <= s) return 'distance' in m && t0 <= s && t1 >= s ? m.distance : 0;
  const a = Math.min(e, Math.max(s, t0)), b = Math.min(e, Math.max(s, t1));
  if (b <= a) return 0;
  if ('distance' in m) return (m.distance * (b - a)) / (e - s);
  const cap = (t: number) => Math.min(m.speed * (t - s), m.maxDistance);
  return cap(b) - cap(a);
}
