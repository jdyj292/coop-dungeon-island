// 공용 패시브: 기상 회피 (skills.md 1장, combat.md 2·4장)
import { describe, expect, it } from 'vitest';
import { skillDef, weaponDef } from './actions';
import { TICK } from './constants';
import { PLAYER } from './data/load';
import { perksOf } from './passives';
import { canQuickRise, newPlayerState, stepPlayerState, type PlayerInput, type PlayerState } from './player';
import { hurtPlayer, isInvulnerable } from './playerHurt';
import { decodeBuild, encodeBuild, type SkillBuild } from './cards/build';
import { cardBranch, tierOf, weaponCards } from './cards/catalog';

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

describe('공용 패시브 카드', () => {
  it('무기마다 따로 (티어 1, 계열 없음), 빌드 문자열 (스킬 캔슬은 없앰)', () => {
    expect(weaponCards('greatsword', 'passive')).toContain('greatsword.quickrise');
    expect(weaponCards('staff', 'passive')).toContain('staff.quickrise');
    expect(weaponCards('greatsword')).not.toContain('staff.quickrise');
    expect(weaponCards('greatsword')).not.toContain('greatsword.cancel');
    expect([tierOf('greatsword.quickrise'), cardBranch('greatsword.quickrise')]).toEqual([1, 'common']);
    const b = decodeBuild('greatsword.quickrise:2');
    expect(encodeBuild(b)).toBe('greatsword.quickrise:2');
    expect(decodeBuild('greatsword.quickrise:3')).toEqual({});
    expect(decodeBuild('greatsword.cancel:1')).toEqual({});
  });
  it('기상 회피 쿨은 강화 카드만', () => {
    expect([1, 2].map((n) => perksOf(gs, { 'greatsword.quickrise': { level: n } }).quickRiseCooldownAdd)).toEqual([0, -0.2]);
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
    const p = downed({ 'greatsword.quickrise': { level: 1 } });
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
      const p = downed({ 'greatsword.quickrise': { level: points } });
      ticks(p, Math.ceil(PLAYER.hurt.pushSec / TICK) + 1);
      ticks(p, 1, { backstep: true });
      return p.backstepCd;
    };
    expect(cd(1)).toBeCloseTo(PLAYER.backstep.cooldown);
    expect(cd(3)).toBeCloseTo(PLAYER.backstep.cooldown - 0.2);
    const q = withBuild({ 'greatsword.quickrise': { level: 2 } });
    ticks(q, 1, { backstep: true });
    expect(q.backstepCd).toBeCloseTo(PLAYER.backstep.cooldown);
  });
  it('지구력이 모자라면 못 함', () => {
    const p = downed({ 'greatsword.quickrise': { level: 1 } });
    ticks(p, Math.ceil(PLAYER.hurt.pushSec / TICK) + 1);
    p.stamina = PLAYER.stamina.dodge - 1;
    expect(canQuickRise(p)).toBe(false);
  });
});
