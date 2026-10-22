import Phaser from 'phaser';
import { nearFacility, type MeRes } from '@game/shared';
import { music } from '../audio/bgm/music';
import { api } from '../net/api';
import { IslandConnection } from '../net/islandNet';
import { colorInt } from '../palette';
import { IslandStage } from '../stage/islandStage';
import { IslandHud } from '../ui/islandHud';
import { koText } from '../ui/koText';
import { islandScreenSize, IslandWorld } from '../view/islandWorld';
import { HUD_HEIGHT, project } from '../view/layout';

/** 카메라: 내 캐릭터가 화면 가운데에서 이만큼 벗어나면 따라감 */
const DEADZONE = { x: 40, y: 24 };

/**
 * 섬 씬 (docs/island.md, hud.md 8장): 섬 방에 접속해 주민과 함께 걷는다. 장식 배치·상점·게시판·우물 출발은 4-6~4-8
 * 조작: 방향키·WASD 이동(좌우 두 번 = 달리기), L 로그아웃 (개발 임시)
 */
export class Island extends Phaser.Scene {
  private stage: IslandStage | null = null;
  private world!: IslandWorld;
  private hud!: IslandHud;
  private keys!: Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>;
  private me!: MeRes;
  private notice: Phaser.GameObjects.GameObject | null = null;
  private cam = { x: 0, y: 0 };

  constructor() {
    super('Island');
  }

  create(): void {
    const me = this.registry.get('me') as MeRes | undefined;
    if (!me) return void this.scene.start('Title');
    this.me = me;
    this.stage = null;
    this.cameras.main.setBackgroundColor(colorInt('island.water'));
    this.world = new IslandWorld(this);
    this.hud = new IslandHud(this, 6000);
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = this.input.keyboard!.addKeys({ up: K.UP, down: K.DOWN, left: K.LEFT, right: K.RIGHT, w: K.W, a: K.A, s: K.S, d: K.D }) as typeof this.keys;
    this.input.keyboard!.on('keydown-L', () => this.logout());
    this.events.once('shutdown', () => {
      this.stage?.destroy();
      this.stage = null;
      this.input.keyboard!.off('keydown-L');
    });
    music.play('island');
    void this.connect();
  }

  private async connect(): Promise<void> {
    try {
      const conn = await IslandConnection.join(this.me.island.id, String(this.me.id));
      if (!this.scene.isActive()) return conn.leave();
      this.stage = new IslandStage(this, conn);
      const p = this.stage.myPos;
      this.cam = { x: p.x, y: p.y };
    } catch (e) {
      console.warn('[island] 접속 실패', e);
      this.showNotice('섬에 들어갈 수 없습니다 (서버 확인)');
    }
  }

  private logout(): void {
    void api.logout().then(() => {
      this.registry.remove('me');
      this.scene.start('Title');
    });
  }

  private showNotice(text: string): void {
    this.notice?.destroy();
    this.notice = koText(this, Math.round(this.scale.width / 2), 60, text, { color: 'global.fx.flash', outline: 'four', align: 'center' }).setScrollFactor(0).setDepth(7000);
  }

  update(time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, 0.1);
    const k = this.keys, s = this.stage;
    const x = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
    const y = (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0);
    const { width, height } = this.scale.gameSize;
    if (s) {
      s.update(dt, { x, y });
      if (s.conn.status === 'replaced') this.showNotice('다른 곳에서 접속해 연결을 끊었습니다');
    }
    const pos = s?.myPos ?? null;
    this.world.update(time, pos ? nearFacility(pos) : null);
    const residents = s ? [...(s.conn.residents.latest?.items.values() ?? [])] : [];
    const mine = residents.find((r) => r.id === String(this.me.id));
    this.hud.draw({
      colorIndex: mine?.color ?? 0, level: s?.conn.me.level ?? 1, wallet: s?.conn.me.wallet ?? this.me.wallet,
      treasury: s?.conn.island.treasury ?? this.me.island.treasury, residents,
    }, width, height - HUD_HEIGHT);
    if (pos) this.follow(pos, width, height - HUD_HEIGHT);
  }

  /** 데드존 안에서는 가만히, 섬 경계에서 멈춤 (가로·세로) */
  private follow(p: { x: number; y: number }, viewW: number, viewH: number): void {
    const { w, h } = islandScreenSize();
    const { sx: tx, sy: ty } = project(p.x, p.y), target = { x: tx, y: ty };
    for (const axis of ['x', 'y'] as const) {
      const d = DEADZONE[axis];
      if (target[axis] > this.cam[axis] + d) this.cam[axis] = target[axis] - d;
      if (target[axis] < this.cam[axis] - d) this.cam[axis] = target[axis] + d;
    }
    const clamp = (v: number, lo: number, hi: number) => (hi < lo ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));
    const sx = clamp(this.cam.x - viewW / 2, 0, w - viewW), sy = clamp(this.cam.y - viewH / 2, 0, h - viewH);
    this.cameras.main.setScroll(Math.round(sx), Math.round(sy));
  }
}
