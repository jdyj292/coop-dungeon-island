// 캐릭터·몬스터 이미지 배치: 발밑 맞춤, 높이(z), 90° 회전, 번쩍임, 그림자. 몬스터 프레임 고르기는 monsterView.ts
import type Phaser from 'phaser';
import fx from '../../data/fx.json';
import { colorInt } from '../palette';
import type { CharacterTexture } from '../sprites/textures';
import { project } from './layout';
import { shadowRadius, shadowTexture } from './shadow';

export interface ActorView {
  img: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
}

export const newActorView = (scene: Phaser.Scene): ActorView => ({
  img: scene.add.image(0, 0, '__DEFAULT'),
  shadow: scene.add.image(0, 0, '__DEFAULT').setDepth(-500),
});

export interface Placement {
  x: number;
  /** 깊이 */
  y: number;
  z?: number;
  facing: number;
  /** 90° 단위 회전 (도) */
  angle?: number;
  /** 회전 중 (구르기·공중 회전): 0°도 가운데 기준으로 놓아 각도가 바뀌어도 높이가 튀지 않게 */
  spin?: boolean;
  flash?: boolean;
}

/** 발밑 픽셀이 위치에 오도록 원점을 맞춘다. flipX는 프레임 안에서 좌우 반전되므로 반전된 발밑 열을 기준으로 */
export function place(v: ActorView, tex: CharacterTexture, p: Placement): void {
  const { img, shadow } = v;
  img.setTexture(tex.key);
  const flip = p.facing < 0;
  const w = img.width, h = img.height, [fx0, fy] = tex.foot;
  const angle = p.angle ?? 0;
  img.setFlipX(flip).setAngle(angle);
  const ground = project(p.x, p.y);
  const { sx, sy } = project(p.x, p.y, p.z ?? 0);
  if (angle === 0 && !p.spin) {
    img.setOrigin((flip ? w - 1 - fx0 : fx0) / w, (fy + 1) / h).setPosition(sx, sy);
  } else {
    // 가운데 기준으로 돌리고, 돌린 뒤 아래 끝(외곽선 줄)이 발밑 줄에 오도록 높이(누우면 w)의 절반만큼 올린다.
    // 180°를 발밑 기준으로 돌리면 그림이 바닥 아래로 뒤집혀 내려간다
    const tall = angle % 180 === 0 ? h : w;
    img.setOrigin(0.5, 0.5).setPosition(sx, sy - Math.floor(tall / 2) + 1);
  }
  img.setDepth(p.y);
  if (p.flash) img.setTintFill(colorInt('global.fx.flash'));
  else img.clearTint();
  // 그림자는 바닥에 고정, 높이 오를수록 작게. 가운데 열과 셋째 줄(발밑 줄)이 발밑 픽셀과 겹치게
  const r = fx.reaction;
  const scale = Math.max(r.airShadowMin, 1 - (p.z ?? 0) / r.airShadowZ);
  const rx = Math.max(2, Math.round(shadowRadius(w) * scale));
  shadow.setTexture(shadowTexture(img.scene, rx));
  shadow.setOrigin(rx / (rx * 2 + 1), 3 / 4).setPosition(ground.sx, ground.sy);
}
