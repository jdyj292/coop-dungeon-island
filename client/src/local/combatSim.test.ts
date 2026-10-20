import { describe, expect, it } from 'vitest';
import { TICK, weaponDef } from '@game/shared';
import { newPlayer, spawnMonster, stepPlayer, type PlayerInput } from './combatSim';

const gs = weaponDef('greatsword');
const bounds = { minX: 0, maxX: 1000, minY: 0, maxY: 100 };
const none: PlayerInput = { x: 0, y: 0, attack: false, skill: null, backstep: false };

describe('active 구간 판정', () => {
  it('대시: 시작할 때는 닿지 않던 대상도 전진하며 칼끝에 닿으면 맞음 (한 번만)', () => {
    const p = newPlayer({ x: 100, y: 50 });
    // 판정 끝 = 앞 22px + 피격 상자 절반 6px → 처음에는 40px 앞 버섯에 닿지 않음
    const m = spawnMonster('mushroom', 140, 50);
    const tap = (x: number, n: number) => { for (let i = 0; i < n; i++) stepPlayer(p, gs, { ...none, x }, TICK, bounds, [m]); };
    tap(1, 3); tap(0, 3); tap(1, 6);
    expect(p.run.running).toBe(true);
    let hits = 0;
    for (let i = 0; i < 40; i++) {
      hits += stepPlayer(p, gs, { ...none, x: 1, attack: i === 0 }, TICK, bounds, [m]).hits.length;
    }
    expect(hits).toBe(1);
  });
  it('제자리 평타는 그대로 한 번', () => {
    const p = newPlayer({ x: 100, y: 50 });
    const m = spawnMonster('mushroom', 114, 50);
    let hits = 0;
    for (let i = 0; i < 40; i++) hits += stepPlayer(p, gs, { ...none, attack: i === 0 }, TICK, bounds, [m]).hits.length;
    expect(hits).toBe(1);
  });
});
