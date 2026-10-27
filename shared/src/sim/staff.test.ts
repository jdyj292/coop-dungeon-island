// 스태프 (skills.md 3장): 마법탄 평타(투사체), 얼음 장판 빙결 (combat.md 3장)
import { describe, expect, it } from 'vitest';
import { skillDef, weaponDef } from '../actions';
import { applyHit } from '../body';
import { TICK } from '../constants';
import { stepMonsterAi } from '../monster/ai';
import { AttackTokens } from '../monster/tokens';
import type { PlayerInput } from '../player';
import { RoomSim } from './room';

const bounds = { minX: 0, maxX: 1000, minY: 0, maxY: 100 };
const none: PlayerInput = { x: 0, y: 0, attack: false, skill: null, backstep: false };
const staffRoom = (ai = false) => new RoomSim(weaponDef('staff'), bounds, { x: 100, y: 50 }, { ai });
const run = (sim: RoomSim, first: PlayerInput, ticks: number) => {
  const events = [];
  for (let i = 0; i < ticks; i++) events.push(...sim.tick(TICK, i === 0 ? first : none).events);
  return events;
};

describe('마법탄', () => {
  it('평타는 앞으로 날아가 처음 닿은 몬스터 하나에 120% (Lv1 ATK 10 → 12)', () => {
    const sim = staffRoom();
    const [near, far] = sim.spawn([{ kind: 'mushroom', x: 150, y: 50 }, { kind: 'mushroom', x: 170, y: 50 }]);
    const ev = run(sim, { ...none, attack: true }, 60);
    expect(ev.filter((e) => e.type === 'bolt')).toHaveLength(1);
    expect(ev.filter((e) => e.type === 'boltEnd')).toHaveLength(1);
    expect([near!.hp, far!.hp]).toEqual([60 - 12, 60]);
    expect(sim.bolts).toHaveLength(0);
  });

  it('사거리(6타일) 밖은 맞지 않고 사라짐', () => {
    const sim = staffRoom();
    const [m] = sim.spawn([{ kind: 'mushroom', x: 100 + 8 + 96 + 20, y: 50 }]);
    const ev = run(sim, { ...none, attack: true }, 60);
    expect(m!.hp).toBe(60);
    expect(ev.some((e) => e.type === 'boltEnd')).toBe(true);
  });
});

describe('빙결', () => {
  it('얼음 장판에 맞은 지상 몬스터는 1.5초 동안 움직이지 않는다', () => {
    const sim = staffRoom(true);
    const [boar] = sim.spawn([{ kind: 'boar', x: 148, y: 50 }]);
    run(sim, { ...none, skill: skillDef('st_icefield') }, Math.round(0.6 / TICK));
    expect(boar!.frozen).toBeGreaterThan(1);
    const x = boar!.body.x;
    run(sim, none, Math.round(0.8 / TICK));
    expect(boar!.body.x).toBeCloseTo(x, 0);
    expect(boar!.attack).toBeNull();
    // 풀린 뒤에는 다시 움직이거나 공격한다 (대조)
    let acted = false;
    for (let i = 0; i < Math.round(2 / TICK); i++) {
      sim.tick(TICK, none);
      acted ||= !!boar!.attack || Math.abs(boar!.body.x - x) > 1;
    }
    expect(acted).toBe(true);
  });

  it('띄워지면 빙결이 풀린다', () => {
    const sim = staffRoom();
    const [m] = sim.spawn([{ kind: 'mushroom', x: 300, y: 50 }]);
    m!.frozen = 1.5;
    applyHit(m!.body, { dir: 1, strength: 'medium', flags: ['launch'] });
    stepMonsterAi(m!, TICK, {
      player: { x: 100, y: 50 }, target: null, targets: [], tokens: new AttackTokens(1), bounds, eliteBusy: () => false, others: [], rng: () => 0,
    });
    expect(m!.frozen).toBe(0);
  });
});
