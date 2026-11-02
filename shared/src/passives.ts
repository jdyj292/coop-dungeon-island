// 패시브 효과 (docs/skills.md 1~3장, 데이터 shared/data/passives.json): 장착한 패시브 카드의 effect([기본, 강화] 값)와 계열 보너스(cards/bonus.ts)를 모은 perks,
// 스킬 정의에 붙는 효과(슈퍼아머·투사체 사거리·지속·계열 보너스의 쿨·범위·MP·감속)는 withPerks로 정의를 바꾸고,
// 나머지(충전 속도·충전 중·스킬 중 받는 피해·먼 적 피해·연소·중압·회피)는 PlayerState.perks를 판정에서 본다 (sim/strike.ts, playerHurt.ts, player.ts·charge.ts)
import type { ActionDef, WeaponDef } from './actions';
import { branchBonuses } from './cards/bonus';
import { PASSIVES, WEAPONS } from './data/load';
import type { PassiveEffect } from './data/schema';

/** [기본, 강화] 값 배열을 그 단계의 값 하나로 */
type AtPoint<T> = T extends readonly (infer U)[] ? U : T extends object ? { [K in keyof T]: AtPoint<T[K]> } : T;

/** 패시브 효과 (카드 단계에 맞는 값) */
export type Perks = AtPoint<PassiveEffect>;

/** 패시브 카드·계열 보너스가 없을 때 (같은 객체를 돌려 정의 캐시를 그대로 쓴다) */
export const NO_PERKS: Perks = Object.freeze({});

export const isPassive = (id: string): boolean => !!PASSIVES[id];

const weaponId = (w: WeaponDef): string | undefined => Object.keys(WEAPONS).find((k) => WEAPONS[k] === w);

/** 무기의 패시브 (passives.json 순서) */
export const weaponPassives = (weapon: WeaponDef): string[] => {
  const wid = weaponId(weapon);
  return Object.values(PASSIVES).filter((p) => p.weapon === wid).map((p) => p.id);
};

const perkCache = new WeakMap<WeaponDef, WeakMap<object, Perks>>();

/** 효과 값에서 [기본, 강화] 배열은 그 단계 값으로 (안쪽 객체까지) */
function atLevel(v: unknown, level: number): unknown {
  if (Array.isArray(v)) return v[Math.min(level, v.length) - 1];
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, atLevel(x, level)]));
  return v;
}

/** 효과 하나를 합친다: 배율(…Mul)은 곱하고, 더하기(…Add)는 더하고, 나머지는 덮어쓴다 */
function merge(out: Record<string, unknown>, k: string, v: unknown): void {
  const was = out[k];
  if (typeof was === 'number' && typeof v === 'number' && (k.endsWith('Mul') || k.endsWith('Add'))) out[k] = k.endsWith('Mul') ? was * v : was + v;
  else out[k] = v;
}

/** 빌드에 든 이 무기 패시브 카드 효과(단계에 맞는 값) + 계열 보너스. 던전에는 장착 카드만 담은 빌드가 온다 (cards/build.ts dungeonBuild) */
export function perksOf(weapon: WeaponDef, build: Record<string, { level: number } | undefined>): Perks {
  let byBuild = perkCache.get(weapon);
  if (!byBuild) perkCache.set(weapon, (byBuild = new WeakMap()));
  const hit = byBuild.get(build);
  if (hit) return hit;
  const out: Record<string, unknown> = {};
  for (const id of weaponPassives(weapon)) {
    const level = build[id]?.level ?? 0;
    if (!level) continue;
    for (const [k, raw] of Object.entries(PASSIVES[id]!.effect)) merge(out, k, atLevel(raw, level));
  }
  for (const b of branchBonuses(weaponId(weapon) ?? '', Object.keys(build))) for (const [k, v] of Object.entries(b.effect)) merge(out, k, v);
  const perks = Object.keys(out).length ? (out as Perks) : NO_PERKS;
  byBuild.set(build, perks);
  return perks;
}

const defCache = new WeakMap<ActionDef, Map<string, ActionDef>>();

/** 스킬 정의에 패시브 효과: 모든 스킬 슈퍼아머, 투사체 사거리, 장판·지속 스킬(lasting)의 상태 이상 시간·반복 횟수, 빙결 시간(냉기 강화), 구슬 확장,
 * 계열 보너스(투사체 스킬 쿨, 판정 범위 크기, MP, 감속 시간·감속량) */
export function withPerks(def: ActionDef, perks: Perks): ActionDef {
  const { skillArmor, projectileRangeMul: rm, lastingMul: lm, freezeAdd: fa, repeatEnd: re } = perks;
  const freeze = def.status?.type === 'freeze' ? (fa ?? '') : '', end = re?.skill === def.id ? `${re.radiusMul}/${re.coef}` : '';
  const pc = def.projectile && def.cooldown ? (perks.projectileCooldownMul ?? '') : '', am = def.area ? (perks.areaMul ?? '') : '';
  const mm = def.mp ? (perks.mpMul ?? '') : '', slow = def.status?.type === 'slow' ? `${perks.slowTimeMul ?? ''}/${perks.slowAdd ?? ''}` : '';
  const key = `${skillArmor ? 1 : ''}:${def.projectile ? (rm ?? '') : ''}:${def.lasting ? (lm ?? '') : ''}:${freeze}:${end}:${pc}:${am}:${mm}:${slow === '/' ? '' : slow}`;
  if (key === '::::::::') return def;
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
    if (def.allyBuff) out.allyBuff = { ...def.allyBuff, time: def.allyBuff.time * lm };
  }
  // 냉기 강화: 빙결 시간 더하기 (지속 배율 뒤)
  if (freeze !== '' && out.status) out.status = { ...out.status, time: out.status.time + (fa as number) };
  // 구슬 확장: 그 스킬의 판정 반지름 키우기, 반복이 끝날 때 한 번 더 (sim/echoes.ts)
  if (end && re) {
    if (out.area?.radius) out.area = { ...out.area, radius: out.area.radius * re.radiusMul };
    out.repeatEnd = { coef: re.coef };
  }
  // 계열 보너스
  if (pc !== '' && out.cooldown) out.cooldown = out.cooldown * (pc as number);
  if (am !== '' && out.area) out.area = scaleArea(out.area, am as number);
  if (mm !== '' && out.mp) out.mp = Math.round(out.mp * (mm as number));
  if (slow && slow !== '/' && out.status) out.status = { ...out.status, time: out.status.time * (perks.slowTimeMul ?? 1), amount: (out.status.amount ?? 0) + (perks.slowAdd ?? 0) };
  byKey.set(key, out);
  return out;
}

/** 판정 범위 크기 배율 (radius·width·depth) */
function scaleArea<T extends { radius?: number; width?: number; depth?: number }>(a: T, mul: number): T {
  const out = { ...a };
  if (out.radius !== undefined) out.radius *= mul;
  if (out.width !== undefined) out.width *= mul;
  if (out.depth !== undefined) out.depth *= mul;
  return out;
}
