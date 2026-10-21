// 던전 테스트 씬: 1층 방 (?room=1~6, 기본 1), 웨이브 순서대로. J 평타(달리면 대시) · K 백스텝 · U 올려베기 · I 대지가르기 · Z/X 물약 (combat.md 1장). 서버 없이 로컬
import Phaser from 'phaser';
import { entryPos, floorRoom, roomBounds, skillDef, TILE, WaveRunner } from '@game/shared';
import { sfx } from '../audio/player';
import { color } from '../palette';
import { CombatStage } from '../stage/combatStage';
import { FIELD_BOTTOM, followCamera, HUD_HEIGHT } from '../view/layout';
import { HudBottom } from '../ui/hudBottom';
import { HudOverlay } from '../ui/hudOverlay';
import { drawRoomBg } from '../view/roomBg';

const FLOOR = 1;
/** 카메라 데드존 ±2타일 (art.md 1장) */
const DEADZONE = 2 * TILE;
/** 배경을 화면 아래까지 채울 여유 (창이 세로로 길 때) */
const BG_EXTRA = 200;
/** 전멸 뒤 방을 다시 시작하기까지 (정산·섬 복귀는 M3·M4) */
const WIPE_RESTART_MS = 2000;
const HUD_DEPTH = 10000;
/** 스킬 슬롯 (임시 고정 장착, 슬롯 UI는 M4) */
const SKILLS = { skill1: skillDef('gs_launch'), skill2: skillDef('gs_earthsplit') };

type KeyName = 'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd' | 'attack' | 'backstep' | 'skill1' | 'skill2' | 'potionHp' | 'potionMp';

export class Dungeon extends Phaser.Scene {
  private room = floorRoom('floor1', Number(new URLSearchParams(location.search).get('room') ?? 1));
  private roomW = 0;
  private waves!: WaveRunner;
  private stage!: CombatStage;
  private camCenter = 0;
  private hud!: HudBottom;
  private overlay!: HudOverlay;
  private keys!: Record<KeyName, Phaser.Input.Keyboard.Key>;

  constructor() {
    super('Dungeon');
  }

  create(): void {
    // scene.restart()로 다시 불려도 처음 상태가 되게
    this.waves = new WaveRunner(this.room);
    const { width, depth, bounds } = roomBounds(this.room);
    const td = this.room.size[1]!;
    this.roomW = width;
    this.cameras.main.setBackgroundColor(color(`floors.${FLOOR}.env.void`));
    if (!this.textures.exists('room-bg')) this.textures.addCanvas('room-bg', drawRoomBg(FLOOR, this.roomW, td, FIELD_BOTTOM + BG_EXTRA));
    this.add.image(0, 0, 'room-bg').setOrigin(0, 0).setDepth(-1000);

    this.stage = new CombatStage(this, bounds, entryPos(0, 1, depth), this.waves.next());
    this.camCenter = this.stage.player.pos.x;
    sfx.unlockOnFirstInput();
    this.stage.onWipe = () => this.time.delayedCall(WIPE_RESTART_MS, () => this.scene.restart());

    // HUD는 카메라 흔들림과 무관하게 화면에 고정 (hud.md 1·3장)
    this.hud = new HudBottom(this, HUD_DEPTH);
    this.overlay = new HudOverlay(this, HUD_DEPTH - 1);

    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = this.input.keyboard!.addKeys({
      up: K.UP, down: K.DOWN, left: K.LEFT, right: K.RIGHT, w: K.W, a: K.A, s: K.S, d: K.D,
      attack: K.J, backstep: K.K, skill1: K.U, skill2: K.I, potionHp: K.Z, potionMp: K.X,
    }) as typeof this.keys;
  }

  /** 몬스터를 모두 기절시키면 다음 웨이브, 마지막이면 방 클리어 (shared WaveRunner) */
  private checkWave(): void {
    const r = this.waves.check(this.stage.monsters.length);
    if (Array.isArray(r)) this.stage.spawn(r);
    else if (r === 'clear') {
      sfx.play('roomClear');
      this.overlay.showClear();
      console.info(`방 클리어: ${this.room.name}`);
    }
  }

  update(_time: number, delta: number): void {
    const k = this.keys;
    this.checkWave();
    this.stage.update(delta / 1000, {
      x: (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0),
      y: (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0),
      attack: Phaser.Input.Keyboard.JustDown(k.attack),
      skill: Phaser.Input.Keyboard.JustDown(k.skill1) ? SKILLS.skill1
        : Phaser.Input.Keyboard.JustDown(k.skill2) ? SKILLS.skill2 : null,
      backstep: Phaser.Input.Keyboard.JustDown(k.backstep),
      potion: Phaser.Input.Keyboard.JustDown(k.potionHp) ? 'hp' : Phaser.Input.Keyboard.JustDown(k.potionMp) ? 'mp' : null,
    });
    const { width, height } = this.scale.gameSize, dt = delta / 1000;
    this.hud.draw({
      player: this.stage.player, weapon: 'greatsword', skills: [SKILLS.skill1, SKILLS.skill2, null, null],
      level: 1, coins: 0, materials: 0,
    }, dt, width, height - HUD_HEIGHT);
    this.overlay.draw(this.stage.sim.combo.count, dt, width);

    const cam = followCamera(this.camCenter, this.stage.player.pos.x, DEADZONE, this.scale.gameSize.width, this.roomW);
    this.camCenter = cam.center;
    const shake = this.stage.fx.shake.offset();
    this.cameras.main.setScroll(cam.scrollX - shake.x, -shake.y);
  }
}
