// 계열 1단계 액티브의 새 판정 (skills.md 2·3장, data.md 1·3장): 다단히트·끌어당김·체공 유지·슈퍼아머·벽꿍·여러 줄·연발·반복 이동 (Lv1 ATK 10)
import { describe, expect, it } from 'vitest';
import { weaponDef } from '../actions';
import { TICK } from '../constants';
import type { Monster } from '../monster/state';
import type { PlayerInput } from '../player';
import { hurtPlayer } from '../playerHurt';
import { resolveSkill } from '../skillTree';
import { RoomSim, type SimEvent } from './room';

const bounds = { minX: 0, maxX: 1000, minY: 0, maxY: 100 };
const none: PlayerInput = { x: 0, y: 0, attack: false, skill: null, backstep: false };
const room = (weapon: string, b = bounds) => new RoomSim(weaponDef(weapon), b, { x: 100, y: 50 }, { ai: false });
const run = (sim: RoomSim, first: PlayerInput, sec: number): SimEvent[] => {
  const events: SimEvent[] = [];
  for (let i = 0; i < Math.round(sec / TICK); i++) events.push(...sim.tick(TICK, i === 0 ? first : none).events);
  return events;
};
const tough = (m: Monster) => Object.assign(m, { hp: 5000, maxHp: 5000 });
const hits = (ev: SimEvent[]) => ev.flatMap((e) => (e.type === 'hit' ? [e.damage] : []));
const cast = (id: string, variant?: string): PlayerInput => ({ ...none, skill: resolveSkill(id, variant ? { points: 3, variant } : { points: 1 }) });

describe('다단히트 (회전베기)', () => {
  it('active 동안 0.15초마다 한 번씩 6번', () => {
    const sim = room('greatsword');
    const [m] = sim.spawn([{ kind: 'capknight', x: 116, y: 50 }]);
    tough(m!);
    expect(hits(run(sim, cast('gs_whirl'), 1.6))).toEqual([10, 10, 10, 10, 10, 10]);
  });

  it('흡입: 깊이가 달라도 내 쪽으로 끌려온다', () => {
    const sim = room('greatsword');
    const [m] = sim.spawn([{ kind: 'mushroom', x: 112, y: 62 }]);
    tough(m!);
    run(sim, cast('gs_whirl', 'suck'), 0.5);
    expect(Math.abs(m!.body.y - sim.player.pos.y)).toBeLessThan(6);
  });
});

describe('슈퍼아머 (어깨 들이받기)', () => {
  it('시전 중 맞아도 피해만 받고 돌진은 계속', () => {
    const sim = room('greatsword'), p = sim.player;
    run(sim, cast('gs_shoulder'), 0.2);
    const hp = p.hp;
    expect(hurtPlayer(p, 5, 'heavy', -1)).toEqual(['armor']);
    expect(p.hp).toBe(hp - 5);
    expect(p.fighter.run?.def.id).toBe('gs_shoulder');
    expect(p.hurt).toBeNull();
  });
});

describe('벽꿍', () => {
  it('밀린 적이 벽에 닿으면 쓰러지며 한 번 더', () => {
    const sim = room('greatsword', { ...bounds, maxX: 150 });
    const [m] = sim.spawn([{ kind: 'boar', x: 125, y: 50 }]);
    tough(m!);
    let down = false;
    const ev: SimEvent[] = [];
    run(sim, cast('gs_shoulder', 'wall'), TICK);
    for (let i = 0; i < 60; i++) {
      ev.push(...run(sim, none, TICK));
      down ||= m!.body.state === 'down';
    }
    expect(hits(ev)).toHaveLength(2);
    expect(ev.some((e) => e.type === 'echo' && e.echo.kind === 'after')).toBe(true);
    expect(down).toBe(true);
  });
});

describe('투사체 여러 줄·연발', () => {
  const bolts = (ev: SimEvent[]) => ev.flatMap((e) => (e.type === 'bolt' ? [e.bolt.y] : []));

  it('세 갈래: 깊이 −14·0·14에 한 발씩', () => {
    expect(bolts(run(room('greatsword'), cast('gs_wave', 'three'), 0.5))).toEqual([36, 50, 64]);
  });

  it('3연발: 0.15초 간격 세 발', () => {
    expect(bolts(run(room('staff'), cast('st_icelance', 'triple'), 0.8))).toHaveLength(3);
  });
});

describe('반복 판정 이동', () => {
  const spots = (ev: SimEvent[]) => ev.flatMap((e) => (e.type === 'echo' ? [Math.round(e.echo.x)] : []));

  it('불꽃 기둥: 2초 동안 8번 (첫 판정 + 7번)', () => {
    const sim = room('staff');
    const [m] = sim.spawn([{ kind: 'capknight', x: 156, y: 50 }]);
    tough(m!);
    const ev = run(sim, cast('st_pillar'), 2.8);
    expect(hits(ev)).toHaveLength(8);
    expect(new Set(spots(ev))).toEqual(new Set([100]));
  });

  it('행진: 판정마다 8px씩 앞으로', () => {
    expect(spots(run(room('staff'), cast('st_pillar', 'march'), 2.8))).toEqual([108, 116, 124, 132, 140, 148, 156]);
  });

  it('쌍기둥: 위아래 두 자리에 5번씩', () => {
    const ev = run(room('staff'), cast('st_pillar', 'twin'), 2.8);
    const ys = ev.flatMap((e) => (e.type === 'echo' ? [e.echo.y] : []));
    expect(ys.filter((y) => y === 50)).toHaveLength(4);
    expect(ys.filter((y) => y === 74)).toHaveLength(5);
  });
});

describe('부유 구슬', () => {
  it('구슬 안 땅의 적을 8번 때리고 느리게 한다 (가벼운 적은 밀려 나가므로 무거운 적으로)', () => {
    const sim = room('staff');
    const [m] = sim.spawn([{ kind: 'capknight', x: 148, y: 50 }]);
    tough(m!);
    const first = hits(run(sim, cast('st_orb'), 1.5)).length;
    expect(m!.slow.left).toBeGreaterThan(0);
    expect(m!.slow.amount).toBeCloseTo(0.3);
    expect(first + hits(run(sim, none, 2)).length).toBe(8);
  });

  it('보스(뜨지 않음)도 8번 맞고 느려진다', () => {
    const sim = room('staff');
    const [m] = sim.spawn([{ kind: 'mossbear', x: 148, y: 50 }]);
    tough(m!);
    const first = hits(run(sim, cast('st_orb'), 1.5)).length;
    expect(m!.body.state).not.toBe('air');
    expect(m!.slow.amount).toBeCloseTo(0.3);
    expect(first + hits(run(sim, none, 2)).length).toBe(8);
  });
});

describe('끌어올림', () => {
  it('판정 중심으로 끌려가며 뜬다', () => {
    const sim = room('staff');
    const [m] = sim.spawn([{ kind: 'mushroom', x: 176, y: 60 }]);
    tough(m!);
    run(sim, cast('st_lift'), 0.8);
    expect(m!.body.state).toBe('air');
    expect(Math.abs(m!.body.x - 156)).toBeLessThan(4);
    expect(Math.abs(m!.body.y - 50)).toBeLessThan(2);
  });
});
