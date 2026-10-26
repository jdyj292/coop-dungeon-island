// 합성 결과 → Phaser 텍스처 캐시 (docs/sprites.md 7장 5~6단계)
import type Phaser from 'phaser';
import type { CharacterLook } from './compose';
import { spriteData } from './data';
import { islandObjects, renderIslandFrame } from './island';
import { renderMonsterFrame, renderPropFrame } from './monster';
import { renderCharacter, type CharacterColors, type RenderedSprite } from './render';
import { SLOTS } from './schema';

/** 키 = 머리 모양 + 머리색 + 플레이어 색 + 의상 4칸 + 무기 외형 + 포즈 + 걷기 프레임 + 몸 내림 + 표정 */
export function characterKey(look: CharacterLook, colors: CharacterColors): string {
  const { items } = spriteData().outfits;
  const slots = SLOTS.map((slot) => look.outfit.find((id) => items[id]?.slot === slot) ?? '-');
  return [
    'chr', look.hair, colors.hairColor, colors.playerColor, ...slots,
    look.weapon ?? '-', look.pose ?? '-', look.frame ?? 'stand', look.bob ?? 0, look.face, look.motion ?? '-',
  ].join('|');
}

export function paintCanvas(sprite: RenderedSprite): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = sprite.width;
  canvas.height = sprite.height;
  const ctx = canvas.getContext('2d')!;
  sprite.pixels.forEach((col, k) => {
    if (!col) return;
    ctx.fillStyle = col;
    ctx.fillRect(k % sprite.width, Math.floor(k / sprite.width), 1, 1);
  });
  return canvas;
}

export interface CharacterTexture {
  key: string;
  /** 발밑 기준점 (텍스처 픽셀 좌표) */
  foot: [number, number];
}

const feet = new Map<string, [number, number]>();

/** 몬스터 프레임 텍스처. 슈퍼아머 외곽선은 별도 키 */
export function monsterTexture(scene: Phaser.Scene, id: string, frame: string, superArmor = false, frozen = false): CharacterTexture {
  const key = ['mon', id, frame, frozen ? 'fz' : superArmor ? 'sa' : '-'].join('|');
  if (!scene.textures.exists(key)) {
    const sprite = renderMonsterFrame(spriteData(), id, frame, { superArmor, frozen });
    scene.textures.addCanvas(key, paintCanvas(sprite));
    feet.set(key, sprite.foot);
  }
  return { key, foot: feet.get(key)! };
}

export function propTexture(scene: Phaser.Scene, id: string, frame: string): CharacterTexture {
  const key = ['prop', id, frame].join('|');
  if (!scene.textures.exists(key)) {
    const sprite = renderPropFrame(spriteData(), id, frame);
    scene.textures.addCanvas(key, paintCanvas(sprite));
    feet.set(key, sprite.foot);
  }
  return { key, foot: feet.get(key)! };
}

/** 섬 사물 프레임 (sprites.md 12장). 좌우 반전 모습은 따로 그린 텍스처 */
export function islandTexture(scene: Phaser.Scene, id: string, frame: string, flip = false): CharacterTexture {
  const key = ['isl', id, frame, flip ? 'f' : '-'].join('|');
  if (!scene.textures.exists(key)) {
    const o = islandObjects()[id];
    if (!o) throw new Error(`섬 사물 '${id}' 없음`);
    const sprite = renderIslandFrame(o, frame, flip);
    scene.textures.addCanvas(key, paintCanvas(sprite));
    feet.set(key, sprite.foot);
  }
  return { key, foot: feet.get(key)! };
}

/** 캐시에 없을 때만 만든다. 왼쪽을 볼 때는 같은 텍스처를 flipX로 그린다 */
export function characterTexture(scene: Phaser.Scene, look: CharacterLook, colors: CharacterColors): CharacterTexture {
  const key = characterKey(look, colors);
  if (!scene.textures.exists(key)) {
    const sprite = renderCharacter(spriteData(), look, colors);
    scene.textures.addCanvas(key, paintCanvas(sprite));
    feet.set(key, sprite.foot);
  }
  return { key, foot: feet.get(key)! };
}
