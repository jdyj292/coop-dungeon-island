// 계열 보너스: 같은 계열 카드 3장 Ⅰ, 5장 Ⅱ (skills.md 1장)
import { describe, expect, it } from 'vitest';
import { weaponDef } from '../actions';
import { perksOf, withPerks } from '../passives';
import { branchBonuses, branchCounts } from './bonus';
import { resolveSkill } from './build';

const gs = weaponDef('greatsword'), st = weaponDef('staff');
const lv1 = (ids: string[]) => Object.fromEntries(ids.map((id) => [id, { level: 1 }]));

describe('계열 보너스', () => {
  it('기본 스킬·공용 패시브·다른 무기는 세지 않음', () => {
    expect(branchCounts('greatsword', ['gs_launch', 'greatsword.quickrise', 'gs_whirl', 'gs_heavyhand', 'gs_wave', 'st_orb'])).toEqual({ A: 2, B: 1 });
  });

  it('3장 = Ⅰ, 5장 = Ⅱ가 Ⅰ을 대신', () => {
    expect(branchBonuses('greatsword', ['gs_whirl', 'gs_shoulder'])).toEqual([]);
    expect(branchBonuses('greatsword', ['gs_whirl', 'gs_shoulder', 'gs_heavyhand'])).toEqual([{ branch: 'A', step: 1, effect: { chargeSpeedMul: 1.15 } }]);
    const five = ['gs_whirl', 'gs_shoulder', 'gs_quake', 'gs_heavyhand', 'gs_steadfast'];
    expect(branchBonuses('greatsword', five)[0]).toMatchObject({ step: 2, effect: { chargeSpeedMul: 1.25, chargeBonusAdd: 0.1 } });
  });

  it('perks에 합쳐짐: 배율은 곱, 더하기는 합', () => {
    const p = perksOf(gs, { ...lv1(['gs_whirl', 'gs_shoulder', 'gs_quake', 'gs_steadfast']), gs_heavyhand: { level: 2 }, gs_giant: { level: 1 } });
    expect(p.chargeSpeedMul).toBeCloseTo(1.6 * 1.25);
    expect(p.chargeBonusAdd).toBeCloseTo(0.3 + 0.1);
  });

  it('검기 Ⅱ: 투사체 스킬 사거리·쿨, 원소 Ⅱ: 범위·MP, 중력 Ⅱ: 감속 시간·양', () => {
    const b = perksOf(gs, lv1(['gs_wave', 'gs_draw', 'gs_scar', 'gs_keenedge', 'gs_honing']));
    const wave = withPerks(resolveSkill('gs_wave'), b), base = resolveSkill('gs_wave');
    expect(wave.projectile!.range).toBeCloseTo(base.projectile!.range * 1.4 * 1.25);
    expect(wave.cooldown).toBeCloseTo(base.cooldown! * 0.9);
    const a = perksOf(st, lv1(['st_pillar', 'st_icelance', 'st_chain', 'st_affinity', 'st_burn']));
    const fb = withPerks(resolveSkill('st_fireburst'), a);
    expect(fb.area!.radius).toBeCloseTo(24 * 1.15);
    expect(fb.mp).toBe(Math.round(resolveSkill('st_fireburst').mp! * 0.9));
    const g = perksOf(st, lv1(['st_orb', 'st_lift', 'st_well', 'st_gravfield', 'st_weightless']));
    const field = withPerks(resolveSkill('st_gravfield'), g);
    expect(field.status).toMatchObject({ type: 'slow', time: 4 * 1.3 });
    expect(field.status!.amount).toBeCloseTo(0.45);
  });
});
