// 몬스터 프레임 → 음영 (docs/sprites.md 6장). 레이어 합성 없이 프레임 격자를 그대로 음영 처리
import { color } from '../palette';
import type { SpriteData } from './data';
import { resolveMaterials, type RenderedSprite } from './render';
import { shade } from './shade';

/** 이보다 넓으면 큰 스프라이트로 보고 그림자 경계를 디더링 (art.md 5장, 승인 데모 기준) */
const DITHER_WIDTH = 30;

export interface MonsterFrameOptions {
  /** 슈퍼아머 외곽선 (프레임에 superArmorOutline이 있을 때 깜빡임의 '켜짐' 쪽) */
  superArmor?: boolean;
}

export function renderMonsterFrame(
  data: SpriteData,
  id: string,
  frameName: string,
  options: MonsterFrameOptions = {},
): RenderedSprite {
  const monster = data.monsters[id];
  if (!monster) throw new Error(`몬스터 '${id}' 없음`);
  const frame = monster.frames[frameName];
  if (!frame) throw new Error(`몬스터 프레임 '${id}.${frameName}' 없음`);
  const mats = resolveMaterials(data, undefined, { shaded: monster.materials, fixed: monster.fixedExtra });
  const width = frame.rows[0]!.length;
  const shaded = shade({
    rows: frame.rows,
    ...mats,
    outline: color('global.outline'),
    outlineOverride: options.superArmor && frame.superArmorOutline ? color('global.semantic.superArmor') : undefined,
    dither: width > DITHER_WIDTH,
    ditherRow: frame.foot[1],
  });
  return { ...shaded, foot: [frame.foot[0] + 1, frame.foot[1] + 1] };
}

/** 상태 → 프레임 이름 목록 (배열이면 순환) */
export function stateFrames(data: SpriteData, id: string, state: string): string[] {
  const ref = data.monsters[id]?.states[state];
  if (!ref) throw new Error(`몬스터 상태 '${id}.${state}' 없음`);
  return [ref].flat();
}
