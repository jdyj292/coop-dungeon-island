// 공용 패시브: 스킬 캔슬·기상 회피 (skills.md 1장, combat.md 2·4장)
import { describe, expect, it } from 'vitest';
import { skillDef, weaponDef } from './actions';
import { TICK } from './constants';
import { PLAYER } from './data/load';
import { perksOf } from './passives';
import { canQuickRise, newPlayerState, stepPlayerState, type PlayerInput, type PlayerState } from './player';
import { hurtPlayer, isInvulnerable } from './playerHurt';
import { applyNode, checkNode } from './skillLoadout';
import { decodeBuild, encodeBuild, maxPointsOf, rivalsOf, spSpent, treeNodes, type SkillBuild } from './skillTree';

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
  it('무기마다 따로, 스킬 캔슬 최대 3·기상 회피 1, 택1 상대 없음, SP 계산·저장 문자열', () => {
    expect(treeNodes(gs)).toEqual(expect.arrayContaining(['greatsword.cancel', 'greatsword.quickrise']));
    expect(treeNodes(weaponDef('staff'))).toContain('staff.cancel');
    expect(treeNodes(gs)).not.toContain('staff.cancel');
    expect([maxPointsOf('greatsword.cancel'), maxPointsOf('greatsword.quickrise')]).toEqual([3, 1]);
    expect(rivalsOf(gs, 'greatsword.cancel')).toEqual([]);
    const b = decodeBuild('greatsword.cancel:3,greatsword.quickrise:1');
    expect(spSpent(gs, b)).toBe(4);
    expect(encodeBuild(b)).toBe('greatsword.cancel:3,greatsword.quickrise:1');
    expect(decodeBuild('greatsword.cancel:4')).toEqual({});
  });
  it('둘 다 배울 수 있고 처음부터 열림, SP가 모자라면 안 됨', () => {
    let b: SkillBuild = {};
    expect(checkNode(gs, b, 'greatsword.cancel', { points: 1 }, 1)).toBeNull();
    b = applyNode(gs, b, 'greatsword.cancel', { points: 1 });
    expect(checkNode(gs, b, 'greatsword.quickrise', { points: 1 }, 2)).toBeNull();
    expect(checkNode(gs, b, 'greatsword.quickrise', { points: 1 }, 1)).toBe('sp');
  });
  it('스킬 캔슬 준비 배율은 포인트별', () => {
    expect([1, 2, 3].map((n) => perksOf(gs, { 'greatsword.cancel': { points: n } }).cancelWindupMul)).toEqual([1.5, 1.3, 1.15]);
  });
});

describe('스킬 캔슬', () => {
  it('없으면 스킬 후딜레이에 다른 스킬 불가', () => {
    const p = withBuild({});
    toRecovery(p);
    expect(ticks(p, 1, { skill: split })).toEqual([]);
  });
  it('있으면 후딜레이에서 끊고 다음 스킬, 준비 시간 × 배율 (선딜·판정 중엔 불가)', () => {
    const p = withBuild({ 'greatsword.cancel': { points: 1 } });
    ticks(p, 1, { skill: launch });
    expect(ticks(p, 1, { skill: split })).toEqual([]);
    ticks(p, Math.ceil((launch.phases.windup + launch.phases.active) / TICK));
    expect(ticks(p, 1, { skill: split })).toEqual(['gs_earthsplit']);
    expect(p.fighter.run!.def.phases.windup).toBeCloseTo(split.phases.windup * 1.5);
    expect(p.cooldowns.gs_earthsplit).toBeGreaterThan(0);
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
  it('지구력이 모자라면 못 함', () => {
    const p = downed({ 'greatsword.quickrise': { points: 1 } });
    ticks(p, Math.ceil(PLAYER.hurt.pushSec / TICK) + 1);
    p.stamina = PLAYER.stamina.dodge - 1;
    expect(canQuickRise(p)).toBe(false);
  });
});
