// 재질 글자 → 색, 캐릭터 합성 + 음영 (docs/sprites.md 7장 1~4단계)
import { color } from '../palette';
import { composeCharacter, type CharacterLook } from './compose';
import type { SpriteData } from './data';
import type { Point } from './schema';
import { ramp, shade, type Ramp, type Shaded } from './shade';

export interface CharacterColors {
  /** palette 경로 (global.hairColors.N) */
  hairColor: string;
  /** palette 경로 (global.playerColors.N) */
  playerColor: string;
}

export interface RenderedSprite extends Shaded {
  /** 발밑 기준점 (픽셀 좌표, 외곽선 1px 포함) */
  foot: Point;
}

/** materials.json의 재질 글자를 색으로 바꾼다. 몬스터는 extra로 덮어쓴다 */
export function resolveMaterials(
  data: SpriteData,
  colors: CharacterColors,
  extra?: { shaded?: Record<string, string>; fixed?: Record<string, string> },
): { shaded: Record<string, Ramp>; fixed: Record<string, string> } {
  const special: Record<string, string> = { $hairColor: colors.hairColor, $playerColor: colors.playerColor };
  const hex = (ref: string) => color(special[ref] ?? ref);
  const shaded: Record<string, Ramp> = {};
  const fixed: Record<string, string> = {};
  for (const [ch, ref] of Object.entries({ ...data.materials.shaded, ...extra?.shaded })) shaded[ch] = ramp(hex(ref));
  for (const [ch, ref] of Object.entries({ ...data.materials.fixed, ...extra?.fixed })) {
    fixed[ch] = hex(ref);
    delete shaded[ch];
  }
  return { shaded, fixed };
}

export function renderCharacter(data: SpriteData, look: CharacterLook, colors: CharacterColors): RenderedSprite {
  const { rows, foot } = composeCharacter(data, look);
  const mats = resolveMaterials(data, colors);
  const shaded = shade({ rows, ...mats, outline: color('global.outline') });
  return { ...shaded, foot: [foot[0] + 1, foot[1] + 1] };
}
