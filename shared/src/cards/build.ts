// 던전용 카드 빌드 (docs/skills.md 1장 장착·7장 구현 메모): 장착 카드만 담은 빌드, 강화·변형을 적용한 스킬 정의, 저장·전송 문자열.
// 서버가 DB 보유·장착으로 만든 빌드로 판정한다 (클라이언트 신고값 신뢰 금지). 개발 ?skills=도 같은 문자열
import { scaleExtraCoefs, skillDef, type ActionDef, type WeaponDef } from '../actions';
import { applyVariant } from '../data/crossCheck';
import { SKILLS } from '../data/load';
import { perksOf, withPerks } from '../passives';
import { ACTIVE_SLOTS, CARD, CARDS, isActiveCard, starterCards, weaponIdOf } from './catalog';
import type { Collection } from './collection';
import { usableLoadout, type CardLoadout } from './equip';

/** 빌드의 카드 하나: level 1 = 기본, 2 = 강화. variant = 강화 액티브의 변형, slot = 액티브 칸 (0~3 = A S D F) */
export interface SkillNode {
  level: number;
  variant?: string;
  slot?: number;
}
/** 카드 id → 노드 (장착한 카드만) */
export type SkillBuild = Record<string, SkillNode>;

/** 카드 단계: 기본·강화 */
export const MAX_CARD_LEVEL = 2;

export const nodeOf = (b: SkillBuild, id: string): SkillNode => b[id] ?? { level: 1 };

const EXTRAS = ['reinput', 'repeat', 'after', 'onStatusEnd', 'onWall'] as const;
const cache = new Map<string, ActionDef>();

/** 노드를 적용한 스킬: 변형 덮어쓰기 + 특수 필드, 강화면 계수(후속·해제·추가 판정 포함) × enhancedMul. 기본 카드·변형 없음이면 원래 정의 그대로 */
export function resolveSkill(id: string, node: SkillNode = { level: 1 }): ActionDef {
  const key = `${id}:${node.level}:${node.variant ?? ''}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const base = skillDef(id);
  const v = node.variant ? SKILLS[id]?.variants?.[node.variant] : undefined;
  let def: ActionDef = base;
  if (v) {
    def = applyVariant(base as unknown as Record<string, unknown>, v) as unknown as ActionDef;
    // 특수 필드: 기본 스킬에도 있으면(반복 등) 얕게 합친다
    for (const k of EXTRAS) {
      const val = v[k], was = (base as Record<string, unknown>)[k];
      if (val !== undefined) Object.assign(def, { [k]: typeof val === 'object' && was && typeof was === 'object' ? { ...was, ...val } : val });
    }
  }
  const mul = node.level >= MAX_CARD_LEVEL ? CARD.enhancedMul : 1;
  if (mul !== 1) {
    def = { ...def, coef: def.coef * mul };
    if (def.after) def.after = { ...def.after, coef: def.after.coef * mul };
    if (def.onStatusEnd) def.onStatusEnd = { coef: def.onStatusEnd.coef * mul };
    scaleExtraCoefs(def, mul);
  }
  cache.set(key, def);
  return def;
}

/** 저장·전송용 문자열 "id:단계[:변형][@칸],..." */
export function encodeBuild(b: SkillBuild): string {
  return Object.entries(b)
    .map(([id, n]) => `${id}:${n.level}${n.variant ? `:${n.variant}` : ''}${n.slot !== undefined ? `@${n.slot}` : ''}`)
    .join(',');
}

/** encodeBuild의 반대. 모르는 카드, 잘못된 단계·칸은 버린다. 변형은 강화 액티브만, 칸은 액티브만 */
export function decodeBuild(s: string): SkillBuild {
  const out: SkillBuild = {};
  for (const part of s.split(',')) {
    const [body = '', slotText] = part.split('@');
    const [id = '', lv = '', variant] = body.split(':');
    const level = Number(lv), slot = slotText === undefined ? NaN : Number(slotText);
    if (!CARDS[id] || !Number.isInteger(level) || level < 1 || level > MAX_CARD_LEVEL) continue;
    const n: SkillNode = { level };
    if (variant && level === MAX_CARD_LEVEL && SKILLS[id]?.variants?.[variant]) n.variant = variant;
    if (isActiveCard(id) && Number.isInteger(slot) && slot >= 0 && slot < ACTIVE_SLOTS) n.slot = slot;
    out[id] = n;
  }
  return out;
}

const decoded = new Map<string, SkillBuild>();

/** decodeBuild를 기억해 둔다 (그리기·입력에서 매 프레임 부름). 돌려준 객체는 고치지 않는다 */
export function buildFrom(s: string): SkillBuild {
  let b = decoded.get(s);
  if (!b) decoded.set(s, (b = decodeBuild(s)));
  return b;
}

/** 던전용 빌드: 쓸 수 있는 장착 카드만 (usableLoadout), 강화면 단계 2·고른 변형, 액티브는 칸 */
export function dungeonBuild(weapon: string, level: number, c: Collection, lo: CardLoadout): SkillBuild {
  const out: SkillBuild = {}, use = usableLoadout(weapon, level, c, lo);
  const node = (id: string): SkillNode => {
    const o = c[id], variant = o?.enhanced && isActiveCard(id) ? o.variant : undefined;
    return { level: o?.enhanced ? MAX_CARD_LEVEL : 1, ...(variant ? { variant } : {}) };
  };
  use.active.forEach((id, slot) => { if (id) out[id] = { ...node(id), slot }; });
  for (const id of use.passive) out[id] = node(id);
  return out;
}

const pad = (ids: (string | null)[]): (string | null)[] => [...ids, ...Array<null>(ACTIVE_SLOTS).fill(null)].slice(0, ACTIVE_SLOTS);

/** 던전 칸 (A S D F 순서, 빈칸 null): 빌드의 slot. slot이 하나도 없으면(개발 ?skills=) 빌드의 그 무기 액티브를 적은 순서로, 액티브가 없으면 처음 카드 */
export function slotSkills(weapon: WeaponDef, b: SkillBuild): (string | null)[] {
  const wid = weaponIdOf(weapon), mine = Object.keys(b).filter((id) => isActiveCard(id) && CARDS[id]!.weapon === wid);
  const placed = mine.filter((id) => b[id]!.slot !== undefined);
  if (!placed.length) return pad(mine.length ? mine : [...starterCards(wid)]);
  const out: (string | null)[] = Array<string | null>(ACTIVE_SLOTS).fill(null);
  for (const id of placed) out[b[id]!.slot!] ??= id;
  return out;
}

/** 무기 스킬을 칸 순서대로 (강화·변형·패시브·계열 보너스 적용, 빈칸 null) */
export const weaponSkills = (weapon: WeaponDef, b: SkillBuild): (ActionDef | null)[] =>
  slotSkills(weapon, b).map((id) => (id ? withPerks(resolveSkill(id, nodeOf(b, id)), perksOf(weapon, b)) : null));

/** 장착한 스킬이면 강화·변형·패시브를 적용한 정의 (던전에서 쓸 수 있는 것만) */
export function buildSkill(weapon: WeaponDef, b: SkillBuild, id: string): ActionDef | undefined {
  return slotSkills(weapon, b).includes(id) ? withPerks(resolveSkill(id, nodeOf(b, id)), perksOf(weapon, b)) : undefined;
}
