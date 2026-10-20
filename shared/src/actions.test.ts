import { describe, expect, it } from 'vitest';
import { canTurn, fighterPose, newFighter, phaseAt, skillDef, stepFighter, weaponDef, type Fighter } from './actions';

const gs = weaponDef('greatsword');
const b1 = gs.basic[0]!;
const len = (i: number) => Object.values(gs.basic[i]!.phases).reduce((a, b) => a + b, 0);
const idle = { attack: false };
const press = { attack: true };

/** dt씩 n번 진행하며 이벤트 이름 모으기 */
function run(f: Fighter, n: number, dt = 0.01, input = idle) {
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(...stepFighter(f, gs, i === 0 ? input : idle, dt).map((e) => `${e.type}${e.run.step}`));
  return out;
}

describe('phaseAt', () => {
  it('windup → active → recovery → 끝', () => {
    expect(phaseAt(b1, 0)).toBe('windup');
    expect(phaseAt(b1, b1.phases.windup)).toBe('active');
    expect(phaseAt(b1, b1.phases.windup + b1.phases.active)).toBe('recovery');
    expect(phaseAt(b1, len(0))).toBeNull();
  });
});

describe('stepFighter', () => {
  it('J 한 번: 1타 시작 → active 한 번 → 끝, 그 뒤 comboWindow 안에 J면 2타', () => {
    const f = newFighter();
    const ev = run(f, Math.ceil(len(0) / 0.01) + 1, 0.01, press);
    expect(ev).toEqual(['start0', 'active0', 'end0']);
    expect(f.nextStep).toBe(1);
    expect(run(f, 1, 0.01, press)).toEqual(['start1']);
  });

  it('comboWindow를 넘기면 1타로 돌아감', () => {
    const f = newFighter();
    run(f, Math.ceil(len(0) / 0.01) + 1, 0.01, press);
    run(f, Math.ceil(gs.comboWindow / 0.01) + 1);
    expect(f.nextStep).toBe(0);
  });

  it('active~recovery 중 선입력하면 끝나자마자 다음 단계, windup 중 입력은 무시', () => {
    const f = newFighter();
    stepFighter(f, gs, press, 0.01);
    stepFighter(f, gs, press, 0.01);
    expect(f.queued).toBe(false);
    stepFighter(f, gs, idle, b1.phases.windup);
    stepFighter(f, gs, press, 0.01);
    expect(f.queued).toBe(true);
    const ev = stepFighter(f, gs, idle, len(0));
    expect(ev.map((e) => e.type)).toEqual(['end', 'start']);
    expect(f.run?.step).toBe(1);
  });

  it('3타 뒤에는 다시 1타', () => {
    const f = newFighter();
    for (let i = 0; i < 3; i++) {
      stepFighter(f, gs, press, 0.001);
      stepFighter(f, gs, idle, len(i));
    }
    expect(f.nextStep).toBe(0);
  });

  it('평타 recovery 중 스킬은 캔슬, windup 중에는 불가', () => {
    const skill = skillDef('gs_launch');
    const f = newFighter();
    stepFighter(f, gs, press, 0.01);
    stepFighter(f, gs, { attack: false, skill }, 0.01);
    expect(f.run?.kind).toBe('basic');
    stepFighter(f, gs, idle, b1.phases.windup + b1.phases.active);
    stepFighter(f, gs, { attack: false, skill }, 0.01);
    expect(f.run?.kind).toBe('skill');
  });
});

describe('포즈·방향 전환', () => {
  it('구간별 포즈는 데이터대로', () => {
    const f = newFighter();
    stepFighter(f, gs, press, 0.01);
    expect(fighterPose(f)).toBe(b1.poses!.windup);
  });
  it('방향 전환은 recovery 진입 직후 0.1초만', () => {
    const f = newFighter();
    expect(canTurn(f)).toBe(true);
    stepFighter(f, gs, press, 0.01);
    expect(canTurn(f)).toBe(false);
    stepFighter(f, gs, idle, b1.phases.windup + b1.phases.active);
    expect(canTurn(f)).toBe(true);
    stepFighter(f, gs, idle, 0.15);
    expect(canTurn(f)).toBe(false);
  });
});
