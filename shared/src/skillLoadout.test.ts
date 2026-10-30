// 계열 2단계 열림·자동 지움, 슬롯 장착 (skills.md 1장)
import { describe, expect, it } from 'vitest';
import { weaponDef } from './actions';
import { applyNode, branchPoints, buildSkill, checkEquip, checkNode, equipSkill, isUnlocked, prunedBy, slotSkills, weaponSkills } from './skillLoadout';
import { decodeBuild, encodeBuild, spSpent } from './skillTree';

const gs = weaponDef('greatsword'), st = weaponDef('staff');

describe('계열 2단계 열림', () => {
  it('같은 계열 1단계 액티브 + 보조 포인트가 3 이상이면 열림', () => {
    expect(isUnlocked(gs, {}, 'gs_quake')).toBe(false);
    expect(isUnlocked(gs, { gs_whirl: { points: 2 } }, 'gs_quake')).toBe(false);
    expect(isUnlocked(gs, { gs_whirl: { points: 2 }, gs_heavyhand: { points: 1 } }, 'gs_quake')).toBe(true);
    expect(isUnlocked(gs, { gs_shoulder: { points: 3 } }, 'gs_quake')).toBe(true);
    // 다른 계열 포인트는 세지 않는다
    expect(isUnlocked(gs, { gs_wave: { points: 3 } }, 'gs_quake')).toBe(false);
    expect(branchPoints(gs, { gs_whirl: { points: 3 }, gs_quake: { points: 2 } }, 'A', 2)).toBe(3);
  });

  it('잠긴 단계는 거절, 열리면 SP로 배움', () => {
    expect(checkNode(gs, {}, 'gs_quake', { points: 1 }, 9)).toBe('locked');
    expect(checkNode(gs, { gs_whirl: { points: 3 } }, 'gs_quake', { points: 1 }, 3)).toBe('sp');
    expect(checkNode(gs, { gs_whirl: { points: 3 } }, 'gs_quake', { points: 1 }, 4)).toBeNull();
    expect(checkNode(st, { st_orb: { points: 3 } }, 'st_well', { points: 3, variant: 'collapse' }, 6)).toBeNull();
  });

  it('2단계도 같은 단계 택1 (옮겨 배우기)', () => {
    const b = { st_lift: { points: 3 }, st_well: { points: 2 } };
    expect(checkNode(st, b, 'st_gravfield', { points: 2 }, 5)).toBeNull();
    expect(applyNode(st, b, 'st_gravfield', { points: 2 })).toEqual({ st_lift: { points: 3 }, st_gravfield: { points: 2 } });
  });

  it('1단계를 내리거나 옮기면 2단계는 지워지고 SP가 돌아옴', () => {
    const b = { gs_whirl: { points: 3 }, gs_quake: { points: 3, variant: 'focus' } };
    expect(spSpent(gs, b)).toBe(6);
    const down = applyNode(gs, b, 'gs_whirl', { points: 2 });
    expect(down).toEqual({ gs_whirl: { points: 2 } });
    expect(spSpent(gs, down)).toBe(2);
    expect(prunedBy(gs, b, 'gs_whirl', { points: 2 })).toEqual(['gs_quake']);
    // 옮겨 배우기는 1포인트로 시작하니 2단계가 지워짐
    expect(applyNode(gs, b, 'gs_shoulder', { points: 1 })).toEqual({ gs_shoulder: { points: 1 } });
    // 보조 노드 1포인트가 받쳐 주면 그대로
    const withPassive = { ...b, gs_steadfast: { points: 1 } };
    expect(prunedBy(gs, withPassive, 'gs_whirl', { points: 2 })).toEqual([]);
  });
});

describe('슬롯 장착', () => {
  it('slot이 없으면 기본 배치: 기본 U I, 계열 1단계 O P, 남은 칸에 다른 액티브', () => {
    expect(slotSkills(gs, decodeBuild('gs_whirl:3,gs_quake:1'))).toEqual(['gs_launch', 'gs_earthsplit', 'gs_whirl', 'gs_quake']);
    expect(slotSkills(gs, decodeBuild('gs_whirl:3,gs_quake:1,gs_draw:1'))).toEqual(['gs_launch', 'gs_earthsplit', 'gs_whirl', 'gs_draw']);
  });

  it('새로 배운 액티브는 기본 자리(B 계열 = P) 또는 첫 빈칸, 빈칸이 없으면 장착 안 함', () => {
    let b = applyNode(gs, {}, 'gs_wave', { points: 1 });
    expect(slotSkills(gs, b)).toEqual(['gs_launch', 'gs_earthsplit', null, 'gs_wave']);
    b = applyNode(gs, b, 'gs_whirl', { points: 3 });
    b = applyNode(gs, b, 'gs_quake', { points: 1 });
    expect(slotSkills(gs, b)).toEqual(['gs_launch', 'gs_earthsplit', 'gs_whirl', 'gs_wave']);
    expect(buildSkill(gs, b, 'gs_quake')).toBeUndefined();
  });

  it('장착하면 그 칸 스킬과 자리를 바꾸거나 빠짐, 저장 문자열에 실림', () => {
    const b0 = decodeBuild('gs_whirl:3,gs_quake:1,gs_wave:1');
    expect(checkEquip(gs, b0, 'gs_quake', 0)).toBeNull();
    const b1 = equipSkill(gs, b0, 'gs_quake', 0);
    expect(slotSkills(gs, b1)).toEqual(['gs_quake', 'gs_earthsplit', 'gs_whirl', 'gs_wave']);
    expect(buildSkill(gs, b1, 'gs_launch')).toBeUndefined();
    expect(weaponSkills(gs, b1)[0]?.id).toBe('gs_quake');
    expect(slotSkills(gs, decodeBuild(encodeBuild(b1)))).toEqual(slotSkills(gs, b1));
    // 이미 장착한 스킬끼리는 자리 바꿈
    expect(slotSkills(gs, equipSkill(gs, b1, 'gs_wave', 0))).toEqual(['gs_wave', 'gs_earthsplit', 'gs_whirl', 'gs_quake']);
    // 기본 배치로 돌아가면 slot을 적지 않는다
    expect(encodeBuild(equipSkill(gs, equipSkill(gs, b1, 'gs_launch', 0), 'gs_launch', 0))).toBe('gs_whirl:3,gs_quake:1,gs_wave:1');
  });

  it('장착한 스킬이 지워지면 빈칸, 택1로 옮기면 그 칸을 이어받음', () => {
    const b = equipSkill(gs, decodeBuild('gs_whirl:3,gs_quake:1,gs_wave:1'), 'gs_quake', 0);
    expect(slotSkills(gs, applyNode(gs, b, 'gs_quake', { points: 0 }))).toEqual([null, 'gs_earthsplit', 'gs_whirl', 'gs_wave']);
    expect(slotSkills(gs, applyNode(gs, b, 'gs_wave', { points: 0 }))).toEqual(['gs_quake', 'gs_earthsplit', 'gs_whirl', null]);
    expect(slotSkills(gs, applyNode(gs, b, 'gs_draw', { points: 1 }))).toEqual(['gs_quake', 'gs_earthsplit', 'gs_whirl', 'gs_draw']);
  });

  it('안 배운 스킬·보조 노드·없는 슬롯은 거절, 다른 무기 빌드는 그대로', () => {
    expect(checkEquip(gs, {}, 'gs_quake', 0)).toBe('skill');
    expect(checkEquip(gs, { gs_steadfast: { points: 1 } }, 'gs_steadfast', 0)).toBe('skill');
    expect(checkEquip(gs, {}, 'gs_launch', 4)).toBe('slot');
    const both = { st_icefield: { points: 2 }, gs_wave: { points: 1 } };
    expect(equipSkill(gs, both, 'gs_wave', 0).st_icefield).toEqual({ points: 2 });
  });
});
