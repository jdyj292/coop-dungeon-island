// HUD 얼굴: 캐릭터 그림에서 얼굴 12×11만 잘라 보인다 (승인 데모 face(): 몸 상자 왼쪽 +1, 위 0). 아래 띠·파티원 프레임 공용
import type Phaser from 'phaser';
import { spriteData } from '../sprites/data';
import { characterTexture } from '../sprites/textures';
import { DEFAULT_HAIR, hairColorPath, hairName, type Hair } from '../view/look';

/** hurt = 피격·쓰러짐 표정, colorIndex = 플레이어 색 번호 (palette global.playerColors), hair = 머리 모양·색 */
export function setFace(scene: Phaser.Scene, img: Phaser.GameObjects.Image, hurt: boolean, colorIndex: number, x: number, y: number, hair: Hair = DEFAULT_HAIR): void {
  const data = spriteData();
  const tex = characterTexture(scene, {
    hair: hairName(hair), face: hurt ? 'hurt' : 'normal', outfit: data.outfits.sets.beginner!,
  }, { hairColor: hairColorPath(hair), playerColor: `global.playerColors.${colorIndex}` });
  const [fx0, fy] = tex.foot, base = data.base;
  const cx = fx0 - base.foot[0] + 1, cy = fy - base.foot[1];
  img.setTexture(tex.key).setCrop(cx, cy, 12, 11).setPosition(x - cx, y - cy);
}
