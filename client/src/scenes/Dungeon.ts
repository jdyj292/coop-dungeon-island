// 던전 테스트 씬 (roadmap 0-5·0-6): 1층 1번 방, 걷기, 대검 3연타(J)·올려베기(U), 타격 패키지. 서버 없이 로컬
import Phaser from 'phaser';
import { ROOMS, skillDef, TILE, type Vec2 } from '@game/shared';
import { color, colorInt } from '../palette';
import { CombatStage } from '../stage/combatStage';
import { FIELD_BOTTOM, followCamera, HUD_HEIGHT } from '../view/layout';
import { drawRoomBg } from '../view/roomBg';

const FLOOR = 1;
/** 카메라 데드존 ±2타일 (art.md 1장) */
const DEADZONE = 2 * TILE;
/** 배경을 화면 아래까지 채울 여유 (창이 세로로 길 때) */
const BG_EXTRA = 200;
const LAUNCH = skillDef('gs_launch');

type KeyName = 'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd' | 'attack' | 'skill1';

export class Dungeon extends Phaser.Scene {
  private room = ROOMS.floor1!.rooms[0]!;
  private roomW = 0;
  private stage!: CombatStage;
  private camCenter = 0;
  private hud!: Phaser.GameObjects.Rectangle;
  private keys!: Record<KeyName, Phaser.Input.Keyboard.Key>;

  constructor() {
    super('Dungeon');
  }

  create(): void {
    const [tw, td] = this.room.size as [number, number];
    this.roomW = tw * TILE;
    const roomD = td * TILE;
    this.cameras.main.setBackgroundColor(color(`floors.${FLOOR}.env.void`));
    this.textures.addCanvas('room-bg', drawRoomBg(FLOOR, this.roomW, td, FIELD_BOTTOM + BG_EXTRA));
    this.add.image(0, 0, 'room-bg').setOrigin(0, 0).setDepth(-1000);

    // Tiled 맵(roadmap 3장) 전까지 임시 배치: 방 오른쪽 2/3에 고르게, 깊이는 번갈아
    const count = this.room.waves[0]!.monsters.mushroom ?? 0;
    const mushrooms: Vec2[] = Array.from({ length: count }, (_, i) => ({
      x: this.roomW / 3 + ((i + 0.5) * (this.roomW * 2 / 3 - TILE)) / count,
      y: roomD * (i % 2 ? 0.3 : 0.75),
    }));
    const bounds = { minX: TILE / 2, maxX: this.roomW - TILE / 2, minY: 0, maxY: roomD };
    this.stage = new CombatStage(this, bounds, { x: 3 * TILE, y: roomD / 2 }, mushrooms);
    this.camCenter = this.stage.player.pos.x;

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

  update(_time: number, delta: number): void {
    const k = this.keys;
    this.stage.update(delta / 1000, {
      x: (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0),
      y: (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0),
      attack: Phaser.Input.Keyboard.JustDown(k.attack),
      skill: Phaser.Input.Keyboard.JustDown(k.skill1) ? LAUNCH : null,
    });

    const cam = followCamera(this.camCenter, this.stage.player.pos.x, DEADZONE, this.scale.gameSize.width, this.roomW);
    this.camCenter = cam.center;
    const shake = this.stage.fx.shake.offset();
    this.cameras.main.setScroll(cam.scrollX - shake.x, -shake.y);
  }
}
