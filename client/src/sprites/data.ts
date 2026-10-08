// 캐릭터 스프라이트 JSON 로드 + 검사 (docs/sprites.md 8장)
import baseJson from '../../data/sprites/character/base.json';
import outfitsJson from '../../data/sprites/character/outfits.json';
import materialsJson from '../../data/sprites/materials.json';
import posesJson from '../../data/sprites/poses.json';
import weaponsJson from '../../data/sprites/weapons_visual.json';
import {
  baseSchema, materialsSchema, outfitsSchema, posesSchema, weaponsSchema,
  type Base, type Materials, type Outfits, type Part, type Poses, type Weapons,
} from './schema';

export interface SpriteData {
  base: Base;
  outfits: Outfits;
  poses: Poses;
  weapons: Weapons;
  materials: Materials;
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
  base: unknown; outfits: unknown; poses: unknown; weapons: unknown; materials: unknown;
}): SpriteData {
  const materials = materialsSchema.parse(raw.materials);
  const base = baseSchema.parse(raw.base);
  const outfits = outfitsSchema.parse(raw.outfits);
  const posesRaw = withoutNotes(raw.poses as Record<string, unknown>);
  const { walk, ...weaponPoses } = posesRaw;
  const poses = posesSchema.parse({
    walk,
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
  return { base, outfits, poses, weapons, materials };
}

let cached: SpriteData | undefined;

export function spriteData(): SpriteData {
  cached ??= parseSpriteData({
    base: baseJson, outfits: outfitsJson, poses: posesJson, weapons: weaponsJson, materials: materialsJson,
  });
  return cached;
}
