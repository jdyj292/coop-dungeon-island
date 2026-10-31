import Phaser from 'phaser';
import { ITEMS, NET, nearFacility, type MeRes } from '@game/shared';
import { music } from '../audio/bgm/music';
import { sfx } from '../audio/player';
import fx from '../../data/fx.json';
import { api } from '../net/api';
import { IslandConnection } from '../net/islandNet';
import { colorInt } from '../palette';
import { spLeft } from '../stage/islandBadges';
import { IslandStage } from '../stage/islandStage';
import { SettingsPanel } from '../stage/settingsPanel';
import { done } from '../ui/firstVisit';
import { HudTip } from '../ui/hudTip';
import { IslandHud, type HudButton } from '../ui/islandHud';
import { koText } from '../ui/koText';
import { islandScreenSize, IslandWorld } from '../view/islandWorld';
import { HUD_HEIGHT, project } from '../view/layout';

/** 카메라: 내 캐릭터 몸 가운데(발에서 BODY_LIFT 위)가 화면 가운데에서 이만큼 벗어나면 따라감 (art.md 1장) */
const DEADZONE = { x: 40, y: 12 };
const BODY_LIFT = 10;
const NOTICE_MS = 2000;
/** 접속해 카메라를 내 캐릭터에 맞춘 뒤 밝아지는 시간 (접속 중에는 어둡게 가림) */
const ENTER_FADE_MS = 250;
/** 도움말 탭 번호 (settingsPanel) */
const HELP_TAB = 2;
/** 아래 띠 버튼 이름 (마우스 올림 이름표 첫 줄) */
const BUTTON_NAME: Record<HudButton, string> = { B: '섬 꾸미기 (B)', I: '가방 (I)', K: '스킬 (K)', M: '게시판 (M)' };
/** 구매 실패 이유 → 알림 */
const BUY_FAIL: Record<string, string> = { money: '코인이 모자랍니다', treasury: '공동 금고가 모자랍니다', unknown: '살 수 없는 품목입니다' };
const WELL_FAIL: Record<string, string> = { far: '우물 앞에서 합류할 수 있습니다', full: '파티가 가득 찼습니다 (최대 4명)', notHost: '대기를 시작한 사람만 출발할 수 있습니다', busy: '잠시 뒤 다시' };
/** 배치 실패 이유 → 알림 (서버 placeFail, shared canPlace) */
const PLACE_FAIL: Record<string, string> = {
  overlap: '이미 다른 장식이 있습니다', occupied: '사람이 서 있는 칸입니다', clearance: '비워 둬야 하는 칸입니다 (우물 주변·시설 앞)',
  facility: '시설 자리입니다', outside: '여기에는 놓을 수 없습니다', none: '가방에 없습니다', gone: '이미 없어진 장식입니다', unknown: '알 수 없는 장식입니다',
  fixed: '우물은 옮길 수 없습니다', entrance: '시설 입구(앞 한 줄)에 장식이 있습니다', facilityRemove: '시설은 치울 수 없습니다 (옮기기만)',
};

/**
 * 섬 씬 (docs/island.md, hud.md 4·8장): 섬 방에 접속해 주민과 함께 걷고, 꾸미고, 사고, 이야기하고, 우물에서 던전으로 출발한다
 * 조작: 방향키·WASD 이동(좌우 두 번 = 달리기), B 배치 모드, I 가방, K 스킬, M 게시판, E 잡화점·게시판·우물(앞에서), Enter 채팅, Esc 설정(도움말 탭), L 로그아웃 (개발 임시)
 * 아래 띠 B·I·K·M 클릭, 마우스를 올리면 이름표 (hud.md 8장)
 */
export class Island extends Phaser.Scene {
  private stage: IslandStage | null = null;
  private world!: IslandWorld;
  private hud!: IslandHud;
  private tip!: HudTip;
  /** 마우스가 올라가 있는 아래 띠 버튼 */
  private hover: HudButton | null = null;
  /** 설정 (Esc, 볼륨) */
  private settings!: SettingsPanel;
  private keys!: Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>;
  private me!: MeRes & { island: NonNullable<MeRes['island']> };
  private notice: Phaser.GameObjects.GameObject | null = null;
  private noticeTimer: Phaser.Time.TimerEvent | null = null;
  private cam = { x: 0, y: 0 };
  /** 다음 follow에서 데드존 없이 내 캐릭터를 화면 가운데로 (섬에 처음 들어올 때) */
  private snapCam = false;

  constructor() {
    super('Island');
  }

  create(): void {
    const me = this.registry.get('me') as MeRes | undefined;
    // 섬이 없으면 Title이 섬 고르기 화면을 보여 줌
    if (!me?.island) return void this.scene.start('Title');
    this.me = { ...me, island: me.island };
    this.stage = null;
    this.cameras.main.setBackgroundColor(colorInt('island.water'));
    // 접속해 내 위치를 받기 전에는 섬 왼쪽 위(스크롤 0,0)가 보이지 않게 가려 둔다 (follow에서 밝힘)
    this.cameras.main.fadeOut(0);
    this.world = new IslandWorld(this);
    this.hud = new IslandHud(this, 6000);
    this.tip = new HudTip(this, 6500);
    // 외형 탭: 내 주민 상태를 보이고, 바꾸면 look 메시지 (서버가 저장·상태 갱신)
    this.settings = new SettingsPanel(this, 6600, {
      get: () => {
        const r = this.stage?.conn.residents.latest?.items.get(String(this.me.id));
        return { hair: { style: r?.hair ?? 0, color: r?.hairColor ?? 0 }, color: r?.color ?? 0 };
      },
      set: (h) => this.stage?.conn.send('look', { hair: h.style, hairColor: h.color }),
    }, 'island');
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = this.input.keyboard!.addKeys({ up: K.UP, down: K.DOWN, left: K.LEFT, right: K.RIGHT, w: K.W, a: K.A, s: K.S, d: K.D }) as Island['keys'];
    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => this.onKey(e));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      this.hover = IslandHud.hitButton(p.x, p.y, this.bandTop(), this.scale.gameSize.width);
      this.stage?.place.onPointerMove({ x: p.worldX, y: p.worldY });
      this.stage?.panels.onPointerMove(p.x, p.y);
    });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onPointerDown(p));
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => this.stage?.panels.onPointerUp(p.x, p.y));
    this.events.once('shutdown', () => {
      this.settings.destroy();
      this.hud.destroy();
      this.tip.destroy();
      this.stage?.destroy();
      this.stage = null;
      this.input.keyboard!.off('keydown');
      this.input.off('pointermove');
      this.input.off('pointerdown');
      this.input.off('pointerup');
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
      conn.onJoinRequest = (m) => {
        this.showNotice(`${m.nickname}님이 입장을 신청했습니다 (게시판 주민 탭)`, NOTICE_MS * 2);
        this.stage?.panels.onJoinRequest();
      };
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
      this.snapCam = true;
      // 방금 가입: 외형부터 고르게 (art.md 3장)
      if (this.registry.get('chooseLook')) {
        this.registry.set('chooseLook', false);
        this.settings.show(1);
      }
    } catch (e) {
      console.warn('[island] 접속 실패', e);
      this.cameras.main.fadeIn(ENTER_FADE_MS);
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
      const toggle = { KeyI: 'bag', KeyK: 'skill', KeyM: 'board' }[e.code];
      return toggle === s.panels.open ? s.panels.close() : s.panels.onKey(e.code);
    }
    if (s.place.active) return e.code === 'KeyB' ? this.togglePlace() : s.place.onKey(e.code);
    // 도움말을 아직 안 봤으면 도움말 탭부터 (왼쪽 위 "Esc · 도움말" 안내)
    if (e.code === 'Escape' && !e.repeat) this.settings.show(done('helpSeen') ? 0 : HELP_TAB);
    else if (e.code === 'KeyB') this.togglePlace();
    else if (e.code === 'KeyI') s.panels.show('bag');
    else if (e.code === 'KeyK') s.panels.show('skill');
    else if (e.code === 'KeyM') s.panels.show('board');
    else if (e.code === 'Enter') s.chat.chat((text) => s.conn.send('chat', { text }));
    else if (/^Digit[1-4]$/.test(e.code)) s.conn.send('emote', { id: Number(e.code.slice(5)) });
    else if (e.code === 'KeyL') this.logout();
    else if (e.code === 'KeyE') {
      const near = nearFacility(s.myPos, s.conn.facilities);
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

  /** 설정 > 패널 > 배치 모드 > 아래 띠 B·I·K·M 버튼 */
  private onPointerDown(p: Phaser.Input.Pointer): void {
    const s = this.stage;
    if (this.settings.onPointer(p.x, p.y) || !s || s.chat.open || s.panels.onPointer(p.x, p.y)) return;
    if (s.place.active) return void s.place.onPointerDown({ x: p.x, y: p.y }, { x: p.worldX, y: p.worldY }, this.bandTop());
    const b = IslandHud.hitButton(p.x, p.y, this.bandTop(), this.scale.gameSize.width);
    if (b === 'B') this.togglePlace();
    else if (b === 'I') s.panels.show('bag');
    else if (b === 'K') s.panels.show('skill');
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
    if (s) this.world.setFacilities(s.conn.facilities, s.place.movingFacility?.id ?? null);
    const free = !!s && !placing && !s.panels.open && !s.busy;
    this.world.update(time, s && pos && free ? nearFacility(pos, s.conn.facilities) : null);
    const opened = ({ bag: 'I', skill: 'K', board: 'M' } as const)[s?.panels.open as 'bag'] ?? null;
    this.hud.draw({
      selected: opened ?? this.hover, hint: !done('helpSeen') && !this.settings.open, time: time / 1000, placing,
    }, width, height - HUD_HEIGHT);
    this.drawTip(width, height - HUD_HEIGHT);
    this.settings.update(width, height - HUD_HEIGHT);
    if (s) {
      s.panels.update(width, height - HUD_HEIGHT, height);
      s.chat.draw(s.time);
    }
    if (s && placing) {
      const cam = this.cameras.main;
      s.place.update(time / 1000, width, height - HUD_HEIGHT, { x: cam.scrollX, y: cam.scrollY, w: width, h: height - HUD_HEIGHT });
      if (!s.place.usingPointer) this.follow(s.place.focus, width, height - HUD_HEIGHT, true);
    } else if (pos) this.follow(pos, width, height - HUD_HEIGHT);
  }

  /** 아래 띠 버튼 마우스 올림 이름표: 이름 + 챙길 일(쓸 SP·입장 신청) (패널·설정·배치 모드 중에는 숨김) */
  private drawTip(width: number, bandTop: number): void {
    const s = this.stage, k = this.hover;
    if (!s || !k || s.panels.open || s.place.active || this.settings.open) return this.tip.show([], 0, 0, width);
    const sp = spLeft(s.conn), req = s.panels.pendingRequests;
    const why: Partial<Record<HudButton, string>> = { K: sp > 0 ? `쓸 SP ${sp}` : undefined, M: req > 0 ? `입장 신청 ${req}` : undefined };
    const at = IslandHud.buttonTop(k, bandTop, width);
    this.tip.show([BUTTON_NAME[k], ...(why[k] ? [why[k]!] : [])], at.x, at.y, width);
  }

  /** 데드존 안에서는 가만히, 섬 경계에서 멈춤 (가로·세로). screen = p가 이미 화면 좌표 (배치 커서) */
  private follow(p: { x: number; y: number }, viewW: number, viewH: number, screen = false): void {
    const { w, h } = islandScreenSize();
    const pr = project(p.x, p.y), target = screen ? { x: p.x, y: p.y } : { x: pr.sx, y: pr.sy - BODY_LIFT };
    if (this.snapCam && !screen) {
      // 내 주민이 상태에 들어오기 전 위치(0,0)로 맞추지 않게 기다렸다가, 맞춘 뒤 화면을 밝힌다
      if (!this.stage?.ready) return;
      this.cam = { ...target };
      this.snapCam = false;
      this.cameras.main.fadeIn(ENTER_FADE_MS);
    }
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
