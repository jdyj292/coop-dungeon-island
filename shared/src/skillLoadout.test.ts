// 계열 선택·계열별 장착·던전용 빌드 (skills.md 1장)
import { describe, expect, it } from 'vitest';
import { weaponDef } from './actions';
import { perksOf } from './passives';
import { buildSkill, checkEquip, effectiveBuild, equipSlots, loadoutSlots, slotSkills, usable, weaponSkills } from './skillLoadout';
import { decodeBuild, encodeBuild } from './skillTree';

const gs = weaponDef('greatsword'), st = weaponDef('staff');

describe('계열', () => {
  it('고른 계열 노드와 기본·공용만 씀, 안 열린 노드는 못 씀', () => {
    const a = { level: 9, branch: 'A' as const };
    expect(['gs_launch', 'gs_whirl', 'gs_wave', 'gs_heavyhand', 'gs_keenedge', 'greatsword.cancel'].map((id) => usable(id, a))).toEqual([true, true, false, true, false, true]);
    expect(usable('gs_quake', { level: 5, branch: 'A' })).toBe(false);
    expect(usable('greatsword.quickrise', { level: 6, branch: 'B' })).toBe(false);
  });
});

describe('장착 (계열마다 따로)', () => {
  it('저장이 없으면 기본 배치: 기본 U I, 그 계열에서 열린 액티브를 열리는 순서로', () => {
    expect(loadoutSlots(gs, { level: 1, branch: 'A' })).toEqual(['gs_launch', 'gs_earthsplit', null, null]);
    expect(loadoutSlots(gs, { level: 3, branch: 'A' })).toEqual(['gs_launch', 'gs_earthsplit', 'gs_whirl', null]);
    expect(loadoutSlots(gs, { level: 9, branch: 'A' })).toEqual(['gs_launch', 'gs_earthsplit', 'gs_whirl', 'gs_shoulder']);
    expect(loadoutSlots(gs, { level: 9, branch: 'B' })).toEqual(['gs_launch', 'gs_earthsplit', 'gs_wave', 'gs_draw']);
  });

  it('저장한 장착은 그대로, 지금 못 쓰는 스킬은 빈칸', () => {
    const saved = ['gs_quake', 'gs_earthsplit', 'gs_wave', null];
    expect(loadoutSlots(gs, { level: 9, branch: 'A', slots: saved })).toEqual(['gs_quake', 'gs_earthsplit', null, null]);
    expect(loadoutSlots(gs, { level: 5, branch: 'A', slots: saved })).toEqual([null, 'gs_earthsplit', null, null]);
  });

  it('장착하면 그 칸 스킬과 자리를 바꾸거나 빠짐', () => {
    const s = ['gs_launch', 'gs_earthsplit', 'gs_whirl', 'gs_shoulder'];
    expect(equipSlots(s, 'gs_quake', 0)).toEqual(['gs_quake', 'gs_earthsplit', 'gs_whirl', 'gs_shoulder']);
    expect(equipSlots(s, 'gs_shoulder', 0)).toEqual(['gs_shoulder', 'gs_earthsplit', 'gs_whirl', 'gs_launch']);
  });

  it('잠긴 스킬·다른 계열·패시브·없는 슬롯은 거절', () => {
    const a = { level: 5, branch: 'A' as const };
    expect(checkEquip(gs, a, 'gs_shoulder', 2)).toBeNull();
    expect(checkEquip(gs, a, 'gs_quake', 2)).toBe('locked');
    expect(checkEquip(gs, a, 'gs_wave', 2)).toBe('branch');
    expect(checkEquip(gs, a, 'gs_steadfast', 2)).toBe('skill');
    expect(checkEquip(gs, a, 'st_orb', 2)).toBe('skill');
    expect(checkEquip(gs, a, 'gs_launch', 4)).toBe('slot');
  });
});

describe('던전용 빌드', () => {
  const b = decodeBuild('gs_launch:3:double,gs_whirl:2:rush,gs_wave:3,gs_heavyhand:2,gs_keenedge:3,greatsword.cancel:1');

  it('고른 계열·열린 노드만, 액티브는 1포인트부터, 장착한 칸이 slot', () => {
    const lo = { level: 9, branch: 'A' as const, slots: ['gs_whirl', 'gs_launch', null, 'gs_quake'] };
    const e = effectiveBuild(gs, b, lo);
    expect(e).toEqual({
      gs_launch: { points: 3, variant: 'double', slot: 1 }, gs_earthsplit: { points: 1 }, gs_whirl: { points: 2, variant: 'rush', slot: 0 },
      gs_shoulder: { points: 1 }, gs_quake: { points: 1, slot: 3 }, gs_throw: { points: 1 }, gs_heavyhand: { points: 2 }, 'greatsword.cancel': { points: 1 },
    });
    expect(slotSkills(gs, e)).toEqual(['gs_whirl', 'gs_launch', null, 'gs_quake']);
    expect(slotSkills(gs, decodeBuild(encodeBuild(e)))).toEqual(slotSkills(gs, e));
    expect(buildSkill(gs, e, 'gs_shoulder')).toBeUndefined();
    expect(weaponSkills(gs, e)[0]?.id).toBe('gs_whirl');
    // 다른 계열 보조는 효과 없음
    expect(perksOf(gs, e).far).toBeUndefined();
    expect(perksOf(gs, e).chargeSpeedMul).toBe(1.45);
  });

  it('계열을 바꾸면 그 계열 스킬·보조로, 레벨이 낮으면 안 열린 노드는 빠짐', () => {
    const e = effectiveBuild(gs, b, { level: 3, branch: 'B' });
    expect(Object.keys(e)).toEqual(['gs_launch', 'gs_earthsplit', 'gs_wave', 'gs_keenedge']);
    expect(slotSkills(gs, e)).toEqual(['gs_launch', 'gs_earthsplit', 'gs_wave', null]);
    expect(perksOf(gs, e).far?.mul).toBe(1.3);
  });

  it('다른 무기 노드는 들어가지 않음', () => {
    expect(effectiveBuild(gs, { st_icefield: { points: 2 } }, { level: 9, branch: 'A' }).st_icefield).toBeUndefined();
    expect(Object.keys(effectiveBuild(st, {}, { level: 1, branch: 'B' }))).toEqual(['st_fireburst', 'st_icefield']);
  });
});
