import { describe, expect, it } from 'vitest';
import { COMBAT, MONSTERS, ROOMS, SKILLS, WEAPONS } from '../data/load';
import { atkFor } from '../hit';
import { dpsParts, roomTtks, ttk } from './ttk';

describe('예상 처치 시간 (balance.md 5장)', () => {
  it('숙련도 ATK = 10 × (1 + 0.05 × (Lv − 1))', () => {
    expect([1, 5, 20].map(atkFor)).toEqual([10, 12, 19.5]);
  });
  it('초당 딜 = ATK × (평타 + 스킬 계수 ÷ 실제 쿨)', () => {
    const d = dpsParts(10, WEAPONS.greatsword!, [SKILLS.gs_launch!], 1.5);
    expect(d.basic).toBeCloseTo(750 / 1.84); // 계수 합 ÷ 3연타 시간 (0.5 + 0.5 + 0.84초)
    expect(d.skills[0]!.perSec).toBeCloseTo(400 / 7.5);
    expect(d.total).toBeCloseTo((750 / 1.84 + 400 / 7.5) / 10);
  });
  it('처치 시간 = 체력 ÷ (딜 × 때리는 비율)', () => {
    expect(ttk(60, 50, 0.6)).toBeCloseTo(2);
  });
  it('방은 모든 웨이브를 더하고 보스가 있으면 보스 비율', () => {
    const rooms = roomTtks(ROOMS, MONSTERS, 50, { normal: 0.5, boss: 0.25 });
    const r1 = ROOMS.floor1!.rooms[0]!, hp = r1.waves.reduce((s, w) => s + (w.monsters.mushroom ?? 0) * MONSTERS.mushroom!.hp, 0);
    expect(rooms.find((r) => r.id === 'f1_r1')!.sec).toBeCloseTo(hp / 25);
    const boss = rooms.find((r) => r.boss)!;
    expect(boss.sec).toBeGreaterThanOrEqual(MONSTERS.mossbear!.hp / 12.5);
    expect(COMBAT.cooldownScale).toBe(1.5);
  });
});
