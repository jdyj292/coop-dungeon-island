// 던전용 카드 빌드·강화·변형 (skills.md 1장, balance.md 1장 카드 강화 배율)
import { describe, expect, it } from 'vitest';
import { skillDef, weaponDef } from '../actions';
import { buildSkill, decodeBuild, dungeonBuild, encodeBuild, resolveSkill, slotSkills, weaponSkills } from './build';
import { defaultLoadout } from './equip';

const gs = weaponDef('greatsword');

describe('강화·변형 적용', () => {
  it('기본 카드·변형 없음은 원래 정의 그대로', () => {
    expect(resolveSkill('gs_launch')).toBe(skillDef('gs_launch'));
  });

  it('강화 카드는 계수 ×1.2', () => {
    expect(resolveSkill('gs_launch', { level: 2 }).coef).toBeCloseTo(480);
  });

  it('변형은 필드를 덮어쓰고 특수 필드를 붙인다 (계수에도 강화 배율)', () => {
    const d = resolveSkill('gs_launch', { level: 2, variant: 'double' });
    expect((d as { name?: string }).name).toBe('연속 올려베기');
    expect(d.coef).toBeCloseTo(300);
    expect(d.reinput).toBe(1);
    expect(d.id).toBe('gs_launch');
    expect((d as { variants?: unknown }).variants).toBeUndefined();
  });

  it('null은 필드 제거, 객체는 얕게 합침', () => {
    const fan = resolveSkill('gs_earthsplit', { level: 2, variant: 'fan' });
    expect(fan.hitbox).toBeUndefined();
    expect(fan.area?.shape).toBe('fan');
    const instant = resolveSkill('st_fireburst', { level: 2, variant: 'instant' });
    expect(instant.phases).toEqual({ ...skillDef('st_fireburst').phases, windup: 0.2 });
    const perma = resolveSkill('st_icefield', { level: 2, variant: 'permafrost' });
    expect(perma.area).toMatchObject({ shape: 'rect', width: 96, depth: 48 });
    expect(perma.status?.type).toBe('slow');
  });

  it('후속·해제 판정 계수에도 강화 배율', () => {
    expect(resolveSkill('gs_earthsplit', { level: 2, variant: 'crack' }).after).toEqual({ delay: 1, coef: 360 });
    expect(resolveSkill('st_icefield', { level: 2, variant: 'shatter' }).onStatusEnd?.coef).toBeCloseTo(480);
  });

  it('기본 스킬에 있는 반복은 변형이 일부만 덮어쓴다', () => {
    expect(resolveSkill('st_pillar', { level: 2, variant: 'march' }).repeat).toEqual({ count: 8, interval: 0.25, step: 8 });
  });
});

describe('던전 칸 (A S D F)', () => {
  it('slot이 없으면(개발 ?skills=) 적은 순서대로, 액티브가 없으면 처음 카드', () => {
    expect(slotSkills(gs, decodeBuild('gs_whirl:2:rush,gs_heavyhand:1'))).toEqual(['gs_whirl', null, null, null]);
    expect(slotSkills(gs, {})).toEqual(['gs_launch', 'gs_earthsplit', null, null]);
    expect(weaponSkills(gs, { gs_earthsplit: { level: 2 } }).map((d) => d && [d.id, Math.round(d.coef)])).toEqual([['gs_earthsplit', 720], null, null, null]);
  });

  it('slot이 있으면 그 칸, 다른 무기 카드는 안 들어감', () => {
    const b = decodeBuild('gs_wave:1@3,gs_launch:1@0,st_orb:1@1');
    expect(slotSkills(gs, b)).toEqual(['gs_launch', null, null, 'gs_wave']);
    expect(buildSkill(gs, b, 'gs_whirl')).toBeUndefined();
    expect(buildSkill(gs, b, 'gs_wave')?.id).toBe('gs_wave');
  });
});

describe('dungeonBuild (보유·장착 → 판정 빌드)', () => {
  const owned = {
    gs_launch: { count: 1, enhanced: true, variant: 'double' }, gs_earthsplit: { count: 1, enhanced: false },
    gs_quake: { count: 1, enhanced: false }, gs_heavyhand: { count: 0, enhanced: true }, gs_giant: { count: 1, enhanced: false },
  };

  it('장착 카드만, 강화면 단계 2·변형, 액티브는 칸', () => {
    const lo = { active: ['gs_earthsplit', 'gs_launch', null, null], passive: ['gs_heavyhand'] };
    expect(dungeonBuild('greatsword', 1, owned, lo)).toEqual({
      gs_earthsplit: { level: 1, slot: 0 }, gs_launch: { level: 2, variant: 'double', slot: 1 }, gs_heavyhand: { level: 2 },
    });
  });

  it('숙련도가 모자란 카드·없는 카드는 빠지고, 패시브 한도를 넘으면 뒤쪽부터 빠짐', () => {
    const lo = { active: ['gs_quake', 'gs_whirl', 'gs_launch', null], passive: ['gs_heavyhand', 'gs_giant'] };
    expect(Object.keys(dungeonBuild('greatsword', 5, owned, lo))).toEqual(['gs_launch', 'gs_heavyhand']);
    // Lv11: 한도 7, 무거운 손(강화 2) + 거인의 힘(티어 3) = 5
    expect(Object.keys(dungeonBuild('greatsword', 11, owned, lo))).toEqual(['gs_quake', 'gs_launch', 'gs_heavyhand', 'gs_giant']);
  });

  it('기본 배치 = A S 처음 카드', () => {
    expect(dungeonBuild('staff', 1, { st_fireburst: { count: 1, enhanced: false }, st_icefield: { count: 1, enhanced: false } }, defaultLoadout('staff')))
      .toEqual({ st_fireburst: { level: 1, slot: 0 }, st_icefield: { level: 1, slot: 1 } });
  });
});

describe('저장 문자열', () => {
  it('왕복', () => {
    const b = { gs_launch: { level: 2, variant: 'double', slot: 0 }, gs_earthsplit: { level: 1 }, gs_heavyhand: { level: 2 } };
    const s = encodeBuild(b);
    expect(s).toBe('gs_launch:2:double@0,gs_earthsplit:1,gs_heavyhand:2');
    expect(decodeBuild(s)).toEqual(b);
  });

  it('모르는 카드·변형, 잘못된 단계·칸은 버린다 (변형은 강화일 때만, 칸은 액티브만)', () => {
    expect(decodeBuild('x:2,gs_launch:3,gs_earthsplit:1:crack,st_icefield:2:zzz@4,gs_heavyhand:1@0,'))
      .toEqual({ gs_earthsplit: { level: 1 }, st_icefield: { level: 2 }, gs_heavyhand: { level: 1 } });
    expect(decodeBuild('')).toEqual({});
  });
});
