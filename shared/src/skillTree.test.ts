// 스킬 포인트·변형 규칙 (skills.md 1장, balance.md 1장 스킬 레벨 배율)
import { describe, expect, it } from 'vitest';
import { skillDef, weaponDef } from './actions';
import { applyNode, buildSkill, checkNode, decodeBuild, encodeBuild, resolveSkill, slotSkills, spSpent, spTotal, treeSkills, weaponSkills } from './skillTree';

const gs = weaponDef('greatsword');

describe('변형·레벨 배율 적용', () => {
  it('1포인트·변형 없음은 원래 정의 그대로', () => {
    expect(resolveSkill('gs_launch')).toBe(skillDef('gs_launch'));
  });

  it('포인트마다 계수 ×1.00 / ×1.15 / ×1.30', () => {
    expect(resolveSkill('gs_launch', { points: 2 }).coef).toBeCloseTo(460);
    expect(resolveSkill('gs_launch', { points: 3 }).coef).toBeCloseTo(520);
  });

  it('변형은 필드를 덮어쓰고 특수 필드를 붙인다 (계수에도 레벨 배율)', () => {
    const d = resolveSkill('gs_launch', { points: 3, variant: 'double' });
    expect((d as { name?: string }).name).toBe('연속 올려베기');
    expect(d.coef).toBeCloseTo(325);
    expect(d.reinput).toBe(1);
    expect(d.id).toBe('gs_launch');
    expect((d as { variants?: unknown }).variants).toBeUndefined();
  });

  it('null은 필드 제거, 객체는 얕게 합침', () => {
    const fan = resolveSkill('gs_earthsplit', { points: 3, variant: 'fan' });
    expect(fan.hitbox).toBeUndefined();
    expect(fan.area?.shape).toBe('fan');
    const instant = resolveSkill('st_fireburst', { points: 3, variant: 'instant' });
    expect(instant.phases).toEqual({ ...skillDef('st_fireburst').phases, windup: 0.2 });
    const perma = resolveSkill('st_icefield', { points: 3, variant: 'permafrost' });
    expect(perma.area).toMatchObject({ shape: 'rect', width: 96, depth: 48 });
    expect(perma.status?.type).toBe('slow');
  });

  it('후속·해제 판정 계수에도 레벨 배율', () => {
    expect(resolveSkill('gs_earthsplit', { points: 3, variant: 'crack' }).after).toEqual({ delay: 1, coef: 390 });
    expect(resolveSkill('st_icefield', { points: 3, variant: 'shatter' }).onStatusEnd?.coef).toBeCloseTo(520);
  });

  it('무기 스킬은 키 순서대로, 안 배운 계열 슬롯은 빈칸', () => {
    expect(weaponSkills(gs, { gs_earthsplit: { points: 2 } }).map((d) => d && [d.id, Math.round(d.coef)])).toEqual([['gs_launch', 400], ['gs_earthsplit', 690], null, null]);
  });
});

describe('노드 규칙', () => {
  it('SP = 레벨 − 1, 쓴 SP = 기본 1포인트를 뺀 합', () => {
    expect(spTotal(1)).toBe(0);
    expect(spTotal(5)).toBe(4);
    expect(spSpent(gs, {})).toBe(0);
    expect(spSpent(gs, { gs_launch: { points: 3 }, gs_earthsplit: { points: 2 } })).toBe(3);
  });

  it('SP가 모자라면 거절', () => {
    expect(checkNode(gs, {}, 'gs_launch', { points: 2 }, 0)).toBe('sp');
    expect(checkNode(gs, {}, 'gs_launch', { points: 3 }, 2)).toBeNull();
    expect(checkNode(gs, { gs_earthsplit: { points: 3 } }, 'gs_launch', { points: 2 }, 2)).toBe('sp');
  });

  it('포인트 범위·변형 조건·다른 무기 스킬', () => {
    expect(checkNode(gs, {}, 'gs_launch', { points: 4 }, 9)).toBe('points');
    expect(checkNode(gs, {}, 'gs_launch', { points: 0 }, 9)).toBe('points');
    expect(checkNode(gs, {}, 'gs_launch', { points: 2, variant: 'double' }, 9)).toBe('variant');
    expect(checkNode(gs, {}, 'gs_launch', { points: 3, variant: 'nope' }, 9)).toBe('variant');
    expect(checkNode(gs, {}, 'gs_launch', { points: 3, variant: 'wind' }, 9)).toBeNull();
    expect(checkNode(gs, {}, 'st_fireburst', { points: 1 }, 9)).toBe('skill');
  });
});

describe('계열 1단계 (skills.md 1장)', () => {
  it('트리 = 기본 스킬 뒤 계열 스킬, 계열 스킬은 0포인트(안 배움)부터', () => {
    expect(treeSkills(gs)).toEqual(['gs_launch', 'gs_earthsplit', 'gs_whirl', 'gs_shoulder', 'gs_wave', 'gs_draw']);
    expect(checkNode(gs, {}, 'gs_whirl', { points: 0 }, 0)).toBeNull();
    expect(checkNode(gs, {}, 'gs_whirl', { points: 1 }, 0)).toBe('sp');
    expect(spSpent(gs, { gs_whirl: { points: 2 } })).toBe(2);
    expect(buildSkill(gs, {}, 'gs_whirl')).toBeUndefined();
    expect(buildSkill(gs, { gs_whirl: { points: 1 } }, 'gs_whirl')?.id).toBe('gs_whirl');
  });

  it('같은 계열·단계는 하나만: 바꾸면 포인트가 옮겨가 SP가 모자라도 된다', () => {
    const b = { gs_whirl: { points: 2 } };
    expect(checkNode(gs, b, 'gs_shoulder', { points: 2 }, 2)).toBeNull();
    expect(applyNode(gs, b, 'gs_shoulder', { points: 2 })).toEqual({ gs_shoulder: { points: 2 } });
    // 다른 계열은 따로 센다
    expect(checkNode(gs, b, 'gs_wave', { points: 1 }, 2)).toBe('sp');
    expect(applyNode(gs, b, 'gs_whirl', { points: 0 })).toEqual({});
  });

  it('슬롯 U I O P = 기본 2개 + A·B에서 배운 스킬', () => {
    expect(slotSkills(gs, {})).toEqual(['gs_launch', 'gs_earthsplit', null, null]);
    expect(slotSkills(gs, { gs_shoulder: { points: 1 }, gs_draw: { points: 3, variant: 'back' } })).toEqual(['gs_launch', 'gs_earthsplit', 'gs_shoulder', 'gs_draw']);
    expect(weaponSkills(gs, { gs_draw: { points: 3, variant: 'back' } })[3]?.move).toEqual({ distance: -32, during: 'active' });
  });

  it('기본 스킬에 있는 반복은 변형이 일부만 덮어쓴다', () => {
    expect(resolveSkill('st_pillar', { points: 3, variant: 'march' }).repeat).toEqual({ count: 8, interval: 0.25, step: 8 });
  });

  it('계열 스킬 1포인트는 저장 문자열에 남는다', () => {
    expect(encodeBuild({ gs_whirl: { points: 1 }, gs_launch: { points: 1 } })).toBe('gs_whirl:1');
    expect(decodeBuild('gs_whirl:1')).toEqual({ gs_whirl: { points: 1 } });
  });
});

describe('저장 문자열', () => {
  it('왕복 (1포인트는 생략)', () => {
    const b = { gs_launch: { points: 3, variant: 'double' }, gs_earthsplit: { points: 1 }, st_icefield: { points: 2 } };
    const s = encodeBuild(b);
    expect(s).toBe('gs_launch:3:double,st_icefield:2');
    expect(decodeBuild(s)).toEqual({ gs_launch: { points: 3, variant: 'double' }, st_icefield: { points: 2 } });
  });

  it('모르는 스킬·변형, 잘못된 포인트는 버린다', () => {
    expect(decodeBuild('x:2,gs_launch:9,gs_earthsplit:2:crack,st_icefield:3:zzz,')).toEqual({ gs_earthsplit: { points: 2 }, st_icefield: { points: 3 } });
    expect(decodeBuild('')).toEqual({});
  });
});
