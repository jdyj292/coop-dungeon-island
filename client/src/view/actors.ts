// 캐릭터·몬스터 이미지 배치: 발밑 맞춤, 높이(z), 피격 반응 프레임·회전·번쩍임 (motion.md 4장)
import type Phaser from 'phaser';
import { COMBAT, MONSTERS } from '@game/shared';
import fx from '../../data/fx.json';
import type { LocalMonster } from '../local/combatSim';
import { colorInt } from '../palette';
import type { SpriteData } from '../sprites/data';
import { stateFrames } from '../sprites/monster';
import { monsterTexture, type CharacterTexture } from '../sprites/textures';
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
  /** 90° 단위 회전 (도). 0이면 발밑 기준, 아니면 가운데 기준으로 돌려 바닥에 얹는다 */
  angle?: number;
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
  if (angle % 180 === 0) {
    img.setOrigin((flip ? w - 1 - fx0 : fx0) / w, (fy + 1) / h).setPosition(sx, sy);
  } else {
    // 누운 높이(w)의 절반만큼 올린다. 홀수 폭이면 반 픽셀 → 정수로 내림
    img.setOrigin(0.5, 0.5).setPosition(sx, sy - Math.floor(w / 2) + 1);
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

/** 피격 프레임: hurt / hurtAir가 없으면 첫 공격의 windup 프레임으로 대체 (sprites.md 6장) */
function hurtFrame(data: SpriteData, kind: string, name: 'hurt' | 'hurtAir'): string {
  const sprite = MONSTERS[kind]!;
  if (data.monsters[sprite.sprite]!.frames[name]) return name;
  return stateFrames(data, sprite.sprite, `windup:${sprite.attacks[0]!.id}`)[0]!;
}

/** 몬스터 상태 → 프레임·회전 */
export function monsterPose(data: SpriteData, m: LocalMonster, idleFrame: string): { frame: string; angle: number; hidden?: boolean } {
  const b = m.body, r = fx.reaction;
  const turn = 90 * b.hitDir;
  switch (b.state) {
    case 'air':
      if (m.hurt > 0 && b.bounced) return { frame: hurtFrame(data, m.kind, 'hurt'), angle: 0 };
      return { frame: hurtFrame(data, m.kind, 'hurtAir'), angle: (Math.floor(m.airT / r.airSpinSec) % 4) * turn };
    case 'down':
      return { frame: hurtFrame(data, m.kind, 'hurt'), angle: turn };
    case 'stunned':
      // 기절: 누운 채 깜빡이다 퇴장 (motion.md 4장)
      return { frame: hurtFrame(data, m.kind, 'hurt'), angle: turn, hidden: Math.floor(b.timer / r.stunBlink) % 2 === 1 };
    case 'getup':
      return COMBAT.getupSec - b.timer < r.getupSquashSec
        ? { frame: hurtFrame(data, m.kind, 'hurt'), angle: 0 }
        : { frame: idleFrame, angle: 0 };
    default:
      return { frame: m.hurt > 0 ? hurtFrame(data, m.kind, 'hurt') : idleFrame, angle: 0 };
  }
}

export function placeMonster(scene: Phaser.Scene, v: ActorView, data: SpriteData, m: LocalMonster, idleFrame: string): void {
  const { frame, angle, hidden } = monsterPose(data, m, idleFrame);
  v.img.setVisible(!hidden);
  const sprite = MONSTERS[m.kind]!.sprite;
  place(v, monsterTexture(scene, sprite, frame), {
    x: m.body.x, y: m.body.y, z: m.body.z, facing: m.facing, angle, flash: m.flash > 0,
  });
}
