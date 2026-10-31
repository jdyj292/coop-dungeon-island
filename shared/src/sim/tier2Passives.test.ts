// 계열 2단계 보조 (SK-4 3차, skills.md 2·3장): 여진·짓밟기(다운 보정)·올려 검기·검기 순환·냉기 강화·과열·구슬 확장·역장 (Lv1 ATK 10)
import { describe, expect, it } from 'vitest';
import { weaponDef } from '../actions';
import { knockDown } from '../body';
import { TICK } from '../constants';
import type { Monster } from '../monster/state';
import { perksOf, withPerks } from '../passives';
import type { PlayerInput } from '../player';
import { hurtPlayer } from '../playerHurt';
import { resolveSkill, type SkillBuild } from '../skillTree';
import { RoomSim, type SimEvent } from './room';

const bounds = { minX: 0, maxX: 1000, minY: 0, maxY: 100 };
const none: PlayerInput = { x: 0, y: 0, attack: false, skill: null, backstep: false };
const room = (weapon: string, skills: SkillBuild = {}) => new RoomSim(weaponDef(weapon), bounds, { x: 100, y: 50 }, { ai: false, skills });
const run = (sim: RoomSim, first: PlayerInput, sec: number): SimEvent[] => {
  const events: SimEvent[] = [];
  for (let i = 0; i < Math.round(sec / TICK); i++) events.push(...sim.tick(TICK, i === 0 ? first : none).events);
  return events;
};
const spawn = (sim: RoomSim, ...at: [number, number][]) => sim.spawn(at.map(([x, y]) => ({ kind: 'capknight', x, y }))).map((m) => Object.assign(m, { hp: 5000, maxHp: 5000 }));
const hits = (ev: SimEvent[]) => ev.flatMap((e) => (e.type === 'hit' ? [e.damage] : []));
const hitsOn = (ev: SimEvent[], m: Monster) => ev.filter((e) => e.type === 'hit' && e.m === m).length;
/** 빌드의 보조 노드까지 적용한 스킬 (던전 슬롯과 같게) */
const cast = (weapon: string, skills: SkillBuild, id: string): PlayerInput =>
  ({ ...none, skill: withPerks(resolveSkill(id, skills[id] ?? { points: 1 }), perksOf(weaponDef(weapon), skills)) });
const bolts = (ev: SimEvent[]) => ev.filter((e) => e.type === 'bolt').map((e) => (e.type === 'bolt' ? e.bolt : null)!);

describe('다운 보정·짓밟기', () => {
  it('다운된 적은 피해 ×0.5, 짓밟기 3포인트면 ×1.0', () => {
    for (const [skills, dmg] of [[{}, 30], [{ gs_stomp: { points: 3 } }, 60]] as const) {
      const sim = room('greatsword', skills);
      const [m] = spawn(sim, [130, 50]);
      knockDown(m!.body);
      expect(hits(run(sim, cast('greatsword', skills, 'gs_earthsplit'), 0.4))).toEqual([dmg]);
    }
  });
});

describe('여진', () => {
  it('down 판정이 맞은 적 자리에 충격파 (다운 대상도 맞음)', () => {
    const skills = { gs_aftershock: { points: 1 } };
    const sim = room('greatsword', skills);
    const [a, b] = spawn(sim, [130, 50], [130, 66]);
    const ev = run(sim, cast('greatsword', skills, 'gs_earthsplit'), 0.6);
    expect(hitsOn(ev, a!)).toBe(2);
    expect(hitsOn(ev, b!)).toBe(1);
    expect(ev.filter((e) => e.type === 'echo' && e.echo.kind === 'after')).toHaveLength(1);
  });
});

describe('올려 검기', () => {
  it('올려베기와 함께 앞으로 검기 (150%)', () => {
    const skills = { gs_risingwave: { points: 1 } };
    const sim = room('greatsword', skills);
    spawn(sim, [150, 50]);
    const ev = run(sim, cast('greatsword', skills, 'gs_launch'), 1);
    expect(bolts(ev).map((b) => b.def.id)).toEqual(['gs_wave']);
    expect(hits(ev)).toEqual([15]);
    expect(hits(run(room('greatsword'), cast('greatsword', {}, 'gs_launch'), 1))).toEqual([]);
  });
});

describe('검기 순환', () => {
  it('투사체 스킬이 맞으면 다른 스킬 쿨 −0.5초, 여러 줄이어도 한 번', () => {
    const skills = { gs_cycle: { points: 1 }, gs_wave: { points: 1, variant: 'three' } };
    const sim = room('greatsword', skills);
    spawn(sim, [150, 50], [150, 64], [150, 36]);
    sim.player.cooldowns.gs_launch = 5;
    run(sim, cast('greatsword', skills, 'gs_wave'), 1);
    expect(sim.player.cooldowns.gs_launch).toBeCloseTo(5 - 1 - 0.5, 1);
    expect(sim.player.cooldowns.gs_wave).toBeCloseTo(4 * 1.5 - 1, 1);
  });
});

describe('냉기 강화·구슬 확장 (정의 변경)', () => {
  it('빙결 +0.5초, 구슬 반지름 ×1.5·끝 폭발', () => {
    const staff = weaponDef('staff');
    expect(withPerks(resolveSkill('st_icelance'), perksOf(staff, { st_frost: { points: 1 } })).status?.time).toBeCloseTo(1);
    const orb = withPerks(resolveSkill('st_orb'), perksOf(staff, { st_orbplus: { points: 2 } }));
    expect([orb.area?.radius, orb.repeatEnd?.coef]).toEqual([33, 200]);
  });

  it('구슬 확장: 8번 때린 뒤 그 자리에서 한 번 더 터진다', () => {
    const skills = { st_orbplus: { points: 1 } };
    const sim = room('staff', skills);
    const [m] = spawn(sim, [148, 50]);
    const ev = run(sim, cast('staff', skills, 'st_orb'), 4);
    expect(hitsOn(ev, m!)).toBe(9);
    expect(hits(ev).at(-1)).toBe(15);
  });
});

describe('과열', () => {
  it('스킬이 맞은 뒤 평타 마법탄이 한 발 더', () => {
    const skills = { st_overheat: { points: 1 } };
    const sim = room('staff', skills);
    spawn(sim, [180, 50]);
    run(sim, cast('staff', skills, 'st_icelance'), 1);
    expect(sim.player.overheat).toBeGreaterThan(1.5);
    expect(bolts(run(sim, { ...none, attack: true }, 0.4))).toHaveLength(2);
    const plain = room('staff');
    expect(bolts(run(plain, { ...none, attack: true }, 0.4))).toHaveLength(1);
  });
});

describe('역장', () => {
  it('스킬을 쓰면 나와 3타일 안 동료에게 피해 1회 무효 보호막, 내부 쿨 15초', () => {
    const skills = { st_aegis: { points: 1 } };
    const sim = room('staff', skills);
    const near = sim.addPlayer('p2', { x: 130, y: 50 }), far = sim.addPlayer('p3', { x: 300, y: 50 });
    run(sim, cast('staff', skills, 'st_icelance'), 1);
    expect([sim.player.shield, near.state.shield, far.state.shield]).toEqual([expect.any(Number), expect.any(Number), undefined]);
    expect(sim.player.aegisCd).toBeGreaterThan(13);
    const hp = near.state.hp;
    expect(hurtPlayer(near.state, 50)).toEqual([]);
    expect(near.state.hp).toBe(hp);
    hurtPlayer(near.state, 50);
    expect(near.state.hp).toBe(hp - 50);
  });
});
