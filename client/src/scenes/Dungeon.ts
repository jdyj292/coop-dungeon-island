// 던전 테스트 씬 (roadmap 0-5·0-6): 1층 1번 방, 걷기, 대검 3연타(J)·올려베기(U), 타격 패키지. 서버 없이 로컬
import Phaser from 'phaser';
import {
  fighterPose, PLAYER_MOVE, skillDef, TILE, weaponDef, type ActionDef, type BodyEvent, type FighterEvent,
} from '@game/shared';
import rooms from '../../../shared/data/rooms.json';
import fx from '../../data/fx.json';
import { hitPackage, type FxContext } from '../fx/hitPackage';
import { FxLayer } from '../fx/layer';
import { dust, ring } from '../fx/particles';
import { Rhythm } from '../fx/rhythm';
import { smear, smearShape } from '../fx/smear';
import { HitStop, Shake } from '../fx/timing';
import {
  newPlayer, spawnMonster, stepMonster, stepPlayer, type HitResult, type LocalMonster, type LocalPlayer,
} from '../local/combatSim';
import { color, colorInt } from '../palette';
import { walkStep, type CharacterLook } from '../sprites/compose';
import { spriteData } from '../sprites/data';
import { stateFrames } from '../sprites/monster';
import { characterTexture } from '../sprites/textures';
import { newActorView, place, placeMonster, type ActorView } from '../view/actors';
import { FIELD_BOTTOM, followCamera, HUD_HEIGHT, project } from '../view/layout';
import { drawRoomBg } from '../view/roomBg';

const FLOOR = 1;
/** 카메라 데드존 ±2타일 (art.md 1장) */
const DEADZONE = 2 * TILE;
/** 배경을 화면 아래까지 채울 여유 (창이 세로로 길 때) */
const BG_EXTRA = 200;
/** 이펙트는 캐릭터 위, HUD 아래 */
const FX_DEPTH = 5000;
const WEAPON = weaponDef('greatsword');
const LAUNCH = skillDef('gs_launch');

type KeyName = 'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd' | 'attack' | 'skill1';

export class Dungeon extends Phaser.Scene {
  private room = rooms.floor1.rooms[0]!;
  private roomW = 0;
  private roomD = 0;
  private player!: LocalPlayer;
  private playerView!: ActorView;
  private beat = 0;
  private rhythm = new Rhythm();
  private mushrooms: { m: LocalMonster; view: ActorView }[] = [];
  private fx!: FxContext;
  private camCenter = 0;
  private hud!: Phaser.GameObjects.Rectangle;
  private keys!: Record<KeyName, Phaser.Input.Keyboard.Key>;

  constructor() {
    super('Dungeon');
  }

  create(): void {
    const [tw, td] = this.room.size as [number, number];
    this.roomW = tw * TILE;
    this.roomD = td * TILE;
    this.cameras.main.setBackgroundColor(color(`floors.${FLOOR}.env.void`));
    this.textures.addCanvas('room-bg', drawRoomBg(FLOOR, this.roomW, td, FIELD_BOTTOM + BG_EXTRA));
    this.add.image(0, 0, 'room-bg').setOrigin(0, 0).setDepth(-1000);

    this.player = newPlayer({ x: 3 * TILE, y: this.roomD / 2 });
    this.playerView = newActorView(this);
    // Tiled 맵(roadmap 3장) 전까지 임시 배치: 방 오른쪽 2/3에 고르게, 깊이는 번갈아
    const count = (this.room.waves[0]!.monsters as Record<string, number>).mushroom ?? 0;
    for (let i = 0; i < count; i++) {
      const x = this.roomW / 3 + ((i + 0.5) * (this.roomW * 2 / 3 - TILE)) / count;
      const y = this.roomD * (i % 2 ? 0.3 : 0.75);
      this.mushrooms.push({ m: spawnMonster('mushroom', x, y), view: newActorView(this) });
    }
    this.camCenter = this.player.pos.x;
    this.fx = { layer: new FxLayer(this, FX_DEPTH), stop: new HitStop(), shake: new Shake() };

    this.hud = this.add.rectangle(0, 0, 1, HUD_HEIGHT, colorInt('global.ui.panel')).setOrigin(0, 0).setScrollFactor(0).setDepth(10000);
    this.layoutHud();
    this.scale.on('resize', () => this.layoutHud());

    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = this.input.keyboard!.addKeys({
      up: K.UP, down: K.DOWN, left: K.LEFT, right: K.RIGHT, w: K.W, a: K.A, s: K.S, d: K.D,
      attack: K.J, skill1: K.U,
    }) as typeof this.keys;
  }

  private layoutHud(): void {
    const { width, height } = this.scale.gameSize;
    this.hud.setPosition(0, height - HUD_HEIGHT).setSize(width, HUD_HEIGHT);
  }

  update(time: number, delta: number): void {
    const real = delta / 1000;
    // 히트스톱 중에는 게임 시간이 멈추고 흔들림만 진행 (motion.md 3장)
    const dt = this.fx.stop.filter(real);
    this.fx.shake.update(real);

    const k = this.keys, p = this.player;
    // 몬스터를 먼저 진행: 이번 틱에 맞은 번쩍임·경직이 같은 틱에 깎이지 않게
    for (const { m } of this.mushrooms) {
      const b = this.bounds();
      stepMonster(m, dt, p.pos.x, b.minX, b.maxX).forEach((e) => this.onMonsterEvent(m, e));
    }
    const res = stepPlayer(p, WEAPON, {
      x: (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0),
      y: (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0),
      attack: Phaser.Input.Keyboard.JustDown(k.attack),
      skill: Phaser.Input.Keyboard.JustDown(k.skill1) ? LAUNCH : null,
    }, dt, PLAYER_MOVE.walk, this.bounds(), this.mushrooms.map((e) => e.m));
    res.events.forEach((e) => this.onPlayerEvent(e));
    res.hits.forEach((h) => this.onHit(h));
    this.rhythm.update(dt, !!p.fighter.run);
    this.fx.layer.update(dt);

    this.drawActors(time, res.moved);
    this.fx.layer.draw();

    const cam = followCamera(this.camCenter, p.pos.x, DEADZONE, this.scale.gameSize.width, this.roomW);
    this.camCenter = cam.center;
    const shake = this.fx.shake.offset();
    this.cameras.main.setScroll(cam.scrollX - shake.x, -shake.y);
  }

  private bounds() {
    return { minX: TILE / 2, maxX: this.roomW - TILE / 2, minY: 0, maxY: this.roomD };
  }

  /** 발밑 화면 좌표 + 리듬 보정 */
  private playerScreen() {
    const p = this.player, s = project(p.pos.x + this.rhythm.px * p.facing, p.pos.y);
    return { ...s, facing: p.facing };
  }

  private onPlayerEvent(e: FighterEvent): void {
    this.rhythm.onEvent(e);
    if (e.type !== 'active') return;
    const def: ActionDef = e.run.def;
    const shape = smearShape(def.poses?.active ?? '');
    if (!shape) return;
    const { sx, sy, facing } = this.playerScreen();
    const [cx, cy] = fx.smear.center as [number, number];
    this.fx.layer.add(smear(sx + cx * facing, sy + cy, facing, shape, def.fx?.grade ?? 'light'));
  }

  private onHit({ monster: m, def, damage }: HitResult): void {
    const b = m.body, facing = this.player.facing;
    const { sx, sy } = project(b.x, b.y, b.z);
    const [ax, ay] = fx.star.at as [number, number];
    m.hurt = fx.reaction.hurtSec;
    hitPackage(this.fx, def.fx?.grade ?? 'light', m, {
      x: sx + ax * facing, y: sy + ay, numberX: sx, numberY: sy - fx.number.above,
    }, damage, def.fx?.shake);
  }

  private onMonsterEvent(m: LocalMonster, e: BodyEvent): void {
    const { sx, sy } = project(m.body.x, m.body.y);
    const add = (list: ReturnType<typeof dust>) => list.forEach((d) => this.fx.layer.add(d));
    if (e === 'bounce') {
      m.hurt = fx.reaction.hurtSec;
      add(dust(sx, sy, fx.dust.bounce));
    } else if (e === 'down') {
      add(dust(sx, sy, fx.dust.down));
      this.fx.layer.add(ring(sx, sy));
      this.fx.shake.start(fx.downShake.sec, fx.downShake.px);
    } else if (e === 'wall') {
      add(dust(sx, sy, fx.dust.bounce));
    }
  }

  private drawActors(time: number, moved: number): void {
    const data = spriteData(), p = this.player;
    const acting = !!p.fighter.run;
    // 걷기 박자는 이동 거리로 넘긴다 (발이 미끄러져 보이지 않게)
    this.beat = moved > 0 ? this.beat + moved / data.poses.walk.pxPerBeat : 0;
    const step = moved > 0 && !acting ? walkStep(data, Math.floor(this.beat)) : { frame: 'stand', bob: 0 };
    const look: CharacterLook = {
      hair: 'short', face: 'normal', outfit: data.outfits.sets.beginner!,
      weapon: 'greatsword_basic', pose: fighterPose(p.fighter) ?? 'idle', frame: step.frame, bob: step.bob,
    };
    const tex = characterTexture(this, look, { hairColor: 'global.hairColors.0', playerColor: 'global.playerColors.0' });
    place(this.playerView, tex, { x: p.pos.x + this.rhythm.px * p.facing, y: p.pos.y, facing: p.facing });

    const idleSec = data.monsters.mushroom!.idleSec;
    const idle = stateFrames(data, 'mushroom', 'idle');
    this.mushrooms.forEach(({ m, view }, i) => {
      const frame = idle[Math.floor(time / 1000 / idleSec + i * 0.5) % idle.length]!;
      placeMonster(this, view, data, m, frame);
    });
  }
}
