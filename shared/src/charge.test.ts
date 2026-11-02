// 대검 충전 (skills.md 2장): 준비 끝에서 누르고 있으면 멈춰 충전, 떼거나 최대(1초)면 발동, 피해·범위 최대 +50%, 충전 중 슈퍼아머, 무거운 손
import { describe, expect, it } from 'vitest';
import { fighterPhase, fighterPose, skillDef, weaponDef, type ActionDef, type WeaponDef } from './actions';
import { chargedDef, isCharging } from './charge';
import { TICK } from './constants';
import { perksOf } from './passives';
import { chargeLevel, newPlayerState, stepPlayerState, type PlayerInput, type PlayerState } from './player';
import { hurtPlayer } from './playerHurt';
import { buildSkill } from './cards/build';

const gs = weaponDef('greatsword'), st = weaponDef('staff');
const bounds = { minX: 0, maxX: 1000, minY: 0, maxY: 100 };
const idle: PlayerInput = { x: 0, y: 0, attack: false, skill: null, backstep: false };
const split = skillDef('gs_earthsplit');

const player = (ids: string[] = [], weapon: WeaponDef = gs): PlayerState =>
  ({ ...newPlayerState({ x: 500, y: 50 }), perks: perksOf(weapon, Object.fromEntries(ids.map((id) => [id, { level: 1 }]))) });

/** 스킬을 누르고 holdSec 동안 누르고 있다가 뗀다. 발동(active) 순간의 정의와 누른 뒤 걸린 시간 */
function cast(p: PlayerState, skill: ActionDef, holdSec: number, weapon: WeaponDef = gs): { def: ActionDef; at: number } {
  let t = 0;
  for (let i = 0; i < 300; i++) {
    const input = { ...idle, skill: i === 0 ? skill : null, hold: t < holdSec };
    const ev = stepPlayerState(p, weapon, input, TICK, bounds).events.find((e) => e.type === 'active');
    t += TICK;
    if (ev) return { def: ev.run.def, at: t };
  }
  throw new Error('발동 안 함');
}

describe('대검 충전', () => {
  it('짧게 누르면 지금처럼 바로 (정의 그대로)', () => {
    const r = cast(player(), split, 0.05);
    expect(r.def).toBe(split);
    expect(r.at).toBeCloseTo(split.phases.windup, 1);
  });

  it('누르고 있으면 준비 끝에서 멈춰 충전, 떼면 충전한 만큼 커져서 발동', () => {
    const p = player();
    const r = cast(p, split, split.phases.windup + 0.5);
    expect(r.at).toBeCloseTo(split.phases.windup + 0.5, 1);
    // 0.5초 / 1초 → 보너스 +25%
    expect(r.def.coef / split.coef).toBeCloseTo(1.25, 1);
    expect(r.def.hitbox!.width / split.hitbox!.width).toBeCloseTo(1.25, 1);
    expect(r.def.hitbox!.forward).toBe(split.hitbox!.forward);
    expect(r.def.id).toBe(split.id);
  });

  it('최대 1초에 다 차도 바로 나가지 않고, 다 찬 뒤 2초(holdMax) 들고 있으면 저절로 발동, +50%', () => {
    const r = cast(player(), split, 5);
    expect(r.at).toBeCloseTo(split.phases.windup + 1 + 2, 1);
    expect(r.def.coef).toBeCloseTo(split.coef * 1.5);
  });

  it('다 찬 뒤 들고 있다가 떼면 그때 발동, 보너스는 최대 +50% 그대로', () => {
    const p = player();
    const r = cast(p, split, split.phases.windup + 1.6);
    expect(r.at).toBeCloseTo(split.phases.windup + 1.6, 1);
    expect(r.def.coef).toBeCloseTo(split.coef * 1.5);
  });

  it('충전 중은 준비 자세 (windup) 그대로', () => {
    const p = player();
    stepPlayerState(p, gs, { ...idle, skill: split, hold: true }, TICK, bounds);
    for (let i = 0; i < 30; i++) stepPlayerState(p, gs, { ...idle, hold: true }, TICK, bounds);
    expect(fighterPhase(p.fighter)).toBe('windup');
    expect(isCharging(p.fighter.run)).toBe(true);
  });

  it('충전 중 슈퍼아머: 피해만 받고 계속, 무거운 손이면 받는 피해 -30%', () => {
    for (const [ids, lost] of [[[], 10], [['gs_heavyhand'], 7]] as const) {
      const p = player([...ids]);
      stepPlayerState(p, gs, { ...idle, skill: split, hold: true }, TICK, bounds);
      for (let i = 0; i < 20; i++) stepPlayerState(p, gs, { ...idle, hold: true }, TICK, bounds);
      const hp = p.hp;
      expect(hurtPlayer(p, 10, 'heavy')).toEqual(['armor']);
      expect(hp - p.hp).toBe(lost);
      expect(isCharging(p.fighter.run)).toBe(true);
    }
  });

  it('준비 중(충전 전)에는 슈퍼아머 없음, 받는 피해 그대로', () => {
    const p = player(['gs_heavyhand']);
    stepPlayerState(p, gs, { ...idle, skill: split, hold: true }, TICK, bounds);
    const hp = p.hp;
    expect(hurtPlayer(p, 10, 'light')).toEqual(['stun']);
    expect(hp - p.hp).toBe(10);
  });

  it('무거운 손: 충전 30% 빠르게 (1 / 1.3초에 최대)', () => {
    const p = player(['gs_heavyhand']);
    stepPlayerState(p, gs, { ...idle, skill: split, hold: true }, TICK, bounds);
    const steps = Math.round((split.phases.windup + 1 / 1.3) / TICK);
    for (let i = 1; i < steps; i++) stepPlayerState(p, gs, { ...idle, hold: true }, TICK, bounds);
    expect(chargeLevel(p, gs)).toBeCloseTo(1, 1);
    const r = cast(player(['gs_heavyhand']), split, split.phases.windup + 1 / 1.3);
    expect(r.def.coef).toBeCloseTo(split.coef * 1.5);
  });

  it('재입력 변형의 다음 입력은 충전 없음', () => {
    const build = { gs_shoulder: { level: 2, variant: 'again' } };
    const p = player(), d = buildSkill(gs, build, 'gs_shoulder')!;
    cast(p, d, 0);
    for (let i = 0; i < 40 && p.fighter.run; i++) stepPlayerState(p, gs, idle, TICK, bounds);
    expect(p.reinput?.left).toBeGreaterThan(0);
    const r = cast(p, d, 5);
    expect(r.def).toBe(d);
    expect(r.at).toBeCloseTo(d.phases.windup, 1);
  });

  it('충전 없는 무기(스태프)는 누르고 있어도 그대로', () => {
    const fire = skillDef(st.baseSkills[0]!);
    const r = cast(player([], st), fire, 5, st);
    expect(r.def).toBe(fire);
  });

  it('충전 없는 대검 스킬(chargeRule.off: 올려베기·발도·검흔 베기)은 누르고 있어도 바로, 슈퍼아머 없음', () => {
    for (const id of ['gs_launch', 'gs_draw', 'gs_scar']) {
      const s = skillDef(id);
      const r = cast(player(), s, 5);
      expect(r.def).toBe(s);
      expect(r.at).toBeCloseTo(s.phases.windup, 1);
    }
  });

  it('범위: 원 반지름·투사체 반지름·후속 판정도 커짐', () => {
    const whirl = skillDef('gs_whirl'), wave = skillDef('gs_wave');
    expect(chargedDef(whirl, 0.5).area!.radius).toBeCloseTo(whirl.area!.radius! * 1.5);
    expect(chargedDef(wave, 0.5).projectile!.radius).toBeCloseTo(wave.projectile!.radius * 1.5);
    expect(chargedDef(wave, 0.5).projectile!.range).toBe(wave.projectile!.range);
    expect(chargedDef(split, 0)).toBe(split);
  });
  it('충전 중 포즈 = poses.charge (허리 옆 쥐기), 머리 위 준비 스킬은 준비 포즈 그대로, 비율 chargeLevel (SK-3 2차)', () => {
    const hold = (skill: ActionDef, sec: number) => {
      const p = player();
      for (let t = 0; t < sec; t += TICK) stepPlayerState(p, gs, { ...idle, skill: t === 0 ? skill : null, hold: true }, TICK, bounds);
      return p;
    };
    const wave = skillDef('gs_wave');
    const p = hold(wave, wave.phases.windup + 0.5);
    expect(fighterPose(p.fighter)).toBe('charge');
    expect(chargeLevel(p, gs)).toBeCloseTo(0.5, 1);
    expect(fighterPose(hold(split, split.phases.windup + 0.3).fighter)).toBe('overhead');
    // 준비 중에는 아직 준비 포즈
    expect(fighterPose(hold(wave, wave.phases.windup / 2).fighter)).toBe(wave.poses?.windup);
    expect(chargeLevel(hold(wave, wave.phases.windup / 2), gs)).toBe(0);
  });
});
