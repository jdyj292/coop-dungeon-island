// 발도 (skills.md 2장): 사라짐(active 동안 안 보이고 맞지 않음, 제자리) → active 끝에 앞으로 한 번에 → 늦은 판정이 지나온 길 전체
import { describe, expect, it } from 'vitest';
import { isVanished, weaponDef } from '../actions';
import { TICK } from '../constants';
import type { Monster } from '../monster/state';
import type { PlayerInput } from '../player';
import { hurtPlayer } from '../playerHurt';
import { resolveSkill } from '../cards/build';
import { RoomSim, type SimEvent } from './room';

const bounds = { minX: 0, maxX: 1000, minY: 0, maxY: 100 };
const none: PlayerInput = { x: 0, y: 0, attack: false, skill: null, backstep: false };
const room = () => new RoomSim(weaponDef('greatsword'), bounds, { x: 100, y: 50 }, { ai: false });
const step = (sim: RoomSim, first: PlayerInput | null, sec: number): SimEvent[] => {
  const events: SimEvent[] = [];
  for (let i = 0; i < Math.round(sec / TICK); i++) events.push(...sim.tick(TICK, i === 0 && first ? first : none).events);
  return events;
};
const tough = (m: Monster) => Object.assign(m, { hp: 5000, maxHp: 5000 });
const hitIds = (ev: SimEvent[]) => ev.flatMap((e) => (e.type === 'hit' ? [e.m.id] : []));
const cast = (variant?: string): PlayerInput => ({ ...none, skill: resolveSkill('gs_draw', variant ? { level: 2, variant } : { level: 1 }) });

describe('발도', () => {
  it('active 동안 사라져 제자리·무적, 끝나면 84px 앞에 나타난다', () => {
    const sim = room(), p = sim.player;
    step(sim, cast(), 0.12);
    expect(isVanished(p.fighter.run)).toBe(true);
    expect(p.pos.x).toBe(100);
    expect(hurtPlayer(p, 5, 'heavy', -1)).toEqual([]);
    step(sim, null, 0.1);
    expect(isVanished(p.fighter.run)).toBe(false);
    expect(p.pos.x).toBe(184);
  });

  it('바로는 안 맞고, 나타난 뒤 지나온 길의 적이 한꺼번에 베인다', () => {
    const sim = room();
    const ms = sim.spawn([{ kind: 'capknight', x: 130, y: 50 }, { kind: 'capknight', x: 170, y: 50 }, { kind: 'capknight', x: 205, y: 50 }]);
    ms.forEach(tough);
    expect(hitIds(step(sim, cast(), 0.3))).toEqual([]);
    // 한 틱에 둘 다
    let tick: number[] = [];
    for (let i = 0; i < 24 && !tick.length; i++) tick = hitIds(step(sim, null, TICK));
    expect(tick.sort()).toEqual([ms[0]!.id, ms[1]!.id].sort());
  });

  it('후퇴 발도: 42px 뒤에 나타나고 출발 자리 앞의 적이 늦게 베인다', () => {
    const sim = room(), p = sim.player;
    const [m] = sim.spawn([{ kind: 'capknight', x: 116, y: 50 }]);
    tough(m!);
    expect(hitIds(step(sim, cast('back'), 0.3))).toEqual([]);
    expect(p.pos.x).toBe(58);
    expect(hitIds(step(sim, null, 0.4))).toEqual([m!.id]);
  });
});
