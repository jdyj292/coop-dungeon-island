// 몬스터 그리기: 상태 → 프레임 (피격 반응, 어지러움·그로기, 공격 구간, 이동, 대기), 프레임 떨림·오프셋·회전, 슈퍼아머 외곽선
// (docs/motion.md 4·8장, docs/sprites.md 6장)
import type Phaser from 'phaser';
import { attackPhase, COMBAT, type Monster } from '@game/shared';
import fx from '../../data/fx.json';
import type { SpriteData } from '../sprites/data';
import { stateFrames } from '../sprites/monster';
import { monsterTexture } from '../sprites/textures';
import { newActorView, place, type ActorView } from './actors';

/** 그리기용 타이머 (게임 시간) */
export class MonsterView {
  readonly view: ActorView;
  flash = 0;
  hurt = 0;
  airT = 0;
  private wasAir = false;

  constructor(scene: Phaser.Scene) {
    this.view = newActorView(scene);
  }

  /** 틱마다 (히트스톱 중에는 dt = 0) */
  update(m: Monster, dt: number): void {
    this.flash = Math.max(0, this.flash - dt);
    this.hurt = Math.max(0, this.hurt - dt);
    const air = m.body.state === 'air';
    this.airT = air ? (this.wasAir ? this.airT + dt : 0) : 0;
    this.wasAir = air;
  }

  destroy(): void {
    this.view.img.destroy();
    this.view.shadow.destroy();
  }
}

/** 피격 프레임: hurt / hurtAir가 없으면 첫 공격의 windup 프레임으로 대체 (sprites.md 6장) */
function hurtFrame(data: SpriteData, m: Monster, name: 'hurt' | 'hurtAir'): string {
  if (data.monsters[m.def.sprite]!.frames[name]) return name;
  return stateFrames(data, m.def.sprite, `windup:${m.def.attacks[0]!.id}`)[0]!;
}

/** 상태가 있으면 그 프레임 (배열이면 i번째로 순환), 없으면 null */
function stateFrame(data: SpriteData, m: Monster, state: string, i = 0): string | null {
  const ref = data.monsters[m.def.sprite]!.states[state];
  if (!ref) return null;
  const list = [ref].flat();
  return list[((i % list.length) + list.length) % list.length]!;
}

export interface MonsterPose {
  frame: string;
  angle: number;
  hidden?: boolean;
  /** 공중 회전 중 */
  spin?: boolean;
}

export function monsterPose(data: SpriteData, m: Monster, v: MonsterView, clock: number, index: number): MonsterPose {
  const b = m.body, r = fx.reaction, turn = 90 * b.hitDir;
  const idleSec = data.monsters[m.def.sprite]!.idleSec ?? 0.4;
  const idle = stateFrame(data, m, 'idle', Math.floor(clock / idleSec + index * 0.5))!;
  switch (b.state) {
    case 'air':
      if (v.hurt > 0 && b.bounced) return { frame: hurtFrame(data, m, 'hurt'), angle: 0 };
      return { frame: hurtFrame(data, m, 'hurtAir'), angle: (Math.floor(v.airT / r.airSpinSec) % 4) * turn, spin: true };
    case 'down':
      return { frame: hurtFrame(data, m, 'hurt'), angle: turn };
    case 'stunned':
      // 기절: 누운 채 깜빡이다 퇴장 (motion.md 4장)
      return { frame: hurtFrame(data, m, 'hurt'), angle: turn, hidden: Math.floor(b.timer / r.stunBlink) % 2 === 1 };
    case 'getup':
      return { frame: COMBAT.getupSec - b.timer < r.getupSquashSec ? hurtFrame(data, m, 'hurt') : idle, angle: 0 };
    case 'hitstun':
      return { frame: v.hurt > 0 ? hurtFrame(data, m, 'hurt') : idle, angle: 0 };
  }
  // 어지러움·그로기 자세가 피격 프레임보다 우선 (보스는 경직이 없어 그로기 중 맞아도 자세 유지)
  if (m.mode === 'selfStun') return { frame: stateFrame(data, m, 'selfStun') ?? idle, angle: 0 };
  if (m.mode === 'groggy') return { frame: stateFrame(data, m, 'groggy') ?? idle, angle: 0 };
  if (v.hurt > 0) return { frame: hurtFrame(data, m, 'hurt'), angle: 0 };
  const ph = attackPhase(m);
  if (ph && m.attack) return { frame: stateFrame(data, m, `${ph}:${m.attack.def.id}`) ?? idle, angle: 0 };
  if (m.moving) {
    // 튀기(hop): 이동 박자 = 첫 프레임, 쉬는 박자 = 둘째 / 걷기: 일정 간격 순환 (motion.md 8장)
    const ai = COMBAT.ai;
    const i = m.def.move?.style === 'hop'
      ? (m.hopT % ai.hopSec < ai.hopSec * ai.hopMove ? 0 : 1)
      : Math.floor(clock / fx.monster.walkFrameSec);
    return { frame: stateFrame(data, m, 'move', i) ?? idle, angle: 0 };
  }
  return { frame: idle, angle: 0 };
}

export function placeMonster(scene: Phaser.Scene, v: MonsterView, data: SpriteData, m: Monster, clock: number, index: number): void {
  const pose = monsterPose(data, m, v, clock, index);
  const frame = data.monsters[m.def.sprite]!.frames[pose.frame]!;
  const mf = fx.monster;
  let [dx, dy] = frame.offset ?? [0, 0];
  if (frame.shake) dx += Math.floor(clock / mf.shakeSec) % 2 ? 1 : -1;
  const angle = frame.spin ? (Math.floor(clock / mf.spinSec) % 4) * 90 * m.facing : pose.angle;
  // 슈퍼아머 외곽선은 금색으로 깜빡임 (art.md 8장)
  const armorOn = m.body.armor && Math.floor(clock / mf.armorBlink) % 2 === 0;
  v.view.img.setVisible(!pose.hidden);
  place(v.view, monsterTexture(scene, m.def.sprite, pose.frame, armorOn, m.frozen > 0), {
    x: m.body.x + dx * m.facing, y: m.body.y, z: m.body.z - dy, facing: m.facing, angle, flash: v.flash > 0,
    spin: frame.spin || pose.spin,
  });
}
