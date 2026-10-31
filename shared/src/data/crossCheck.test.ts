import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyVariant, basicDps, crossCheck, type CrossRefs, type GameData } from './crossCheck';
import { COMBAT, MONSTERS, PASSIVES, ROOMS, SKILLS, WEAPONS } from './load';
import { FILE_SCHEMAS, monsterAttack, playerAction, withoutNotes } from './schema';

const readJson = (p: string) => JSON.parse(readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8'));
const poses = withoutNotes(readJson('client/data/sprites/poses.json')) as Record<string, object>;
delete poses.walk;
const refs: CrossRefs = {
  poseSets: Object.fromEntries(Object.entries(poses).map(([k, v]) => [k, Object.keys(v)])),
  visuals: Object.keys(readJson('client/data/sprites/weapons_visual.json').profiles),
  sprites: Object.keys(withoutNotes(readJson('client/data/sprites/monsters.json'))),
  sounds: ['action', 'clear'].flatMap((bus) => Object.keys(readJson('client/data/sfx.json')[bus])),
};
const rules = { basicDps: {}, tolerance: 0.15 };
const fresh = (): GameData => structuredClone({ weapons: WEAPONS, skills: SKILLS, passives: PASSIVES, monsters: MONSTERS, rooms: ROOMS, combat: COMBAT });
const errors = (d: GameData) => crossCheck(d, refs, rules).filter((i) => i.level === 'error').map((i) => i.where);

describe('현재 데이터', () => {
  it('교차 참조 오류 0건', () => {
    expect(errors(fresh())).toEqual([]);
  });
});

describe('crossCheck 오류', () => {
  it('세트에 없는 포즈', () => {
    const d = fresh();
    d.weapons.greatsword!.basic[0]!.poses.active = 'spin';
    expect(errors(d)).toEqual(['weapons.greatsword.basic.0.poses.active']);
  });
  it('mp ≠ 기준 쿨 × 2', () => {
    const d = fresh();
    d.skills.gs_launch!.mp = 3;
    expect(errors(d)).toEqual(['skills.gs_launch.mp']);
  });
  it('패턴이 없는 공격을 참조', () => {
    const d = fresh();
    d.monsters.boar!.pattern = { type: 'choose', rules: [{ attack: 'boar_bite', range: [0, 10] }] };
    expect(errors(d)).toEqual(['monsters.boar.pattern']);
  });
  it('없는 스프라이트·없는 몬스터·중복 id', () => {
    const d = fresh();
    d.monsters.boar!.sprite = 'pig';
    d.rooms.floor1!.rooms[0]!.waves[0]!.monsters = { slime: 1 };
    d.skills.gs_launch!.id = 'gs_b1';
    expect(errors(d)).toEqual(expect.arrayContaining(['monsters.boar.sprite', 'rooms.floor1.rooms.0.waves.0', 'skills.gs_launch.id']));
  });
  it('sfx.json에 없는 소리', () => {
    const d = fresh();
    d.weapons.greatsword!.basic[0]!.sfx = { active: 'whoosh' };
    expect(errors(d)).toEqual(['weapons.greatsword.basic.0.sfx.active']);
  });
  it('변형 적용 결과도 검사: 판정을 지우기만 하면 오류', () => {
    const d = fresh();
    d.skills.gs_earthsplit!.variants = { bad: { name: '나쁜 변형', desc: '판정 없음', hitbox: null } };
    expect(errors(d)).toEqual(['skills.gs_earthsplit.variants.bad']);
  });
});

describe('경고', () => {
  it('평타 초당 계수가 목표 ±15% 밖이면 경고', () => {
    const dps = basicDps(WEAPONS.greatsword!);
    const warn = (target: number) => crossCheck(fresh(), refs, { basicDps: { greatsword: target }, tolerance: 0.15 })
      .filter((i) => i.level === 'warn' && i.where === 'weapons.greatsword.basic');
    expect(warn(dps)).toHaveLength(0);
    expect(warn(dps / 1.2)).toHaveLength(1);
  });
});

describe('applyVariant', () => {
  it('null은 제거, 객체는 얕게 합침, 특수 필드는 뺌', () => {
    const v = applyVariant(
      { phases: { windup: 0.5, active: 0.1, recovery: 0.3 }, hitbox: {}, coef: 1, variants: {} },
      { name: 'x', phases: { windup: 0.2 }, hitbox: null, reinput: 1 },
    );
    expect(v).toEqual({ name: 'x', phases: { windup: 0.2, active: 0.1, recovery: 0.3 }, coef: 1 });
  });
});

describe('스키마', () => {
  const base = { id: 'a', phases: { windup: 0.1, active: 0.1, recovery: 0.1 }, coef: 100, poses: {} };
  const box = { forward: 0, width: 10, depth: 13, z: 'both' };
  it('판정은 하나만, 플래그는 정해진 값만', () => {
    expect(playerAction.safeParse({ ...base, hitbox: box }).success).toBe(true);
    expect(playerAction.safeParse({ ...base, hitbox: box, area: { shape: 'circle', at: [0, 0], radius: 4, z: 'both' } }).success).toBe(false);
    expect(playerAction.safeParse({ ...base, hitbox: box, flags: ['fly'] }).success).toBe(false);
    expect(playerAction.safeParse({ ...base, hitbox: box, hitbx: box }).success).toBe(false);
  });
  it('damage 0이면 판정 생략 가능', () => {
    const { coef: _c, poses: _p, ...m } = base;
    expect(monsterAttack.safeParse({ ...m, damage: 0 }).success).toBe(true);
    expect(monsterAttack.safeParse({ ...m, damage: 5 }).success).toBe(false);
  });
  it('모든 파일 스키마가 있음', () => {
    expect(Object.keys(FILE_SCHEMAS)).toHaveLength(9);
  });
});
