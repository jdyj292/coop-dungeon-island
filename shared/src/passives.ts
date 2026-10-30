// 계열 보조 노드 효과 (docs/skills.md 1~3장, 데이터 shared/data/passives.json): 배운 보조 노드의 effect를 모은 perks,
// 스킬 정의에 붙는 효과(슈퍼아머·투사체 사거리·지속)는 withPerks로 정의를 바꾸고,
// 나머지(충전 속도·충전 중 받는 피해·공중 피해·연소·무중력·회피)는 PlayerState.perks를 판정에서 본다 (sim/strike.ts, playerHurt.ts, player.ts·charge.ts)
import type { ActionDef, WeaponDef } from './actions';
import { PASSIVES, WEAPONS } from './data/load';
import type { PassiveEffect } from './data/schema';

export type Perks = PassiveEffect;

/** 배운 보조 노드가 없을 때 (같은 객체를 돌려 정의 캐시를 그대로 쓴다) */
export const NO_PERKS: Perks = Object.freeze({});

export const isPassive = (id: string): boolean => !!PASSIVES[id];

const weaponId = (w: WeaponDef): string | undefined => Object.keys(WEAPONS).find((k) => WEAPONS[k] === w);

/** 무기의 보조 노드 (passives.json 순서) */
export const weaponPassives = (weapon: WeaponDef): string[] => {
  const wid = weaponId(weapon);
  return Object.values(PASSIVES).filter((p) => p.weapon === wid).map((p) => p.id);
};

const perkCache = new WeakMap<WeaponDef, WeakMap<object, Perks>>();

/** 빌드에서 이 무기의 배운 보조 노드 효과를 합친다. 배율(…Mul)은 곱하고 나머지는 덮어쓴다 */
export function perksOf(weapon: WeaponDef, build: Record<string, { points: number } | undefined>): Perks {
  let byBuild = perkCache.get(weapon);
  if (!byBuild) perkCache.set(weapon, (byBuild = new WeakMap()));
  const hit = byBuild.get(build);
  if (hit) return hit;
  const out: Record<string, unknown> = {};
  for (const id of weaponPassives(weapon)) {
    if (!build[id]?.points) continue;
    for (const [k, v] of Object.entries(PASSIVES[id]!.effect)) {
      out[k] = k.endsWith('Mul') && typeof out[k] === 'number' ? (out[k] as number) * (v as number) : v;
    }
  }
  const perks = Object.keys(out).length ? (out as Perks) : NO_PERKS;
  byBuild.set(build, perks);
  return perks;
}

const defCache = new WeakMap<ActionDef, Map<string, ActionDef>>();

/** 스킬 정의에 보조 노드 효과: 모든 스킬 슈퍼아머, 투사체 사거리, 장판·지속 스킬(lasting)의 상태 이상 시간·반복 횟수 */
export function withPerks(def: ActionDef, perks: Perks): ActionDef {
  const { skillArmor, projectileRangeMul: rm, lastingMul: lm } = perks;
  const key = `${skillArmor ? 1 : ''}:${def.projectile ? (rm ?? '') : ''}:${def.lasting ? (lm ?? '') : ''}`;
  if (key === '::') return def;
  let byKey = defCache.get(def);
  if (!byKey) defCache.set(def, (byKey = new Map()));
  const hit = byKey.get(key);
  if (hit) return hit;
  const out: ActionDef = { ...def };
  if (skillArmor) out.superArmor = true;
  if (rm && def.projectile) out.projectile = { ...def.projectile, range: def.projectile.range * rm };
  if (lm && def.lasting) {
    if (def.repeat) out.repeat = { ...def.repeat, count: Math.round(def.repeat.count * lm) };
    if (def.status?.time) out.status = { ...def.status, time: def.status.time * lm };
  }
  byKey.set(key, out);
  return out;
}
