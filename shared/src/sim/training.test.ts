// 수련장 (dungeon.md 11장): 허수아비는 기절하지 않고 제자리로 돌아감, 스킬 쿨타임·MP 없음
import { describe, expect, it } from 'vitest';
import { weaponDef } from '../actions';
import { TICK } from '../constants';
import type { PlayerInput } from '../player';
import { resolveSkill } from '../cards/build';
import { RoomSim } from './room';

const gs = weaponDef('greatsword');
const bounds = { minX: 0, maxX: 1000, minY: 0, maxY: 160 };
const none: PlayerInput = { x: 0, y: 0, attack: false, skill: null, backstep: false };
const launch: PlayerInput = { ...none, skill: resolveSkill('gs_launch', { level: 1 }) };
const run = (sim: RoomSim, n: number, input = none) => { for (let i = 0; i < n; i++) sim.tick(TICK, input); };

describe('허수아비 (monsters.json dummy)', () => {
  it('아무리 맞아도 체력이 그대로라 기절하지 않음 (피해는 이벤트로 나감)', () => {
    const sim = new RoomSim(gs, bounds, { x: 100, y: 80 });
    const [m] = sim.spawn([{ kind: 'dummy', x: 118, y: 80 }]);
    // 보통 몬스터라면 몇 대에 기절할 체력
    m!.hp = m!.maxHp = 30;
    let damage = 0;
    for (let k = 0; k < 20; k++) {
      for (let i = 0; i < 40; i++) {
        for (const e of sim.tick(TICK, { ...none, attack: i === 0 }).events) if (e.type === 'hit') damage += e.damage;
      }
    }
    expect(damage).toBeGreaterThan(m!.maxHp);
    expect(m!.hp).toBe(m!.maxHp);
    expect(m!.body.ko).toBe(false);
    expect(sim.alive).toHaveLength(1);
  });
  it('공격하지 않고, 밀려나면 처음 자리로 돌아감', () => {
    const sim = new RoomSim(gs, bounds, { x: 100, y: 80 });
    const [m] = sim.spawn([{ kind: 'dummy', x: 300, y: 80 }]);
    m!.body.x = 340;
    m!.body.y = 100;
    run(sim, 180);
    expect(m!.attack).toBeNull();
    expect(Math.abs(m!.body.x - 300)).toBeLessThanOrEqual(1);
    expect(Math.abs(m!.body.y - 80)).toBeLessThanOrEqual(1);
    expect(m!.facing).toBe(-1);
  });
});

describe('수련장 플레이어 (PlayerState.free)', () => {
  it('스킬을 써도 쿨타임·MP가 그대로 → 끝나면 바로 다시 씀', () => {
    const sim = new RoomSim(gs, bounds, { x: 100, y: 80 });
    const p = sim.player;
    p.free = true;
    const mp = p.mp;
    run(sim, 1, launch);
    expect(p.fighter.run?.def.id).toBe('gs_launch');
    expect(p.cooldowns.gs_launch ?? 0).toBe(0);
    expect(p.mp).toBe(mp);
    run(sim, 120);
    run(sim, 1, launch);
    expect(p.fighter.run?.def.id).toBe('gs_launch');
  });
  it('보통 방은 쿨타임·MP를 씀', () => {
    const sim = new RoomSim(gs, bounds, { x: 100, y: 80 });
    const p = sim.player, mp = p.mp;
    run(sim, 1, launch);
    expect(p.cooldowns.gs_launch).toBeGreaterThan(0);
    expect(p.mp).toBeLessThan(mp);
  });
});
