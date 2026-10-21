// 던전 테스트 씬: 1층 방 (?room=1~6, 기본 1), 웨이브 순서대로. J 평타(달리면 대시) · K 백스텝 · U 올려베기 · I 대지가르기 · Z/X 물약 (combat.md 1장)
// 기본은 서버 없이 로컬. ?online=1&party=2면 서버 던전 방에 접속 (roadmap 2-3, 같은 방 번호·인원의 빈자리에 들어감)
import Phaser from 'phaser';
import { entryPos, floorRoom, mapOf, roomBounds, skillDef, TILE, WaveRunner, type Bounds, type PlayerState } from '@game/shared';
import type { Shake } from '../fx/timing';
import { sfx } from '../audio/player';
import { color } from '../palette';
import { Connection } from '../net/connection';
import { LagPanel } from '../net/lagPanel';
import type { KeyInput } from '../net/inputSender';
import { CombatStage } from '../stage/combatStage';
import { OnlineStage } from '../stage/onlineStage';
import { FIELD_BOTTOM, followCamera, HUD_HEIGHT } from '../view/layout';
import { HudBottom } from '../ui/hudBottom';
import { HudOverlay } from '../ui/hudOverlay';
import { HudParty } from '../ui/hudParty';
import { PropLayer } from '../view/props';
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
  private params = new URLSearchParams(location.search);
  private room = floorRoom('floor1', Number(this.params.get('room') ?? 1));
  private onlineMode = this.params.get('online') === '1';
  private roomW = 0;
  private waves!: WaveRunner;
  private stage: CombatStage | null = null;
  private online: OnlineStage | null = null;
  private camCenter = 0;
  private hud!: HudBottom;
  private overlay!: HudOverlay;
  private party!: HudParty;
  private props!: PropLayer;
  private keys!: Record<KeyName, Phaser.Input.Keyboard.Key>;

  constructor() {
    super('Dungeon');
  }

  create(): void {
    // scene.restart()로 다시 불려도 처음 상태가 되게
    this.waves = new WaveRunner(this.room);
    const { width, bounds } = roomBounds(this.room);
    const td = this.room.size[1]!;
    this.roomW = width;
    this.cameras.main.setBackgroundColor(color(`floors.${FLOOR}.env.void`));
    if (!this.textures.exists('room-bg')) this.textures.addCanvas('room-bg', drawRoomBg(FLOOR, this.roomW, td, FIELD_BOTTOM + BG_EXTRA));
    this.add.image(0, 0, 'room-bg').setOrigin(0, 0).setDepth(-1000);
    this.props = new PropLayer(this, mapOf(this.room));

    // HUD는 카메라 흔들림과 무관하게 화면에 고정 (hud.md 1·3장)
    this.hud = new HudBottom(this, HUD_DEPTH);
    this.overlay = new HudOverlay(this, HUD_DEPTH - 1);
    this.party = new HudParty(this, HUD_DEPTH);
    sfx.unlockOnFirstInput();
    this.camCenter = entryPos(this.room, 0).x;
    if (this.onlineMode) this.connect(bounds);
    else {
      const stage = (this.stage = new CombatStage(this, bounds, entryPos(this.room, 0), this.waves.next()));
      stage.onWipe = () => this.time.delayedCall(WIPE_RESTART_MS, () => this.scene.restart());
    }

    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = this.input.keyboard!.addKeys({
      up: K.UP, down: K.DOWN, left: K.LEFT, right: K.RIGHT, w: K.W, a: K.A, s: K.S, d: K.D,
      attack: K.J, backstep: K.K, skill1: K.U, skill2: K.I, potionHp: K.Z, potionMp: K.X,
    }) as typeof this.keys;
  }

  /** ?party=1~4 (기본 2). 개발용 네트워크 흉내 초기값: ?lag=왕복ms&jitter=±ms&loss=% (` 키 패널에서 조정) */
  private connect(bounds: Bounds): void {
    const party = Math.min(4, Math.max(1, Number(this.params.get('party') ?? 2)));
    const num = (k: string) => Math.max(0, Number(this.params.get(k) ?? 0) || 0);
    const sim = { lagMs: num('lag'), jitterMs: num('jitter'), loss: num('loss') / 100 };
    Connection.join({ room: Number(this.params.get('room') ?? 1), partySize: party }, sim).then((conn) => {
      if (!this.scene.isActive()) return conn.leave();
      const online = (this.online = new OnlineStage(this, conn, bounds));
      if (import.meta.env.DEV) {
        const panel = new LagPanel(conn, online);
        this.events.once('shutdown', () => panel.destroy());
      }
      this.online.onClear = () => {
        this.overlay.showClear();
        this.props.setCleared(true);
      };
      this.events.once('shutdown', () => conn.leave());
    }, (e: unknown) => console.error('[online] 접속 실패 (서버가 떠 있나요? pnpm dev)', e));
  }

  /** 몬스터를 모두 기절시키면 다음 웨이브, 마지막이면 방 클리어 (shared WaveRunner) */
  private checkWave(stage: CombatStage): void {
    const r = this.waves.check(stage.monsters.length);
    if (Array.isArray(r)) stage.spawn(r);
    else if (r === 'clear') {
      sfx.play('roomClear');
      this.overlay.showClear();
      this.props.setCleared(true);
      console.info(`방 클리어: ${this.room.name}`);
    }
  }

  update(_time: number, delta: number): void {
    const k = this.keys, dt = delta / 1000;
    const input: KeyInput = {
      x: (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0),
      y: (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0),
      attack: Phaser.Input.Keyboard.JustDown(k.attack),
      skill: Phaser.Input.Keyboard.JustDown(k.skill1) ? SKILLS.skill1
        : Phaser.Input.Keyboard.JustDown(k.skill2) ? SKILLS.skill2 : null,
      backstep: Phaser.Input.Keyboard.JustDown(k.backstep),
      potion: Phaser.Input.Keyboard.JustDown(k.potionHp) ? 'hp' : Phaser.Input.Keyboard.JustDown(k.potionMp) ? 'mp' : null,
    };
    let view: { player: PlayerState | null; combo: number; shake: Shake; color: number };
    if (this.stage) {
      this.checkWave(this.stage);
      this.stage.update(dt, input);
      view = { player: this.stage.player, combo: this.stage.sim.combo.count, shake: this.stage.fx.shake, color: 0 };
    } else if (this.online) {
      this.online.update(dt, input);
      view = { player: this.online.me, combo: this.online.comboCount, shake: this.online.fx.shake, color: this.online.myColor };
      this.party.draw(this.online.party());
    } else return; // 접속 중
    this.props.update(dt);
    const { width, height } = this.scale.gameSize;
    if (view.player) {
      this.hud.draw({
        player: view.player, weapon: 'greatsword', skills: [SKILLS.skill1, SKILLS.skill2, null, null],
        level: 1, coins: 0, materials: 0, colorIndex: view.color,
      }, dt, width, height - HUD_HEIGHT);
    }
    this.overlay.draw(view.combo, dt, width);

    const cam = followCamera(this.camCenter, view.player?.pos.x ?? this.camCenter, DEADZONE, width, this.roomW);
    this.camCenter = cam.center;
    const shake = view.shake.offset();
    this.cameras.main.setScroll(cam.scrollX - shake.x, -shake.y);
  }
}
