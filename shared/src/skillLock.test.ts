// 스킬 → 스킬 캔슬 없음, 다운 중 회피 불가 (skills.md 1장, combat.md 2·4장)
import { describe, expect, it } from 'vitest';
import { skillDef, weaponDef } from './actions';
import { TICK } from './constants';
import { PLAYER } from './data/load';
import { newPlayerState, stepPlayerState, type PlayerInput, type PlayerState } from './player';
import { hurtPlayer } from './playerHurt';

const gs = weaponDef('greatsword');
const bounds = { minX: 0, maxX: 1000, minY: 0, maxY: 100 };
const none: PlayerInput = { x: 0, y: 0, attack: false, skill: null, backstep: false };
const launch = skillDef('gs_launch'), split = skillDef('gs_earthsplit');

function ticks(p: PlayerState, n: number, first: Partial<PlayerInput> = {}) {
  const events: string[] = [];
  for (let i = 0; i < n; i++) {
    const r = stepPlayerState(p, gs, { ...none, ...(i === 0 ? first : {}) }, TICK, bounds);
    events.push(...r.events.filter((e) => e.type === 'start').map((e) => e.run.def.id));
    if (r.backstepStarted) events.push('backstep');
  }
  return events;
}

describe('스킬 → 스킬', () => {
  it('스킬 후딜레이에 다른 스킬 불가', () => {
    const p = newPlayerState({ x: 100, y: 50 });
    ticks(p, 1, { skill: launch });
    ticks(p, Math.ceil((launch.phases.windup + launch.phases.active) / TICK) + 1);
    expect(ticks(p, 1, { skill: split })).toEqual([]);
  });
});

describe('다운', () => {
  it('밀림이 끝난 뒤에도 회피 키 무시', () => {
    const p = newPlayerState({ x: 100, y: 50 });
    hurtPlayer(p, 1, 'heavy', 1);
    ticks(p, Math.ceil(PLAYER.hurt.pushSec / TICK) + 1);
    expect(ticks(p, 1, { backstep: true })).toEqual([]);
    expect(p.hurt?.kind).toBe('down');
  });
});
