// 공용 패시브: 기상 회피 (skills.md 1장, combat.md 2·4장)
import { describe, expect, it } from 'vitest';
import { skillDef, weaponDef } from './actions';
import { TICK } from './constants';
import { PLAYER } from './data/load';
import { perksOf } from './passives';
import { canQuickRise, newPlayerState, stepPlayerState, type PlayerInput, type PlayerState } from './player';
import { hurtPlayer, isInvulnerable } from './playerHurt';
import { applyNode, checkNode } from './skillLoadout';
import { decodeBuild, encodeBuild, maxPointsOf, spSpent, treeNodes, type SkillBuild } from './skillTree';

const gs = weaponDef('greatsword');
const bounds = { minX: 0, maxX: 1000, minY: 0, maxY: 100 };
const none: PlayerInput = { x: 0, y: 0, attack: false, skill: null, backstep: false };
const launch = skillDef('gs_launch'), split = skillDef('gs_earthsplit');

function ticks(p: PlayerState, n: number, first: Partial<PlayerInput> = {}) {
  const events: string[] = [];
  for (let i = 0; i < n; i++) {
    const r = stepPlayerState(p, gs, { ...none, ...(i === 0 ? first : {}) }, TICK, bounds);
    events.push(...r.events.filter((e) => e.type === 'start').map((e) => e.run.def.id));
    if (r.backstepStarted) events.push('backstep');
  }
  return events;
}

const withBuild = (b: SkillBuild): PlayerState => ({ ...newPlayerState({ x: 100, y: 50 }), perks: perksOf(gs, b) });

/** 올려베기 후딜레이까지 */
function toRecovery(p: PlayerState) {
  ticks(p, 1, { skill: launch });
  ticks(p, Math.ceil((launch.phases.windup + launch.phases.active) / TICK) + 1);
}

describe('공용 노드', () => {
  it('무기마다 따로, 최대 3, SP 계산·저장 문자열 (스킬 캔슬은 없앰)', () => {
    expect(treeNodes(gs)).toContain('greatsword.quickrise');
    expect(treeNodes(weaponDef('staff'))).toContain('staff.quickrise');
    expect(treeNodes(gs)).not.toContain('staff.quickrise');
    expect(treeNodes(gs)).not.toContain('greatsword.cancel');
    expect(maxPointsOf('greatsword.quickrise')).toBe(3);
    const b = decodeBuild('greatsword.quickrise:2');
    expect(spSpent(gs, b)).toBe(2);
    expect(encodeBuild(b)).toBe('greatsword.quickrise:2');
    expect(decodeBuild('greatsword.quickrise:4')).toEqual({});
    expect(decodeBuild('greatsword.cancel:1')).toEqual({});
  });
  it('열리는 레벨(기상 회피 7)부터 어느 계열에서나, SP가 모자라면 안 됨', () => {
    let b: SkillBuild = {};
    expect(checkNode(gs, b, 'greatsword.quickrise', { points: 1 }, 9, { level: 6, branch: 'A' })).toBe('locked');
    expect(checkNode(gs, b, 'greatsword.quickrise', { points: 1 }, 1, { level: 7, branch: 'B' })).toBeNull();
    b = applyNode(b, 'greatsword.quickrise', { points: 1 });
    expect(checkNode(gs, b, 'greatsword.quickrise', { points: 2 }, 2, { level: 7, branch: 'A' })).toBeNull();
    expect(checkNode(gs, b, 'greatsword.quickrise', { points: 2 }, 1, { level: 7, branch: 'A' })).toBe('sp');
  });
  it('기상 회피 쿨은 포인트별', () => {
    expect([1, 2, 3].map((n) => perksOf(gs, { 'greatsword.quickrise': { points: n } }).quickRiseCooldownAdd)).toEqual([0, -0.1, -0.2]);
  });
});

describe('스킬 → 스킬', () => {
  it('스킬 후딜레이에 다른 스킬 불가', () => {
    const p = withBuild({});
    toRecovery(p);
    expect(ticks(p, 1, { skill: split })).toEqual([]);
  });
});

describe('기상 회피', () => {
  const downed = (b: SkillBuild) => {
    const p = withBuild(b);
    hurtPlayer(p, 1, 'heavy', 1);
    return p;
  };
  it('없으면 다운 중 회피 키 무시', () => {
    const p = downed({});
    ticks(p, Math.ceil(PLAYER.hurt.pushSec / TICK) + 1);
    expect(ticks(p, 1, { backstep: true })).toEqual([]);
    expect(p.hurt?.kind).toBe('down');
  });
  it('있으면 밀림이 끝난 뒤 회피 키로 바로 일어나 회피, 기상 무적은 없음', () => {
    const p = downed({ 'greatsword.quickrise': { points: 1 } });
    expect(canQuickRise(p)).toBe(false);
    ticks(p, Math.ceil(PLAYER.hurt.pushSec / TICK) + 1);
    expect(canQuickRise(p)).toBe(true);
    const st = p.stamina;
    expect(ticks(p, 1, { backstep: true })).toEqual(['backstep']);
    expect(p.hurt).toBeNull();
    expect(p.invuln).toBe(0);
    expect(p.stamina).toBeCloseTo(st - PLAYER.stamina.dodge);
    ticks(p, Math.ceil(PLAYER.backstep.sec / TICK) + 1);
    expect(isInvulnerable(p)).toBe(false);
  });
  it('2·3포인트면 기상 회피로 시작한 회피의 쿨이 0.1 / 0.2초 짧음 (보통 회피는 그대로)', () => {
    const cd = (points: number) => {
      const p = downed({ 'greatsword.quickrise': { points } });
      ticks(p, Math.ceil(PLAYER.hurt.pushSec / TICK) + 1);
      ticks(p, 1, { backstep: true });
      return p.backstepCd;
    };
    expect(cd(1)).toBeCloseTo(PLAYER.backstep.cooldown);
    expect(cd(3)).toBeCloseTo(PLAYER.backstep.cooldown - 0.2);
    const q = withBuild({ 'greatsword.quickrise': { points: 3 } });
    ticks(q, 1, { backstep: true });
    expect(q.backstepCd).toBeCloseTo(PLAYER.backstep.cooldown);
  });
  it('지구력이 모자라면 못 함', () => {
    const p = downed({ 'greatsword.quickrise': { points: 1 } });
    ticks(p, Math.ceil(PLAYER.hurt.pushSec / TICK) + 1);
    p.stamina = PLAYER.stamina.dodge - 1;
    expect(canQuickRise(p)).toBe(false);
  });
});
