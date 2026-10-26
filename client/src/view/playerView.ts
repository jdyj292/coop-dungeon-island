// 플레이어 그리기: 상태 → 이동·상태 모션 (art.md 4장, motion.md 6장, 데이터 poses.json motions, 시간 fx.json playerMotion)
// 우선순위: 쓰러짐 > 다운 > 피격 > 기상 > 백스텝 > (공격 중이면 공격 포즈) > 방향 전환 > 달리기 > 걷기 > 대기 숨쉬기
import type Phaser from 'phaser';
import { fighterPose, PLAYER, type PlayerState } from '@game/shared';
import fx from '../../data/fx.json';
import { dot } from '../fx/layer';
import { colorInt } from '../palette';
import { walkStep, type CharacterLook } from '../sprites/compose';
import { spriteData } from '../sprites/data';
import { characterTexture } from '../sprites/textures';
import { newActorView, place, type ActorView } from './actors';
import { DEFAULT_HAIR, hairColorPath, hairName, type Hair } from './look';
import { project } from './layout';

export class PlayerView {
  readonly actor: ActorView;
  /** 번쩍임 남은 시간 (게임 시간) */
  flash = 0;
  /** 머리 모양·색 (섬 주민 상태, 던전 look) */
  hair: Hair = DEFAULT_HAIR;
  /** 무기 외형 (weapons.json visual → weapons_visual.json 프로필) */
  weaponVisual = 'greatsword_basic';
  /** 순간이동 백스텝 (스태프 backstepStyle teleport): 뛰지 않고 가운데 구간은 안 보임 (combat.md 1장, 성능은 같음) */
  teleport = false;
  private stars: Phaser.GameObjects.Graphics;
  private beat = 0;
  private moving = false;
  private facing = 1;
  private turnLeft = 0;
  private getupLeft = 0;

  /** colorIndex = 플레이어 색 번호 (palette global.playerColors, 여럿일 때 구분), armed = 무기를 든 모습 (섬에서는 빈손) */
  constructor(private scene: Phaser.Scene, depth: number, private colorIndex = 0, private armed = true) {
    this.actor = newActorView(scene);
    this.stars = scene.add.graphics().setDepth(depth);
  }

  destroy(): void {
    this.actor.img.destroy();
    this.actor.shadow.destroy();
    this.stars.destroy();
  }

  /** 기상 순간 (playerHurt 'getup') */
  onGetup(): void {
    this.getupLeft = fx.playerMotion.getupSec;
  }

  /** 틱마다. 방향을 바꿨으면 true (발밑 먼지용) */
  update(p: PlayerState, dt: number): boolean {
    this.flash = Math.max(0, this.flash - dt);
    this.turnLeft = Math.max(0, this.turnLeft - dt);
    this.getupLeft = Math.max(0, this.getupLeft - dt);
    const turned = p.facing !== this.facing && !p.fighter.run && !p.hurt && !p.backstep;
    this.facing = p.facing;
    if (turned) this.turnLeft = fx.playerMotion.turnSec;
    return turned;
  }

  /** 지금 모션 이름 (없으면 걷기·서기) */
  private motion(p: PlayerState, clock: number): string | undefined {
    const m = fx.playerMotion;
    if (p.downed) return 'knocked';
    if (p.hurt?.kind === 'down') return 'down';
    if (p.hurt) return 'hurt';
    if (this.getupLeft > 0) return 'getup';
    if (p.backstep) return p.backstep.t / PLAYER.backstep.sec < m.backstepLand ? 'backstepAir' : 'backstepLand';
    if (p.fighter.run) return undefined;
    if (this.turnLeft > 0) return 'turn';
    if (this.moving && p.run.running) return m.runCycle[Math.floor(this.beat) % m.runCycle.length];
    if (this.moving) return undefined;
    return Math.floor(clock / m.breatheSec) % 2 ? 'breathe' : undefined;
  }

  /** moved = 이번 프레임에 걸은 거리 (틱이 안 돌았으면 null: 박자 유지), offsetX = 공격 리듬 보정 */
  draw(p: PlayerState, moved: number | null, offsetX: number, clock: number): void {
    const data = spriteData();
    // 걷기·달리기 박자는 이동 거리로 넘긴다 (발이 미끄러져 보이지 않게)
    if (moved !== null) {
      this.moving = moved > 0;
      this.beat = this.moving ? this.beat + moved / data.poses.walk.pxPerBeat : 0;
    }
    const motion = this.motion(p, clock);
    const known = !!motion && !!data.poses.motions[motion];
    const step = this.moving && !p.fighter.run && !motion ? walkStep(data, Math.floor(this.beat)) : { frame: 'stand', bob: 0 };
    // 모션 그림이 아직 없으면(승인 전) 예전 표현: 피격 표정, 다운은 무기 없이 90° 눕힘
    const lying = !known && (p.hurt?.kind === 'down' || p.downed);
    const look: CharacterLook = {
      hair: hairName(this.hair), face: !known && (p.hurt || p.downed) ? 'hurt' : 'normal', outfit: data.outfits.sets.beginner!,
      weapon: lying || !this.armed ? undefined : this.weaponVisual, pose: lying || !this.armed ? undefined : fighterPose(p.fighter) ?? 'idle',
      frame: step.frame, bob: step.bob, motion: known ? motion : undefined,
    };
    const tex = characterTexture(this.scene, look, { hairColor: hairColorPath(this.hair), playerColor: `global.playerColors.${this.colorIndex}` });
    // 백스텝: 뛰어 물러나는 높이는 위치 오프셋으로만 (판정은 지상, motion.md 6장)
    const bk = p.backstep ? p.backstep.t / PLAYER.backstep.sec : 0, tp = fx.spell.teleport;
    const hop = p.backstep && !this.teleport ? Math.round(Math.sin(bk * Math.PI) * fx.backstepHop) : 0;
    const vanished = !!p.backstep && this.teleport && bk > tp.visibleStart && bk < tp.visibleEnd;
    place(this.actor, tex, {
      x: p.pos.x + offsetX * p.facing, y: p.pos.y, z: hop, facing: p.facing, flash: this.flash > 0,
      angle: lying ? -90 * p.facing : 0,
    });
    // 기상·부활 무적: 깜빡임 (motion.md 4장)
    this.actor.img.setVisible(!vanished && !(p.invuln > 0 && Math.floor(clock / fx.reaction.stunBlink) % 2 === 1));
    this.drawStars(p, clock);
  }

  /** 쓰러짐: 머리 위를 도는 별 (art.md 4장) */
  private drawStars(p: PlayerState, clock: number): void {
    const g = this.stars, m = fx.playerMotion;
    g.clear();
    if (!p.downed) return;
    const { sx, sy } = project(p.pos.x, p.pos.y);
    for (let i = 0; i < 3; i++) {
      const a = clock * m.starSpeed + (i * Math.PI * 2) / 3;
      dot(g, sx + Math.cos(a) * m.starRadius[0]!, sy - m.starAbove + Math.sin(a) * m.starRadius[1]!, colorInt('global.allyFx.gold'));
    }
  }
}
