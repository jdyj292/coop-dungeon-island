// 발밑 그림자 (승인 데모의 타원 모양, 색은 palette global.blobShadow)
import type Phaser from 'phaser';
import { color, paletteNumber } from '../palette';

/** 그림자 텍스처 키. 원점은 발밑 줄(위에서 셋째 줄)의 가운데 */
export function shadowTexture(scene: Phaser.Scene, rx: number): string {
  const key = `shadow|${rx}`;
  if (scene.textures.exists(key)) return key;
  const canvas = document.createElement('canvas');
  canvas.width = rx * 2 + 1;
  canvas.height = 4;
  const g = canvas.getContext('2d')!;
  g.globalAlpha = paletteNumber('global.blobShadow.opacity');
  g.fillStyle = color('global.blobShadow.color');
  for (let dy = -2; dy <= 1; dy++) {
    const hw = Math.round(rx * Math.sqrt(1 - (dy / 2.3) ** 2));
    g.fillRect(rx - hw, dy + 2, hw * 2 + 1, 1);
  }
  scene.textures.addCanvas(key, canvas);
  return key;
}

/** 스프라이트 폭에 맞는 그림자 반지름 */
export const shadowRadius = (spriteWidth: number) => Math.max(5, Math.floor((spriteWidth - 2) * 0.36));
