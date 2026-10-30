// 계열 보조 노드 (skills.md 1~3장): 택1·포인트 규칙, 스킬 정의 변경(withPerks), 판정 효과(공중 피해·연소·무중력·회피). 무거운 손은 charge.test.ts (Lv1 ATK 10)
import { describe, expect, it } from 'vitest';
import { skillDef, weaponDef, type ActionDef } from '../actions';
import { TICK } from '../constants';
import { newMonster } from '../monster/state';
import { perksOf } from '../passives';
import { newPlayerState, type PlayerInput } from '../player';
import { hurtPlayer } from '../playerHurt';
import { applyNode, buildSkill, checkNode, decodeBuild, encodeBuild, slotSkills, spSpent } from '../skillTree';
import { RoomSim } from './room';
import { hitMonster } from './strike';

const gs = weaponDef('greatsword'), st = weaponDef('staff');
const player = (weapon = gs, ids: string[] = []) => ({ ...newPlayerState({ x: 100, y: 50 }), perks: perksOf(weapon, Object.fromEntries(ids.map((id) => [id, { points: 1 }]))) });
const mon = (air = false) => {
  const m = Object.assign(newMonster(1, 'capknight', 116, 50), { hp: 5000, maxHp: 5000 });
  if (air) m.body.state = 'air';
  return m;
};
const plain = (coef: number): ActionDef => ({ ...skillDef('gs_launch'), coef, flags: [] });

describe('보조 노드 규칙', () => {
  it('1포인트까지, SP 1, 변형 없음', () => {
    expect(checkNode(gs, {}, 'gs_steadfast', { points: 1 }, 1)).toBeNull();
    expect(checkNode(gs, {}, 'gs_steadfast', { points: 2 }, 5)).toBe('points');
    expect(checkNode(gs, {}, 'gs_steadfast', { points: 1 }, 0)).toBe('sp');
    expect(checkNode(gs, {}, 'st_burn', { points: 1 }, 1)).toBe('skill');
    expect(spSpent(gs, { gs_steadfast: { points: 1 }, gs_whirl: { points: 2 } })).toBe(3);
  });

  it('같은 계열·단계 보조는 택1: 바꾸면 먼저 배운 쪽이 지워지고 SP는 그대로', () => {
    const b = applyNode(gs, { gs_heavyhand: { points: 1 } }, 'gs_steadfast', { points: 1 });
    expect(b).toEqual({ gs_steadfast: { points: 1 } });
    expect(checkNode(gs, { gs_heavyhand: { points: 1 } }, 'gs_steadfast', { points: 1 }, 1)).toBeNull();
    // 다른 계열 보조·같은 계열 액티브와는 따로
    expect(applyNode(gs, b, 'gs_honing', { points: 1 })).toEqual({ gs_steadfast: { points: 1 }, gs_honing: { points: 1 } });
    expect(applyNode(gs, b, 'gs_whirl', { points: 1 })).toEqual({ gs_steadfast: { points: 1 }, gs_whirl: { points: 1 } });
  });

  it('저장 문자열에 실리고 슬롯에는 안 들어감', () => {
    const b = { gs_keenedge: { points: 1 } };
    expect(decodeBuild(encodeBuild(b))).toEqual(b);
    expect(decodeBuild('gs_keenedge:2')).toEqual({});
    expect(slotSkills(gs, b)).toEqual(['gs_launch', 'gs_earthsplit', null, null]);
  });
});

describe('스킬 정의 변경', () => {
  it('굳건함: 모든 스킬 슈퍼아머', () => {
    expect(skillDef('gs_launch').superArmor).toBeFalsy();
    expect(buildSkill(gs, { gs_steadfast: { points: 1 } }, 'gs_launch')!.superArmor).toBe(true);
  });

  it('검기 연마: 투사체 사거리 ×1.4, 투사체 아닌 스킬은 그대로', () => {
    const b = { gs_honing: { points: 1 }, gs_wave: { points: 1 } };
    expect(buildSkill(gs, b, 'gs_wave')!.projectile!.range).toBeCloseTo(112);
    expect(buildSkill(gs, b, 'gs_launch')).toBe(skillDef('gs_launch'));
  });

  it('원소 친화: 지속 스킬 반복 횟수·상태 이상 시간 ×1.25, 지속 스킬 아니면 그대로', () => {
    const b = { st_affinity: { points: 1 }, st_pillar: { points: 1 }, st_icelance: { points: 1 } };
    expect(buildSkill(st, b, 'st_pillar')!.repeat!.count).toBe(10);
    expect(buildSkill(st, b, 'st_icefield')!.status!.time).toBeCloseTo(1.875);
    expect(buildSkill(st, b, 'st_icelance')!.status!.time).toBeCloseTo(0.5);
  });
});

describe('판정 효과', () => {
  it('날 선 칼날: 공중 대상 피해 +15% (땅 대상은 그대로)', () => {
    const p = player(gs, ['gs_keenedge']);
    expect(hitMonster(p, plain(1000), mon(true), 1).damage).toBe(115);
    expect(hitMonster(p, plain(1000), mon(), 1).damage).toBe(100);
  });

  it('연소: 화염 스킬에 맞은 몬스터는 3초 동안 누구에게나 +15%', () => {
    const m = mon();
    hitMonster(player(st, ['st_burn']), skillDef('st_fireburst'), m, 1);
    expect(m.burn.left).toBe(3);
    // 연소 없는 사람이 때려도
    expect(hitMonster(player(), plain(1000), m, 1).damage).toBe(115);
    // 얼음 스킬은 표식을 걸지 않음
    const m2 = mon();
    hitMonster(player(st, ['st_burn']), skillDef('st_icelance'), m2, 1);
    expect(m2.burn.left).toBe(0);
  });

  it('무중력: 내가 띄운 몬스터는 떠 있는 동안 +10%, 땅에서 다시 맞으면 지워짐', () => {
    const m = mon();
    hitMonster(player(st, ['st_weightless']), skillDef('st_lift'), m, 1);
    expect(m.body.state).toBe('air');
    expect(m.lifted).toBeCloseTo(1.1);
    expect(hitMonster(player(), plain(1000), m, 1).damage).toBe(110);
    m.body.state = 'idle';
    hitMonster(player(), plain(1000), m, 1);
    expect(m.lifted).toBe(0);
  });

  it('가벼운 발: 회피 거리 ×1.5, 쿨 0.6 → 0.4', () => {
    const none: PlayerInput = { x: 0, y: 0, attack: false, skill: null, backstep: false };
    const dodge = (skills = {}) => {
      const sim = new RoomSim(st, { minX: 0, maxX: 1000, minY: 0, maxY: 100 }, { x: 500, y: 50 }, { ai: false, skills });
      sim.tick(TICK, { ...none, x: 1, backstep: true });
      const cd = sim.player.backstepCd;
      for (let i = 0; i < 30; i++) sim.tick(TICK, none);
      return { moved: sim.player.pos.x - 500, cd };
    };
    const base = dodge(), light = dodge({ st_lightfoot: { points: 1 } });
    expect(light.moved).toBeCloseTo(base.moved * 1.5, 0);
    expect(base.cd).toBeCloseTo(0.6);
    expect(light.cd).toBeCloseTo(0.4);
  });
});
