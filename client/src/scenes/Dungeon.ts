// 던전 씬: 1층 방 (?room=1~6, 기본 1), 웨이브 순서대로. J 평타(달리면 대시) · K 회피 · U 올려베기 · I 대지가르기 · Z/X 물약 · E 상호작용 (combat.md 1장)
// 기본은 서버 없이 로컬 (방 하나 전투 테스트). ?online=1&party=2면 서버 던전 방에 접속해 ?room부터 보스 방까지 한 판 (roadmap 3-3), ?weapon=staff면 스태프 (섬에서 출발하면 우물에서 고른 무기, registry weapon)
// 서버 방 번호가 바뀌면 같은 접속으로 씬을 다시 시작해 방 화면(배경·소품·장애물)을 새로 만든다
import Phaser from 'phaser';
import { ChatBar } from '../stage/chatBar';
import { buildFrom, COMBAT, entryPos, floorRoom, mapOf, MVP_WEAPONS, roomBounds, ROOMS, TILE, WaveRunner, weaponDef, weaponSkills, type Bounds, type PlayerState, type RoomDef } from '@game/shared';
import type { Shake } from '../fx/timing';
import { music } from '../audio/bgm/music';
import { sfx } from '../audio/player';
import { color } from '../palette';
import { Connection } from '../net/connection';
import { LagPanel } from '../net/lagPanel';
import type { KeyInput } from '../net/inputSender';
import { CombatStage } from '../stage/combatStage';
import { OnlineStage } from '../stage/onlineStage';
import { SettingsPanel } from '../stage/settingsPanel';
import { FIELD_BOTTOM, followCamera, HUD_HEIGHT } from '../view/layout';
import { CROP_TOP } from '../scale';
import { HudBottom } from '../ui/hudBottom';
import { HudOverlay } from '../ui/hudOverlay';
import { HudParty } from '../ui/hudParty';
import { HudBoss } from '../ui/hudBoss';
import { HudRoom } from '../ui/hudRoom';
import { BossIntro } from '../view/bossIntro';
import { ResultPanel } from '../ui/resultPanel';
import { PropLayer } from '../view/props';
import { drawRoomBg } from '../view/roomBg';
import { enterFadeMs } from '../fx/wellArrival';

const FLOOR = 1;
const floorRooms = () => ROOMS.floor1!.rooms;
const NO_KEYS: KeyInput = { x: 0, y: 0, attack: false, skill: null, backstep: false, potion: null, hold: false };
/** 카메라 데드존 ±2타일 (art.md 1장) */
const DEADZONE = 2 * TILE;
/** 배경을 화면 아래까지 채울 여유 (창이 세로로 길 때) */
const BG_EXTRA = 200;
/** 전멸 뒤 방을 다시 시작하기까지 (정산·섬 복귀는 M3·M4) */
const WIPE_RESTART_MS = 2000;
const HUD_DEPTH = 10000;
/** 부활: E를 누르고 있는 동안 서버에 알리는 간격 (서버는 300ms 안에 다시 오면 계속 누른 것으로) */
const REVIVE_SEND_MS = 150;
/** 스킬 슬롯 U·I = 무기 기본 스킬 2개 (임시 고정 장착, 슬롯 UI는 MVP 이후) */
/** 스킬 키 순서대로 (code = 스킬 노드: 온라인은 서버 값, 로컬은 개발 옵션 ?skills=) */
const skillsOf = (weapon: string, code: string) => weaponSkills(weaponDef(weapon), buildFrom(code));

type KeyName = 'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd' | 'attack' | 'backstep' | 'skill1' | 'skill2' | 'skill3' | 'skill4' | 'potionHp' | 'potionMp' | 'interact';

export class Dungeon extends Phaser.Scene {
  private params = new URLSearchParams(location.search);
  private room = floorRoom('floor1', Number(this.params.get('room') ?? 1));
  private onlineMode = this.params.get('online') === '1';
  private weapon = 'greatsword';
  /** 마지막에 누른 스킬 키 (누르고 있으면 대검 충전) */
  private skillKey: 'skill1' | 'skill2' | 'skill3' | 'skill4' | null = null;
  /** 섬 우물에서 출발한 던전 방 번호 (registry dungeonRoom, 정산 뒤 섬으로) */
  private islandRoom: string | null = null;
  /** 다시 시작해도 이어 쓰는 접속 (방 진행) */
  private conn: Connection | null = null;
  /** 씬을 다시 시작할 때 접속을 끊지 않음 */
  private keepConn = false;
  private roomW = 0;
  private waves!: WaveRunner;
  private stage: CombatStage | null = null;
  private online: OnlineStage | null = null;
  /** 채팅 (온라인만, 기록 3줄 반투명) */
  private chat: ChatBar | null = null;
  private camCenter = 0;
  private hud!: HudBottom;
  private overlay!: HudOverlay;
  private party!: HudParty;
  private roomHud!: HudRoom;
  private bossHud!: HudBoss;
  /** 설정 (Esc, 볼륨). 열려 있는 동안 캐릭터는 제자리 */
  private settings!: SettingsPanel;
  /** 보스 등장 연출 (보스 방에 들어갈 때 한 번) */
  private intro: BossIntro | null = null;
  /** 정산 화면 (한 판 끝) */
  private result: ResultPanel | null = null;
  /** 부활 E 요청을 마지막으로 보낸 시각 (누르는 동안 REVIVE_SEND_MS마다) */
  private reviveSentAt = 0;
  private awaitingKey = false;
  private props!: PropLayer;
  private keys!: Record<KeyName, Phaser.Input.Keyboard.Key>;

  constructor() {
    super('Dungeon');
  }

  create(): void {
    // scene.restart()로 다시 불려도 처음 상태가 되게
    this.stage = null;
    this.online = null;
    this.result = null;
    this.awaitingKey = this.keepConn = false;
    this.islandRoom = (this.registry.get('dungeonRoom') as string | undefined) ?? null;
    this.weapon = MVP_WEAPONS.find((w) => w === (this.params.get('weapon') ?? this.registry.get('weapon'))) ?? 'greatsword';
    this.onlineMode ||= !!this.islandRoom;
    this.cameras.main.setBackgroundColor(color(`floors.${FLOOR}.env.void`));
    // HUD는 카메라 흔들림과 무관하게 화면에 고정 (hud.md 1·3장)
    this.hud = new HudBottom(this, HUD_DEPTH);
    this.overlay = new HudOverlay(this, HUD_DEPTH - 1);
    this.party = new HudParty(this, HUD_DEPTH);
    this.roomHud = new HudRoom(this, HUD_DEPTH);
    this.bossHud = new HudBoss(this, HUD_DEPTH);
    this.settings = SettingsPanel.forDungeon(this, HUD_DEPTH + 8, () => !this.result && !this.chat?.open);
    this.intro = null;
    this.events.once('shutdown', () => { if (!this.keepConn) this.conn?.leave(); });
    if (!this.onlineMode) {
      const { bounds } = this.buildRoom(this.room);
      const stage = (this.stage = new CombatStage(this, bounds, entryPos(this.room, 0), this.waves.next(), { skills: buildFrom(this.params.get('skills') ?? '') }, weaponDef(this.weapon)));
      stage.onWipe = () => this.time.delayedCall(WIPE_RESTART_MS, () => this.scene.restart());
      stage.enterRoom(this.room); // 층 첫 방: 우물에서 떨어져 들어오고 몬스터는 잠든 채 (dungeon.md 2·5장)
    } else if (this.conn) this.setupOnline(this.conn);
    else this.connect();

    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = this.input.keyboard!.addKeys({
      up: K.UP, down: K.DOWN, left: K.LEFT, right: K.RIGHT, w: K.W, a: K.A, s: K.S, d: K.D,
      attack: K.J, backstep: K.K, skill1: K.U, skill2: K.I, skill3: K.O, skill4: K.P, potionHp: K.Z, potionMp: K.X, interact: K.E,
    }) as typeof this.keys;
  }

  /** 방 화면: 배경(방마다 텍스처), 소품·장애물, 카메라 시작 위치 */
  private buildRoom(room: RoomDef): { bounds: Bounds } {
    this.room = room;
    this.waves = new WaveRunner(room);
    const { width, bounds } = roomBounds(room);
    this.roomW = width;
    const key = `room-bg-${room.id}`;
    if (!this.textures.exists(key)) this.textures.addCanvas(key, drawRoomBg(FLOOR, width, room.size[1]!, FIELD_BOTTOM + BG_EXTRA, room));
    this.add.image(0, 0, key).setOrigin(0, 0).setDepth(-1000);
    this.cameras.main.fadeIn(enterFadeMs(room));
    this.props = new PropLayer(this, mapOf(room));
    // BGM: 방 1~5 = 층 곡 (방을 옮겨도 이어서), 보스 방 = 보스 곡 첫 마디부터 (audio.md 5장)
    const bgm = ROOMS.floor1!.bgm;
    music.play(floorRooms().indexOf(room) === floorRooms().length - 1 ? bgm.boss : bgm.room);
    this.camCenter = entryPos(room, 0).x;
    return { bounds };
  }

  /** 접속한 서버 방의 지금 방 번호로 화면을 만든다 */
  private setupOnline(conn: Connection): void {
    this.conn = conn;
    const { bounds } = this.buildRoom(floorRoom('floor1', conn.progress.roomIndex + 1));
    const online = (this.online = new OnlineStage(this, conn, bounds));
    if (import.meta.env.DEV) {
      const panel = new LagPanel(conn, online);
      this.events.once('shutdown', () => panel.destroy());
    }
    online.onBonus = (rate) => this.overlay.showBonus(rate);
    this.chat = ChatBar.forDungeon(this, HUD_DEPTH + 5, online, conn, () => !!this.result || this.settings.open);
    // 재접속에 성공하면 같은 접속으로 화면을 다시 만든다 (전체 상태를 다시 받음, network.md 10장)
    conn.onReconnected = () => { this.keepConn = true; this.scene.restart(); };
    online.onResult = (r) => {
      this.result = new ResultPanel(this, HUD_DEPTH + 10, r, conn.myId, (pid) => online.lookOf(pid));
      // 정산 화면: 음악은 0.5초에 걸쳐 줄이고 정지 (정산 효과음이 주인공)
      music.stop();
    };
    online.onClear = () => {
      this.overlay.showClear();
      this.props.setCleared(true);
    };
    // 들어오자마자 이미 클리어된 방 (재접속 등)
    if (conn.progress.doorOpen) this.props.setCleared(true);
    // 보스 방: 카메라가 보스 쪽으로 갔다가 돌아옴 (hud.md 5장)
    const boss = mapOf(this.room).spawns.find((p) => p.role === 'boss');
    if (boss && !conn.progress.doorOpen) this.intro = new BossIntro(this.camCenter, boss.x);
  }

  /** 섬에서 출발한 방, 아니면 개발 방 (?room ?party, 지연 흉내 ?lag&jitter&loss: Connection.devRoom·netSimFrom) */
  private connect(): void {
    Connection.join(this.islandRoom ? { roomId: this.islandRoom } : Connection.devRoom(this.params), Connection.netSimFrom(this.params)).then((conn) => {
      if (!this.scene.isActive()) return conn.leave();
      this.setupOnline(conn);
    }, (e: unknown) => console.error('[online] 접속 실패 (서버가 떠 있나요? pnpm dev)', e));
  }

  /** E 상호작용 (판정은 서버): 가까운 대상 위에 [E], 상자 = 클리어 뒤 한 번, 쓰러진 동료 = 누르는 동안 부활 (combat.md 4장) */
  private interact(live: { doorOpen: boolean; chestOpen: boolean }, down: boolean, pressed: boolean): void {
    const online = this.online!, me = online.me, chest = mapOf(this.room).chest, range = COMBAT.interactRange;
    const near = (x: number, y: number) => !!me && !me.downed && Math.hypot(me.pos.x - x, me.pos.y - y) <= range;
    if (chest && live.doorOpen && !live.chestOpen && near(chest.x, chest.y)) {
      this.props.setPrompt(chest);
      if (pressed) online.conn.send('interact', { targetId: 'chest' });
      return;
    }
    const ally = online.downedAllies().find((d) => near(d.x, d.y));
    this.props.setPrompt(ally ?? null);
    if (ally && down && this.time.now - this.reviveSentAt >= REVIVE_SEND_MS) {
      this.reviveSentAt = this.time.now;
      online.conn.send('interact', { targetId: `revive:${ally.pid}` });
    }
  }

  /** 정산 화면이 다 보인 뒤 아무 키: 섬으로 (개발 방은 새 판) */
  private showResult(dt: number): void {
    const r = this.result!, { width, height } = this.scale.gameSize;
    r.draw(dt, width, height);
    if (r.done) this.waitKeyForNewRun();
  }

  /** 아무 키 → 섬에서 왔으면 섬 우물 앞으로(hud.md 6장), 개발 방은 새 판 (정산 화면 뒤, 재접속 실패 뒤) */
  private waitKeyForNewRun(): void {
    if (this.awaitingKey) return;
    this.awaitingKey = true;
    this.input.keyboard!.once('keydown', () => {
      this.awaitingKey = false;
      this.conn?.leave();
      this.conn = null;
      if (!this.islandRoom) return this.scene.restart();
      this.registry.remove('dungeonRoom');
      this.scene.start('Island');
    });
  }

  /** 로컬 전투 테스트의 보스 체력 (보스 HP 바) */
  private localBoss(): { ratio: number; groggy: boolean; name: string } | null {
    const b = this.stage?.monsters.find((m) => m.def.rank === 'boss');
    return b ? { ratio: b.hp / b.maxHp, groggy: b.mode === 'groggy', name: b.def.name } : null;
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
    const k = this.keys, dt = delta / 1000, sk = skillsOf(this.weapon, this.online ? this.online.conn.mySkills : this.params.get('skills') ?? '');
    // U I O P = 장착한 슬롯 순서 (skillLoadout.slotSkills). 마지막에 누른 스킬 키를 누르고 있으면 대검 충전
    const slots = ['skill1', 'skill2', 'skill3', 'skill4'] as const;
    const pressed = slots.findIndex((n, i) => Phaser.Input.Keyboard.JustDown(k[n]) && sk[i]);
    if (pressed >= 0) this.skillKey = slots[pressed]!;
    const input: KeyInput = {
      x: (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0),
      y: (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0),
      attack: Phaser.Input.Keyboard.JustDown(k.attack),
      skill: pressed >= 0 ? sk[pressed]! : null,
      hold: !!this.skillKey && k[this.skillKey].isDown,
      backstep: Phaser.Input.Keyboard.JustDown(k.backstep),
      potion: Phaser.Input.Keyboard.JustDown(k.potionHp) ? 'hp' : Phaser.Input.Keyboard.JustDown(k.potionMp) ? 'mp' : null,
    };
    let view: { player: PlayerState | null; combo: number; shake: Shake; look: { color: number; hair?: import('../view/look').Hair }; coins: number; materials: number };
    if (this.stage) {
      this.checkWave(this.stage);
      this.stage.update(dt, this.settings.open ? NO_KEYS : input);
      view = { player: this.stage.player, combo: this.stage.sim.combo.count, shake: this.stage.fx.shake, look: { color: 0 }, coins: 0, materials: 0 };
    } else if (this.online) {
      const live = this.online.conn.progress;
      // 다음 방 (출구에 전원 모임): 같은 접속으로 방 화면을 다시 만든다
      if (floorRoom('floor1', live.roomIndex + 1) !== this.room) {
        this.keepConn = true;
        this.scene.restart();
        return;
      }
      // 정산·보스 등장 연출·재접속·채팅·설정 중에는 조작 없이 세계만 그린다
      const status = this.online.conn.status;
      this.overlay.connection = status;
      this.online.update(dt, this.result || this.intro || status !== 'ok' || this.chat?.open || this.settings.open ? NO_KEYS : input);
      this.chat?.draw(this.time.now / 1000);
      if (status === 'lost') this.waitKeyForNewRun();
      this.props.setExit(live.exitAt, live.exitNeed);
      this.props.setChestOpen(live.chestOpen);
      this.props.setReturn(live.returnLeft);
      if (this.result) this.showResult(dt);
      else this.interact(live, k.interact.isDown && !this.settings.open, Phaser.Input.Keyboard.JustDown(k.interact) && !this.settings.open);
      const mine = this.online.conn.mine;
      view = {
        player: this.online.me, combo: this.online.comboCount, shake: this.online.fx.shake, look: this.online.lookOf(this.online.conn.myId),
        coins: mine?.coins ?? 0, materials: mine?.materials ?? 0,
      };
      this.party.draw(this.online.party());
    } else return; // 접속 중
    this.props.update(dt);
    const { width, height } = this.scale.gameSize;
    if (view.player) {
      this.hud.draw({
        player: view.player, weapon: this.weapon, skills: [0, 1, 2, 3].map((i) => sk[i] ?? null),
        level: 1, coins: view.coins, materials: view.materials, colorIndex: view.look.color, hair: view.look.hair,
      }, dt, width, height - HUD_HEIGHT);
    }
    this.overlay.draw(view.combo, dt, width);
    const live = this.online?.conn.progress;
    const roomIndex = live ? live.roomIndex : floorRooms().indexOf(this.room);
    const count = live ? live.roomCount : floorRooms().length;
    this.roomHud.draw(roomIndex, count, width, (live ? live.doorOpen : this.waves.cleared) && roomIndex < count - 1);

    const boss = this.online ? this.online.boss() : this.localBoss();
    this.bossHud.draw(boss?.ratio ?? null, boss?.groggy ?? false, width);
    let target = view.player?.pos.x ?? this.camCenter;
    if (this.intro) {
      const shot = this.intro.update(dt, target);
      this.overlay.bossBand = shot.band ? boss?.name ?? '' : null;
      target = shot.camX;
      if (this.intro.done) this.intro = null;
    }
    const cam = followCamera(this.intro ? target : this.camCenter, target, this.intro ? 0 : DEADZONE, width, this.roomW);
    this.camCenter = cam.center;
    const shake = view.shake.offset();
    // 화면이 전투 구역보다 높으면 남는 세로를 위아래로 나누고, 낮으면 맨 위(나무 장식)부터 잘라 바닥 끝을 지킨다 (docs/art.md 1장)
    const gap = height - HUD_HEIGHT - FIELD_BOTTOM;
    const padY = gap >= 0 ? Math.floor(gap / 2) : Math.max(gap, -CROP_TOP);
    this.cameras.main.setScroll(cam.scrollX - shake.x, -padY - shake.y);
  }
}
