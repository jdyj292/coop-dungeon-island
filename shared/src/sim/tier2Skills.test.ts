// 계열 2단계 액티브 (skills.md 2·3장): 지진·회오리 검기·중력 우물·중력장 (Lv1 ATK 10). 판정은 기존 반복·후속·감속·체공 조합
import { describe, expect, it } from 'vitest';
import { weaponDef } from '../actions';
import { TICK } from '../constants';
import type { Monster } from '../monster/state';
import type { PlayerInput } from '../player';
import { resolveSkill } from '../skillTree';
import { RoomSim, type SimEvent } from './room';

const bounds = { minX: 0, maxX: 1000, minY: 0, maxY: 100 };
const none: PlayerInput = { x: 0, y: 0, attack: false, skill: null, backstep: false };
const room = (weapon: string, ai = false) => new RoomSim(weaponDef(weapon), bounds, { x: 100, y: 50 }, { ai });
const run = (sim: RoomSim, first: PlayerInput, sec: number): SimEvent[] => {
  const events: SimEvent[] = [];
  for (let i = 0; i < Math.round(sec / TICK); i++) events.push(...sim.tick(TICK, i === 0 ? first : none).events);
  return events;
};
const tough = (m: Monster) => Object.assign(m, { hp: 5000, maxHp: 5000 });
const hits = (ev: SimEvent[]) => ev.flatMap((e) => (e.type === 'hit' ? [e.damage] : []));
const cast = (id: string, variant?: string): PlayerInput => ({ ...none, skill: resolveSkill(id, variant ? { points: 3, variant } : { points: 1 }) });

describe('지진', () => {
  it('둘레(뒤쪽 포함) 땅의 적을 띄운다', () => {
    const sim = room('greatsword');
    const ms = sim.spawn([{ kind: 'capknight', x: 130, y: 50 }, { kind: 'capknight', x: 70, y: 56 }]);
    ms.forEach(tough);
    expect(hits(run(sim, cast('gs_quake'), 0.5))).toEqual([80, 80]);
    expect(ms.every((m) => m.body.state === 'air')).toBe(true);
  });

  it('연속 지진: 세 번 (각 350%, 3포인트 ×1.3)', () => {
    const sim = room('greatsword');
    const [m] = sim.spawn([{ kind: 'capknight', x: 120, y: 50 }]);
    tough(m!);
    expect(hits(run(sim, cast('gs_quake', 'chain'), 2))).toHaveLength(3);
  });
});

describe('회오리 검기', () => {
  it('앞으로 나아가며 10번, 정지형은 제자리', () => {
    const sim = room('greatsword');
    const [m] = sim.spawn([{ kind: 'capknight', x: 200, y: 50 }]);
    tough(m!);
    expect(hits(run(sim, cast('gs_cyclone'), 2.5)).length).toBeGreaterThan(0);
    const still = room('greatsword');
    const [far] = still.spawn([{ kind: 'capknight', x: 200, y: 50 }]);
    tough(far!);
    expect(hits(run(still, cast('gs_cyclone', 'still'), 2.5))).toEqual([]);
  });
});

describe('중력 우물', () => {
  it('2초 동안 앞 자리로 끌어당긴다, 붕괴는 끝에 한 번 더', () => {
    const sim = room('staff');
    const [m] = sim.spawn([{ kind: 'capknight', x: 170, y: 70 }]);
    tough(m!);
    const ev = run(sim, cast('st_well'), 2.8);
    expect(hits(ev)).toHaveLength(6);
    expect(Math.abs(m!.body.x - 156)).toBeLessThan(10);
    const sim2 = room('staff');
    const [m2] = sim2.spawn([{ kind: 'capknight', x: 160, y: 50 }]);
    tough(m2!);
    expect(hits(run(sim2, cast('st_well', 'collapse'), 3.5))).toHaveLength(7);
  });
});

describe('중력장', () => {
  it('맞은 적은 4초 동안 느려지고 공격 쿨타임도 느리게 흐른다', () => {
    const sim = room('staff');
    const [m] = sim.spawn([{ kind: 'capknight', x: 150, y: 50 }]);
    tough(m!);
    run(sim, cast('st_gravfield'), 1);
    expect(m!.slow.left).toBeGreaterThan(2.5);
    expect(m!.slow.amount).toBeCloseTo(0.4);
  });

  it('부양장: 느리게 하는 대신 공중 적을 붙잡아 둔다', () => {
    const def = resolveSkill('st_gravfield', { points: 3, variant: 'float' });
    expect(def.status).toMatchObject({ type: 'hold', time: 2 });
    expect(def.flags).toContain('hold');
  });
});
