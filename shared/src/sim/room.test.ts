import { describe, expect, it } from 'vitest';
import { weaponDef } from '../actions';
import { TICK } from '../constants';
import { atkFor } from '../hit';
import type { PlayerInput } from '../player';
import { RoomSim } from './room';

const gs = weaponDef('greatsword');
const bounds = { minX: 0, maxX: 1000, minY: 0, maxY: 100 };
const none: PlayerInput = { x: 0, y: 0, attack: false, skill: null, backstep: false };
/** AI 없이 (판정만 확인) */
const room = () => new RoomSim(gs, bounds, { x: 100, y: 50 }, { ai: false });
const hits = (sim: RoomSim, input: PlayerInput) => sim.tick(TICK, input).events.filter((e) => e.type === 'hit').length;

describe('active 구간 판정', () => {
  it('대시: 시작할 때는 닿지 않던 대상도 전진하며 칼끝에 닿으면 맞음 (한 번만)', () => {
    const sim = room();
    // 판정 끝 = 앞 22px + 피격 상자 절반 6px → 처음에는 40px 앞 버섯에 닿지 않음
    sim.spawn([{ kind: 'mushroom', x: 140, y: 50 }]);
    const tap = (x: number, n: number) => { for (let i = 0; i < n; i++) sim.tick(TICK, { ...none, x }); };
    tap(1, 3); tap(0, 3); tap(1, 6);
    expect(sim.player.run.running).toBe(true);
    let n = 0;
    for (let i = 0; i < 40; i++) n += hits(sim, { ...none, x: 1, attack: i === 0 });
    expect(n).toBe(1);
  });
  it('제자리 평타는 그대로 한 번, 체력이 0이 되면 기절 → 퇴장', () => {
    const sim = room();
    const [m] = sim.spawn([{ kind: 'mushroom', x: 114, y: 50 }]);
    let n = 0;
    for (let i = 0; i < 40; i++) n += hits(sim, { ...none, attack: i === 0 });
    expect(n).toBe(1);
    expect(m!.hp).toBe(40);
    m!.hp = 10;
    for (let i = 0; i < 40; i++) hits(sim, { ...none, attack: i === 0 });
    expect(m!.body.ko).toBe(true);
    for (let i = 0; i < 120; i++) sim.tick(TICK, none);
    expect(sim.alive).toHaveLength(0);
  });
  it('대검 3타는 몬스터를 띄움', () => {
    const sim = room();
    const [m] = sim.spawn([{ kind: 'mushroom', x: 114, y: 50 }]);
    m!.hp = m!.maxHp = 9999;
    let state = '';
    for (let i = 0; i < 150 && !state; i++) {
      const ev = sim.tick(TICK, { ...none, attack: i % 4 === 0 }).events;
      if (ev.some((e) => e.type === 'hit' && e.def.id === 'gs_b3')) state = m!.body.state;
    }
    expect(state).toBe('air');
  });
  it('데미지는 숙련도 ATK를 따름: 평타 계수 200 → Lv1 20, Lv20 39', () => {
    const sim = room();
    sim.player.atk = atkFor(20);
    const [m] = sim.spawn([{ kind: 'mushroom', x: 114, y: 50 }]);
    for (let i = 0; i < 40; i++) hits(sim, { ...none, attack: i === 0 });
    expect(m!.hp).toBe(60 - 39);
  });
});
