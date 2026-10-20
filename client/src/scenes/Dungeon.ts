// 던전 테스트 씬: 1층 방 (?room=1~6, 기본 1), 웨이브 순서대로. J 평타(달리면 대시) · K 백스텝 · U 올려베기 · I 대지가르기 · Z/X 물약 (combat.md 1장). 서버 없이 로컬
import Phaser from 'phaser';
import { skillDef, TILE } from '@game/shared';
import { sfx } from '../audio/player';
import { color, colorInt } from '../palette';
import { CombatStage } from '../stage/combatStage';
import { floorRoom, waveSpawns } from '../stage/roomSetup';
import { FIELD_BOTTOM, followCamera, HUD_HEIGHT } from '../view/layout';
import { showDevStats } from '../ui/devStats';
import { drawRoomBg } from '../view/roomBg';

const FLOOR = 1;
/** 카메라 데드존 ±2타일 (art.md 1장) */
const DEADZONE = 2 * TILE;
/** 배경을 화면 아래까지 채울 여유 (창이 세로로 길 때) */
const BG_EXTRA = 200;
/** 전멸 뒤 방을 다시 시작하기까지 (정산·섬 복귀는 M3·M4) */
const WIPE_RESTART_MS = 2000;
/** 스킬 슬롯 (임시 고정 장착, 슬롯 UI는 M4) */
const SKILLS = { skill1: skillDef('gs_launch'), skill2: skillDef('gs_earthsplit') };

type KeyName = 'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd' | 'attack' | 'backstep' | 'skill1' | 'skill2' | 'potionHp' | 'potionMp';

export class Dungeon extends Phaser.Scene {
  private room = floorRoom('floor1', Number(new URLSearchParams(location.search).get('room') ?? 1));
  private roomW = 0;
  private roomD = 0;
  /** 다음에 나올 웨이브 (모두 끝나면 waves.length) */
  private wave = 0;
  cleared = false;
  private stage!: CombatStage;
  private camCenter = 0;
  private hud!: Phaser.GameObjects.Rectangle;
  private keys!: Record<KeyName, Phaser.Input.Keyboard.Key>;

  constructor() {
    super('Dungeon');
  }

  create(): void {
    // scene.restart()로 다시 불려도 처음 상태가 되게
    this.wave = 0;
    this.cleared = false;
    const [tw, td] = this.room.size as [number, number];
    this.roomW = tw * TILE;
    const roomD = (this.roomD = td * TILE);
    this.cameras.main.setBackgroundColor(color(`floors.${FLOOR}.env.void`));
    if (!this.textures.exists('room-bg')) this.textures.addCanvas('room-bg', drawRoomBg(FLOOR, this.roomW, td, FIELD_BOTTOM + BG_EXTRA));
    this.add.image(0, 0, 'room-bg').setOrigin(0, 0).setDepth(-1000);

    const bounds = { minX: TILE / 2, maxX: this.roomW - TILE / 2, minY: 0, maxY: roomD };
    this.stage = new CombatStage(this, bounds, { x: 3 * TILE, y: roomD / 2 }, this.nextWave());
    this.camCenter = this.stage.player.pos.x;
    sfx.unlockOnFirstInput();
    this.stage.onWipe = () => this.time.delayedCall(WIPE_RESTART_MS, () => this.scene.restart());

    this.hud = this.add.rectangle(0, 0, 1, HUD_HEIGHT, colorInt('global.ui.panel')).setOrigin(0, 0).setScrollFactor(0).setDepth(10000);
    this.layoutHud();
    this.scale.on('resize', () => this.layoutHud());

    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = this.input.keyboard!.addKeys({
      up: K.UP, down: K.DOWN, left: K.LEFT, right: K.RIGHT, w: K.W, a: K.A, s: K.S, d: K.D,
      attack: K.J, backstep: K.K, skill1: K.U, skill2: K.I, potionHp: K.Z, potionMp: K.X,
    }) as typeof this.keys;
  }

  /** 다음 웨이브 출현 목록 (없으면 빈 목록) */
  private nextWave() {
    const w = this.room.waves[this.wave];
    if (!w) return [];
    this.wave++;
    return waveSpawns(w.monsters, this.roomW, this.roomD);
  }

  /** 몬스터를 모두 기절시키면 다음 웨이브, 마지막이면 방 클리어 (CLAUDE.md 핵심 게임 규칙) */
  private checkWave(): void {
    if (this.cleared || this.stage.monsters.length) return;
    const next = this.nextWave();
    if (next.length) this.stage.spawn(next);
    else {
      this.cleared = true;
      sfx.play('roomClear');
      console.info(`방 클리어: ${this.room.name}`);
    }
  }

  private layoutHud(): void {
    const { width, height } = this.scale.gameSize;
    this.hud.setPosition(0, height - HUD_HEIGHT).setSize(width, HUD_HEIGHT);
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
    showDevStats(this.stage.player, this.cleared ? '방 클리어' : '');

    const cam = followCamera(this.camCenter, this.stage.player.pos.x, DEADZONE, this.scale.gameSize.width, this.roomW);
    this.camCenter = cam.center;
    const shake = this.stage.fx.shake.offset();
    this.cameras.main.setScroll(cam.scrollX - shake.x, -shake.y);
  }
}
