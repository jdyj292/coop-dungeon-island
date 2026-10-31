// 스킬 포인트·변형 규칙 (skills.md 1장, balance.md 1장 스킬 레벨 배율)
import { describe, expect, it } from 'vitest';
import { skillDef, weaponDef } from './actions';
import { applyNode, buildSkill, checkNode, slotSkills, weaponSkills } from './skillLoadout';
import { decodeBuild, encodeBuild, isOpen, pointsAt, resolveSkill, spSpent, spTotal, treeSkills, unlockLevelOf } from './skillTree';

const gs = weaponDef('greatsword');
const lv = (level: number, branch: 'A' | 'B' = 'A') => ({ level, branch });

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

  it('기본 스킬에 있는 반복은 변형이 일부만 덮어쓴다', () => {
    expect(resolveSkill('st_pillar', { points: 3, variant: 'march' }).repeat).toEqual({ count: 8, interval: 0.25, step: 8 });
  });
});

describe('레벨로 열림 (skills.md 1장)', () => {
  it('트리 = 기본 스킬 뒤 계열 스킬을 열리는 레벨 순', () => {
    expect(treeSkills(gs)).toEqual(['gs_launch', 'gs_earthsplit', 'gs_whirl', 'gs_wave', 'gs_shoulder', 'gs_draw', 'gs_quake', 'gs_scar', 'gs_throw', 'gs_cyclone']);
    expect(['gs_launch', 'gs_whirl', 'gs_shoulder', 'gs_quake', 'gs_heavyhand', 'greatsword.cancel'].map(unlockLevelOf)).toEqual([1, 2, 4, 6, 3, 5]);
    expect([isOpen('gs_whirl', 1), isOpen('gs_whirl', 2)]).toEqual([false, true]);
  });

  it('열린 액티브는 1포인트부터(공짜), 안 열렸으면 0, 패시브는 배운 만큼', () => {
    expect(pointsAt({}, 'gs_whirl', 1)).toBe(0);
    expect(pointsAt({}, 'gs_whirl', 2)).toBe(1);
    expect(pointsAt({ gs_whirl: { points: 3 } }, 'gs_whirl', 2)).toBe(3);
    expect(pointsAt({}, 'gs_heavyhand', 9)).toBe(0);
    expect(pointsAt({ gs_heavyhand: { points: 2 } }, 'gs_heavyhand', 9)).toBe(2);
  });

  it('잠긴 노드는 거절', () => {
    expect(checkNode(gs, {}, 'gs_quake', { points: 2 }, 9, lv(5))).toBe('locked');
    expect(checkNode(gs, {}, 'gs_quake', { points: 2 }, 9, lv(6))).toBeNull();
  });
});

describe('노드 규칙', () => {
  it('SP = 레벨 − 1, 쓴 SP = 액티브는 1포인트를 뺀 합, 패시브는 포인트 합', () => {
    expect(spTotal(1)).toBe(0);
    expect(spTotal(5)).toBe(4);
    expect(spSpent(gs, {})).toBe(0);
    expect(spSpent(gs, { gs_launch: { points: 3 }, gs_earthsplit: { points: 2 }, gs_whirl: { points: 1 }, gs_heavyhand: { points: 2 } })).toBe(5);
  });

  it('SP가 모자라면 거절, 내리는 건 됨', () => {
    expect(checkNode(gs, {}, 'gs_launch', { points: 2 }, 0, lv(1))).toBe('sp');
    expect(checkNode(gs, {}, 'gs_launch', { points: 3 }, 2, lv(1))).toBeNull();
    expect(checkNode(gs, { gs_earthsplit: { points: 3 } }, 'gs_launch', { points: 2 }, 2, lv(1))).toBe('sp');
    expect(checkNode(gs, { gs_earthsplit: { points: 3 } }, 'gs_earthsplit', { points: 2 }, 0, lv(1))).toBeNull();
  });

  it('포인트 범위·변형·다른 무기 스킬 (변형은 포인트와 상관없이)', () => {
    expect(checkNode(gs, {}, 'gs_launch', { points: 4 }, 9, lv(1))).toBe('points');
    expect(checkNode(gs, {}, 'gs_launch', { points: 0 }, 9, lv(1))).toBe('points');
    expect(checkNode(gs, {}, 'gs_whirl', { points: 0 }, 9, lv(2))).toBe('points');
    expect(checkNode(gs, {}, 'gs_launch', { points: 1, variant: 'double' }, 0, lv(1))).toBeNull();
    expect(checkNode(gs, {}, 'gs_launch', { points: 3, variant: 'nope' }, 9, lv(1))).toBe('variant');
    expect(checkNode(gs, {}, 'st_fireburst', { points: 1 }, 9, lv(1))).toBe('skill');
  });

  it('다른 계열 노드는 거절, 같은 계열 스킬은 모두 배움 (택1 없음)', () => {
    expect(checkNode(gs, {}, 'gs_wave', { points: 2 }, 9, lv(9))).toBe('branch');
    expect(checkNode(gs, {}, 'gs_wave', { points: 2 }, 9, lv(9, 'B'))).toBeNull();
    const b = applyNode(applyNode({}, 'gs_whirl', { points: 3 }), 'gs_shoulder', { points: 2 });
    expect(b).toEqual({ gs_whirl: { points: 3 }, gs_shoulder: { points: 2 } });
  });

  it('기본값이 되면 노드를 지움 (액티브 1포인트·변형 없음), 변형이 있으면 1포인트도 남김', () => {
    expect(applyNode({ gs_whirl: { points: 2 } }, 'gs_whirl', { points: 1 })).toEqual({});
    expect(applyNode({}, 'gs_whirl', { points: 1, variant: 'rush' })).toEqual({ gs_whirl: { points: 1, variant: 'rush' } });
    expect(applyNode({ gs_launch: { points: 2 } }, 'gs_launch', { points: 1 })).toEqual({});
  });

  it('던전 슬롯: slot이 없으면 기본 U I + 배운 계열 스킬, 안 배운 계열 스킬은 못 씀', () => {
    expect(slotSkills(gs, {})).toEqual(['gs_launch', 'gs_earthsplit', null, null]);
    expect(buildSkill(gs, {}, 'gs_whirl')).toBeUndefined();
    expect(slotSkills(gs, { gs_shoulder: { points: 1 }, gs_draw: { points: 3, variant: 'back' } })).toEqual(['gs_launch', 'gs_earthsplit', 'gs_shoulder', 'gs_draw']);
    expect(weaponSkills(gs, { gs_draw: { points: 3, variant: 'back' } })[2]?.move).toEqual({ distance: -32, during: 'active' });
  });
});

describe('저장 문자열', () => {
  it('왕복 (기본 스킬 1포인트는 생략, 계열 스킬 1포인트는 남음)', () => {
    const b = { gs_launch: { points: 3, variant: 'double' }, gs_earthsplit: { points: 1 }, st_icefield: { points: 2 }, gs_whirl: { points: 1 } };
    const s = encodeBuild(b);
    expect(s).toBe('gs_launch:3:double,st_icefield:2,gs_whirl:1');
    expect(decodeBuild(s)).toEqual({ gs_launch: { points: 3, variant: 'double' }, st_icefield: { points: 2 }, gs_whirl: { points: 1 } });
  });

  it('모르는 스킬·변형, 잘못된 포인트는 버린다 (변형은 1포인트에도)', () => {
    expect(decodeBuild('x:2,gs_launch:9,gs_earthsplit:1:crack,st_icefield:3:zzz,')).toEqual({ gs_earthsplit: { points: 1, variant: 'crack' }, st_icefield: { points: 3 } });
    expect(decodeBuild('')).toEqual({});
  });
});
