// 스프라이트 JSON 로드 + 검사 (docs/sprites.md 8장)
import baseJson from '../../data/sprites/character/base.json';
import outfitsJson from '../../data/sprites/character/outfits.json';
import materialsJson from '../../data/sprites/materials.json';
import draftMonstersJson from '../../data/sprites/drafts/monsters.json';
import draftPosesJson from '../../data/sprites/drafts/poses.json';
import draftPropsJson from '../../data/sprites/drafts/props.json';
import monstersJson from '../../data/sprites/monsters.json';
import posesJson from '../../data/sprites/poses.json';
import propsJson from '../../data/sprites/props.json';
import weaponsJson from '../../data/sprites/weapons_visual.json';
import {
  baseSchema, materialsSchema, monstersSchema, outfitsSchema, posesSchema, weaponsSchema,
  type Base, type Materials, type Monster, type Outfits, type Part, type Poses, type Weapons,
} from './schema';

export interface SpriteData {
  base: Base;
  outfits: Outfits;
  poses: Poses;
  weapons: Weapons;
  materials: Materials;
  monsters: Record<string, Monster>;
  /** 환경 소품 (장애물·문·귀환 고리·상자, sprites.md 11장). 형식은 몬스터와 같음 */
  props: Record<string, Monster>;
}

/** "_"로 시작하는 설명 키를 뺀 객체 */
function withoutNotes(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([k]) => !k.startsWith('_')));
}

/** 마스크 검사: 행 길이 일치, 정의된 글자만 */
function checkMask(rows: string[], allowed: Set<string>, where: string): void {
  const width = rows[0]!.length;
  rows.forEach((row, j) => {
    if (row.length !== width) throw new Error(`${where}: ${j}행 길이 ${row.length} ≠ ${width}`);
    for (const ch of row) if (!allowed.has(ch)) throw new Error(`${where}: 정의되지 않은 글자 '${ch}'`);
  });
}

function checkPart(part: Part, allowed: Set<string>, where: string): void {
  if (part.rows) checkMask(part.rows, allowed, where);
  for (const [frame, rows] of Object.entries(part.frames ?? {})) checkMask(rows, allowed, `${where}.${frame}`);
}

export function parseSpriteData(raw: {
  base: unknown; outfits: unknown; poses: unknown; weapons: unknown; materials: unknown; monsters: unknown; props?: unknown;
}): SpriteData {
  const materials = materialsSchema.parse(raw.materials);
  const base = baseSchema.parse(raw.base);
  const outfits = outfitsSchema.parse(raw.outfits);
  const posesRaw = withoutNotes(raw.poses as Record<string, unknown>);
  const { walk, motions, ...weaponPoses } = posesRaw;
  const poses = posesSchema.parse({
    walk,
    motions: motions && withoutNotes(motions as Record<string, unknown>),
    weapons: Object.fromEntries(
      Object.entries(weaponPoses).map(([k, v]) => [k, withoutNotes(v as Record<string, unknown>)]),
    ),
  });
  const weapons = weaponsSchema.parse(raw.weapons);

  const allowed = new Set(['.', '_', ...Object.keys(materials.shaded), ...Object.keys(materials.fixed)]);
  base.parts.forEach((p, i) => checkPart(p, allowed, `base.parts.${i}`));
  for (const [name, face] of Object.entries(base.faces)) checkMask(face.rows, allowed, `base.faces.${name}`);
  for (const [name, parts] of Object.entries(base.hairStyles))
    parts.forEach((p, i) => checkPart(p, allowed, `base.hairStyles.${name}.${i}`));
  for (const [id, item] of Object.entries(outfits.items)) {
    item.parts.forEach((p, i) => checkPart(p, allowed, `outfits.${id}.${i}`));
    if (item.sleeve && !allowed.has(item.sleeve)) throw new Error(`outfits.${id}: 소매 재질 '${item.sleeve}' 없음`);
  }
  for (const [set, ids] of Object.entries(outfits.sets))
    for (const id of ids) if (!outfits.items[id]) throw new Error(`outfits.sets.${set}: 없는 아이템 ${id}`);
  for (const [id, profile] of Object.entries(weapons.profiles)) {
    for (const part of profile.parts ?? [])
      if (!allowed.has(part.mat)) throw new Error(`weapons.${id}: 재질 '${part.mat}' 없음`);
    if (profile.gauntlet && !allowed.has(profile.gauntlet.mat)) throw new Error(`weapons.${id}: 건틀릿 재질 없음`);
  }
  const monsters = monstersSchema.parse(withoutNotes(raw.monsters as Record<string, unknown>));
  for (const [id, monster] of Object.entries(monsters)) checkMonster(id, monster, materials);
  const props = monstersSchema.parse(withoutNotes((raw.props ?? {}) as Record<string, unknown>));
  for (const [id, prop] of Object.entries(props)) checkMonster(id, prop, materials, 'props');
  return { base, outfits, poses, weapons, materials, monsters, props };
}

/** 몬스터: 정의된 글자(공용 + 몬스터 재질), 발밑이 격자 안, states가 있는 프레임을 가리킴 */
function checkMonster(id: string, monster: Monster, materials: Materials, file = 'monsters'): void {
  const allowed = new Set([
    '.', ...Object.keys(materials.shaded), ...Object.keys(materials.fixed),
    ...Object.keys(monster.materials), ...Object.keys(monster.fixedExtra ?? {}),
  ]);
  for (const [name, frame] of Object.entries(monster.frames)) {
    checkMask(frame.rows, allowed, `${file}.${id}.${name}`);
    const [fx, fy] = frame.foot;
    if (fx < 0 || fy < 0 || fx >= frame.rows[0]!.length || fy >= frame.rows.length)
      throw new Error(`${file}.${id}.${name}: 발밑 (${fx},${fy})가 격자 밖`);
  }
  for (const [state, ref] of Object.entries(monster.states))
    for (const name of [ref].flat())
      if (!monster.frames[name]) throw new Error(`${file}.${id}.states.${state}: 없는 프레임 ${name}`);
}

let cached: SpriteData | undefined;
let useDrafts = false;

/** 초안(drafts/) 겹쳐 보기 켜기·끄기 (sprite-preview "초안 보기", 게임 ?drafts=1). 바꾸면 다시 읽는다 */
export function setUseDrafts(on: boolean): void {
  if (on !== useDrafts) cached = undefined;
  useDrafts = on;
}

export const draftsOn = () => useDrafts;

type MonsterDraft = { frames?: Record<string, unknown>; states?: Record<string, unknown> };

/** 초안 몬스터 프레임·상태를 승인 데이터 위에 겹친다 (승인 파일은 그대로) */
export function withMonsterDrafts(base: Record<string, unknown>, drafts: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [id, d] of Object.entries(withoutNotes(drafts)) as [string, MonsterDraft][]) {
    const m = base[id] as { frames: Record<string, unknown>; states: Record<string, unknown> } | undefined;
    if (!m) continue;
    out[id] = { ...m, frames: { ...m.frames, ...d.frames }, states: { ...m.states, ...d.states } };
  }
  return out;
}

/** 초안 포즈를 승인 포즈 위에 겹친다 (무기 종류 → 포즈 이름) */
export function withPoseDrafts(base: Record<string, unknown>, drafts: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [type, poses] of Object.entries(withoutNotes(drafts))) {
    out[type] = { ...(base[type] as Record<string, unknown> | undefined), ...(poses as Record<string, unknown>) };
  }
  return out;
}

/** 초안 소품: 새 소품은 통째로, 있는 소품은 프레임·상태만 겹친다 */
export function withPropDrafts(base: Record<string, unknown>, drafts: Record<string, unknown>): Record<string, unknown> {
  const out = withMonsterDrafts(base, drafts);
  for (const [id, d] of Object.entries(withoutNotes(drafts))) if (!(id in base)) out[id] = d;
  return out;
}

/** 초안 소품 이름 (sprite-preview 표시용) */
export const draftPropNames = (): string[] => Object.keys(withoutNotes(draftPropsJson as Record<string, unknown>));

/** 초안 포즈 이름 (sprite-preview 표시용) */
export const draftPoseNames = (type: string): string[] =>
  Object.keys((draftPosesJson as unknown as Record<string, Record<string, unknown>>)[type] ?? {});

/** 초안 프레임 이름 (sprite-preview 표시용) */
export function draftFrameNames(id: string): string[] {
  const d = (draftMonstersJson as Record<string, MonsterDraft>)[id];
  return Object.keys(d?.frames ?? {});
}

export function spriteData(): SpriteData {
  cached ??= parseSpriteData({
    base: baseJson, outfits: outfitsJson, weapons: weaponsJson, materials: materialsJson,
    poses: useDrafts ? withPoseDrafts(posesJson, draftPosesJson) : posesJson,
    monsters: useDrafts ? withMonsterDrafts(monstersJson, draftMonstersJson) : monstersJson,
    props: useDrafts ? withPropDrafts(propsJson, draftPropsJson) : propsJson,
  });
  return cached;
}
