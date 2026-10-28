import Phaser from 'phaser';
import { ITEMS, NET, nearFacility, type MeRes } from '@game/shared';
import { music } from '../audio/bgm/music';
import { sfx } from '../audio/player';
import fx from '../../data/fx.json';
import { api } from '../net/api';
import { IslandConnection } from '../net/islandNet';
import { colorInt } from '../palette';
import { IslandStage } from '../stage/islandStage';
import { SettingsPanel } from '../stage/settingsPanel';
import { IslandHud } from '../ui/islandHud';
import { koText } from '../ui/koText';
import { islandScreenSize, IslandWorld } from '../view/islandWorld';
import { HUD_HEIGHT, project } from '../view/layout';

/** 카메라: 내 캐릭터 몸 가운데(발에서 BODY_LIFT 위)가 화면 가운데에서 이만큼 벗어나면 따라감 (art.md 1장) */
const DEADZONE = { x: 40, y: 12 };
const BODY_LIFT = 10;
const NOTICE_MS = 2000;
/** 구매 실패 이유 → 알림 */
const BUY_FAIL: Record<string, string> = { money: '코인이 모자랍니다', treasury: '공동 금고가 모자랍니다', unknown: '살 수 없는 품목입니다' };
const WELL_FAIL: Record<string, string> = { far: '우물 앞에서 합류할 수 있습니다', full: '파티가 가득 찼습니다 (최대 4명)', notHost: '대기를 시작한 사람만 출발할 수 있습니다', busy: '잠시 뒤 다시' };
/** 배치 실패 이유 → 알림 (서버 placeFail, shared canPlace) */
const PLACE_FAIL: Record<string, string> = {
  overlap: '이미 다른 장식이 있습니다', occupied: '사람이 서 있는 칸입니다', clearance: '비워 둬야 하는 칸입니다 (우물 주변·시설 앞)',
  facility: '시설 자리입니다', outside: '여기에는 놓을 수 없습니다', none: '가방에 없습니다', gone: '이미 없어진 장식입니다', unknown: '알 수 없는 장식입니다',
};

/**
 * 섬 씬 (docs/island.md, hud.md 4·8장): 섬 방에 접속해 주민과 함께 걷고, 꾸미고, 사고, 이야기하고, 우물에서 던전으로 출발한다
 * 조작: 방향키·WASD 이동(좌우 두 번 = 달리기), B 배치 모드, I 가방, M 게시판, E 잡화점·게시판·우물(앞에서), Enter 채팅, L 로그아웃 (개발 임시)
 */
export class Island extends Phaser.Scene {
  private stage: IslandStage | null = null;
  private world!: IslandWorld;
  private hud!: IslandHud;
  /** 설정 (Esc, 볼륨) */
  private settings!: SettingsPanel;
  private keys!: Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>;
  private me!: MeRes;
  private notice: Phaser.GameObjects.GameObject | null = null;
  private noticeTimer: Phaser.Time.TimerEvent | null = null;
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
    // 외형 탭: 내 주민 상태를 보이고, 바꾸면 look 메시지 (서버가 저장·상태 갱신)
    this.settings = new SettingsPanel(this, 6600, {
      get: () => {
        const r = this.stage?.conn.residents.latest?.items.get(String(this.me.id));
        return { hair: { style: r?.hair ?? 0, color: r?.hairColor ?? 0 }, color: r?.color ?? 0 };
      },
      set: (h) => this.stage?.conn.send('look', { hair: h.style, hairColor: h.color }),
    });
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = this.input.keyboard!.addKeys({ up: K.UP, down: K.DOWN, left: K.LEFT, right: K.RIGHT, w: K.W, a: K.A, s: K.S, d: K.D }) as typeof this.keys;
    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => this.onKey(e));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.stage?.place.onPointerMove({ x: p.worldX, y: p.worldY }));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onPointerDown(p));
    this.events.once('shutdown', () => {
      this.settings.destroy();
      this.stage?.destroy();
      this.stage = null;
      this.input.keyboard!.off('keydown');
      this.input.off('pointermove');
      this.input.off('pointerdown');
    });
    music.play('island');
    void this.connect();
  }

  private async connect(): Promise<void> {
    try {
      const conn = await IslandConnection.join(this.me.island.id, String(this.me.id));
      if (!this.scene.isActive()) return conn.leave();
      this.stage = new IslandStage(this, conn, () => this.stage?.chat.input('게시판 메모 한 줄', NET.memoMaxLen, (text) => conn.send('memo', { text })));
      conn.onPlaceFail = (m) => this.showNotice(PLACE_FAIL[m.reason] ?? m.reason, NOTICE_MS);
      conn.onWellFail = (m) => this.showNotice(WELL_FAIL[m.reason] ?? m.reason, NOTICE_MS);
      // 우물 출발: 섬 방을 나가 던전 방으로 (network.md 3장), 정산 뒤 Dungeon 씬이 섬으로 돌려보냄
      conn.onDepart = (m) => {
        this.registry.set('dungeonRoom', m.roomId);
        this.registry.set('weapon', conn.residents.latest?.items.get(String(this.me.id))?.weapon ?? 'greatsword');
        if (!this.stage) return void this.scene.start('Dungeon');
        // 우물로 뛰어들고 어두워진 뒤 던전으로 (art.md 0장)
        this.stage.panels.close();
        this.stage.hopIntoWell(String(this.me.id));
        sfx.play('wellJump');
        this.time.delayedCall(fx.wellHop.jumpSec * 1000, () => {
          this.cameras.main.fadeOut(fx.wellHop.fadeSec * 1000, 0, 0, 0);
          this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Dungeon'));
        });
      };
      conn.onBuy = (m) => {
        const name = ITEMS.decorations[m.itemId]?.name ?? ITEMS.consumables[m.itemId]?.name ?? m.itemId;
        this.showNotice(m.ok ? `${name} ${m.count}개를 샀습니다` : BUY_FAIL[m.reason ?? 'unknown'] ?? '살 수 없습니다', NOTICE_MS);
      };
      const p = this.stage.myPos;
      this.cam = { x: p.x, y: p.y };
      // 방금 가입: 외형부터 고르게 (art.md 3장)
      if (this.registry.get('chooseLook')) {
        this.registry.set('chooseLook', false);
        this.settings.show(1);
      }
    } catch (e) {
      console.warn('[island] 접속 실패', e);
      this.showNotice('섬에 들어갈 수 없습니다 (서버 확인)');
    }
  }

  private bandTop(): number {
    return this.scale.gameSize.height - HUD_HEIGHT;
  }

  /** 키: 입력창 > 설정 > 패널 > 배치 모드 > 걷는 중 단축키 순서 (Esc: 열린 것 닫기, 없으면 설정) */
  private onKey(e: KeyboardEvent): void {
    const s = this.stage;
    // 꾹 누를 때 반복은 커서 이동(방향키·WASD)만: 놓기·회전·치우기·사기가 연달아 되지 않게
    if (this.stage?.chat.open || (e.repeat && !/^(Arrow|Key[WASD]$)/.test(e.code))) return;
    if (this.settings.open) return this.settings.onKey(e.code);
    if (!s) return void (e.code === 'KeyL' && this.logout());
    // 우물로 뛰어들거나 튀어나오는 중에는 단축키도 멈춤
    if (s.busy) return;
    if (s.panels.open) {
      const toggle = { KeyI: 'bag', KeyM: 'board' }[e.code];
      return toggle === s.panels.open ? s.panels.close() : s.panels.onKey(e.code);
    }
    if (s.place.active) return e.code === 'KeyB' ? this.togglePlace() : s.place.onKey(e.code);
    if (e.code === 'Escape' && !e.repeat) this.settings.show();
    else if (e.code === 'KeyB') this.togglePlace();
    else if (e.code === 'KeyI') s.panels.show('bag');
    else if (e.code === 'KeyM') s.panels.show('board');
    else if (e.code === 'Enter') s.chat.chat((text) => s.conn.send('chat', { text }));
    else if (/^Digit[1-4]$/.test(e.code)) s.conn.send('emote', { id: Number(e.code.slice(5)) });
    else if (e.code === 'KeyL') this.logout();
    else if (e.code === 'KeyE') {
      const near = nearFacility(s.myPos);
      if (near === 'shop') s.panels.show('shop');
      else if (near === 'board') s.panels.show('board');
      else if (near === 'well') {
        if (!s.conn.well.members.includes(s.conn.userId)) s.conn.send('well', { op: 'join' });
        s.panels.show('well');
      }
    }
  }


  private togglePlace(): void {
    const s = this.stage;
    if (!s) return;
    if (s.place.active) s.place.exit();
    else s.place.enter(s.myPos);
  }

  /** 설정 > 패널 > 배치 모드 > 아래 띠 B·I·M 버튼 */
  private onPointerDown(p: Phaser.Input.Pointer): void {
    const s = this.stage;
    if (this.settings.onPointer(p.x, p.y) || !s || s.chat.open || s.panels.onPointer(p.x, p.y)) return;
    if (s.place.active) return void s.place.onPointerDown({ x: p.x, y: p.y }, { x: p.worldX, y: p.worldY }, this.bandTop());
    const b = IslandHud.hitButton(p.x, p.y, this.bandTop());
    if (b === 'B') this.togglePlace();
    else if (b === 'I') s.panels.show('bag');
    else if (b === 'M') s.panels.show('board');
  }

  private logout(): void {
    void api.logout().then(() => {
      this.registry.remove('me');
      this.scene.start('Title');
    });
  }

  /** 화면 위쪽 알림. ms를 주면 그만큼 뒤 사라짐 */
  private showNotice(text: string, ms?: number): void {
    this.notice?.destroy();
    this.noticeTimer?.remove();
    this.notice = koText(this, Math.round(this.scale.width / 2), 30, text, { color: 'global.fx.flash', outline: 'four', align: 'center' }).setScrollFactor(0).setDepth(7000);
    if (ms) this.noticeTimer = this.time.delayedCall(ms, () => { this.notice?.destroy(); this.notice = null; });
  }

  update(time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, 0.1);
    const k = this.keys, s = this.stage;
    // 배치 모드·패널·설정·입력창 동안 캐릭터는 서 있음 (방향키는 커서·목록)
    const walk = !s?.place.active && !s?.panels.open && !s?.chat.open && !this.settings.open && !s?.busy;
    const x = walk ? (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0) : 0;
    const y = walk ? (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0) : 0;
    const { width, height } = this.scale.gameSize;
    if (s) {
      s.update(dt, { x, y });
      if (s.conn.status === 'replaced') this.showNotice('다른 곳에서 접속해 연결을 끊었습니다');
    }
    const pos = s?.myPos ?? null;
    const placing = !!s?.place.active;
    this.world.update(time, pos && !placing && !s?.panels.open && !s?.busy ? nearFacility(pos) : null);
    const residents = s ? [...(s.conn.residents.latest?.items.values() ?? [])] : [];
    const mine = residents.find((r) => r.id === String(this.me.id));
    this.hud.draw({
      colorIndex: mine?.color ?? 0, hair: { style: mine?.hair ?? 0, color: mine?.hairColor ?? 0 }, level: s?.conn.me.level ?? 1, wallet: s?.conn.me.wallet ?? this.me.wallet,
      treasury: s?.conn.island.treasury ?? this.me.island.treasury, residents, placing,
    }, width, height - HUD_HEIGHT);
    this.settings.update(width, height - HUD_HEIGHT);
    if (s) {
      s.panels.update(width, height - HUD_HEIGHT);
      s.chat.draw(s.time);
    }
    if (s && placing) {
      const cam = this.cameras.main;
      s.place.update(time / 1000, width, height - HUD_HEIGHT, { x: cam.scrollX, y: cam.scrollY, w: width, h: height - HUD_HEIGHT });
      if (!s.place.usingPointer) this.follow(s.place.focus, width, height - HUD_HEIGHT, true);
    } else if (pos) this.follow(pos, width, height - HUD_HEIGHT);
  }

  /** 데드존 안에서는 가만히, 섬 경계에서 멈춤 (가로·세로). screen = p가 이미 화면 좌표 (배치 커서) */
  private follow(p: { x: number; y: number }, viewW: number, viewH: number, screen = false): void {
    const { w, h } = islandScreenSize();
    const pr = project(p.x, p.y), target = screen ? { x: p.x, y: p.y } : { x: pr.sx, y: pr.sy - BODY_LIFT };
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
