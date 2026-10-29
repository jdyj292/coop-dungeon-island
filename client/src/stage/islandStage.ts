// 섬 진행 (클라이언트): 내 걷기 예측·보정, 다른 주민 보간, 주민 그림·이름, 놓인 장식·배치 모드 (docs/network.md 7·8장, hud.md 8장)
import type Phaser from 'phaser';
import { FixedStep, islandBounds, NET, newPlayerState, placementBlocks, TICK, type PlayerState, type Vec2 } from '@game/shared';
import type { IslandConnection, ResidentSnap } from '../net/islandNet';
import { InputSender, type KeyInput } from '../net/inputSender';
import { WalkPredictor } from '../net/walkPredict';
import { SpeechBubbles } from '../ui/chat';
import { koText, type KoText } from '../ui/koText';
import { DecorLayer } from '../view/decorLayer';
import { project } from '../view/layout';
import { PlayerView } from '../view/playerView';
import { ChatBar } from './chatBar';
import { IslandPanels } from './islandPanels';
import { PlaceMode } from './placeMode';
import { WellHops } from './wellHops';

/** 이름표: 발밑 위로 (캐릭터 키 17 + 여유) */
const NAME_ABOVE = 31;

interface Shown {
  view: PlayerView;
  name: KoText;
  /** 그리기용 상태 (위치·방향·달리기만 씀) */
  p: PlayerState;
  last: Vec2;
}

export class IslandStage {
  readonly predictor: WalkPredictor;
  private sender: InputSender;
  private ticks = new FixedStep();
  private sent = { x: 0, y: 0, run: false, seq: 0 };
  private shown = new Map<string, Shown>();
  private clock = 0;
  readonly decor: DecorLayer;
  readonly place: PlaceMode;
  readonly panels: IslandPanels;
  readonly chat: ChatBar;
  private bubbles: SpeechBubbles;
  /** 걷기 장애물을 만든 장식 목록 (바뀌면 다시) */
  private blocksSig = '';
  /** 우물로 뛰어들기·우물에서 튀어나오기 */
  private hops: WellHops;

  /** writeMemo = 게시판 메모 입력창 열기 (Scene) */
  constructor(private scene: Phaser.Scene, readonly conn: IslandConnection, writeMemo: () => void) {
    const mine = conn.residents.latest?.items.get(conn.userId);
    this.predictor = new WalkPredictor(islandBounds(), { x: mine?.x ?? 0, y: mine?.y ?? 0 });
    this.sender = new InputSender(conn);
    this.decor = new DecorLayer(scene);
    this.place = new PlaceMode(scene, conn, (id) => this.nameOf(id), 6100);
    this.panels = new IslandPanels(scene, conn, 6500, writeMemo);
    this.chat = new ChatBar(scene, 6050, false);
    this.bubbles = new SpeechBubbles(scene, 4600);
    this.hops = new WellHops(scene, 4400);
    conn.onChat = (m) => {
      const r = conn.residents.latest?.items.get(m.player);
      this.chat.push({ name: r?.name ?? '?', color: r?.color ?? 0, text: m.text }, this.clock);
      this.bubbles.say(m.player, m.text, this.clock);
    };
    conn.onEmote = (m) => this.bubbles.emote(m.player, m.id, this.clock);
    conn.onSnapshot = () => this.reconcile();
    conn.onRejoined = () => {
      // 다시 들어가면 서버가 새 자리를 준다: 첫 스냅샷에서 바로 맞춤
      this.sent.seq = 0;
    };
  }

  /** 주민 이름 (users.id 문자열) */
  nameOf(userId: string): string {
    return this.conn.residents.latest?.items.get(userId)?.name ?? '?';
  }

  /** 게임 시간 (초, 채팅 표시) */
  get time(): number {
    return this.clock;
  }

  /** 내 위치 (화면) */
  get myPos(): Vec2 {
    return this.predictor.display;
  }

  /** 우물로 뛰어들기 시작 (지금 보이는 자리에서, 출발 depart를 받은 본인) */
  hopIntoWell(id: string): void {
    const s = this.shown.get(id), r = this.conn.residents.latest?.items.get(id);
    if (s && r) this.hops.jump(id, s.last, r);
  }

  /** 내가 뛰어들거나 튀어나오는 중 (걷기·상호작용 멈춤) */
  get busy(): boolean {
    return this.hops.has(this.conn.userId);
  }

  private reconcile(): void {
    const me = this.conn.residents.latest?.items.get(this.conn.userId);
    if (me) this.predictor.reconcile({ x: me.x, y: me.y }, me.lastInputSeq, TICK);
  }

  /** 프레임마다. keys = 방향 입력 (패널이 열려 있으면 0) */
  update(dt: number, keys: { x: number; y: number }): void {
    this.clock += dt;
    this.syncDecor();
    const k: KeyInput = { x: keys.x, y: keys.y, attack: false, skill: null, backstep: false, potion: null };
    const s = this.sender.update(k, dt, null);
    this.sent = { x: s.x, y: s.y, run: s.run, seq: s.seq };
    const ticks = this.ticks.advance(dt);
    for (let n = ticks; n > 0; n--) this.predictor.tick({ mx: this.sent.x, my: this.sent.y, run: this.sent.run }, TICK, this.sent.seq);
    const others = this.conn.residents.sample(this.conn.clock.serverNow() - NET.interpDelayMs);
    const seen = new Set<string>();
    for (const [id, r] of others) {
      if (!r.online) {
        // 던전으로 떠난 주민: 보이던 자리에서 우물로 뛰어든다
        const s = this.shown.get(id);
        if (s && r.status.startsWith('dungeon:')) this.hops.jump(id, s.last, r);
        continue;
      }
      seen.add(id);
      const mine = id === this.conn.userId;
      const w = this.predictor.state;
      // 나: 틱이 안 돈 프레임은 걷기 박자 유지 (화면 주사율 > 60Hz에서 박자가 0으로 돌아가 다리가 떨리지 않게)
      this.draw(id, r, mine ? { ...this.predictor.display, facing: w.facing, running: w.run.running } : { x: r.x, y: r.y, facing: r.facing, running: r.state === 'run' }, dt, mine && ticks === 0);
    }
    // 뛰어드는 주민은 서버 목록에서 빠져도 끝까지 그린다.
    // 아직 목록에 있는 주민(던전으로 넘어가는 중인 본인)은 지우지 않는다: 지우면 뛰어들기 전 자리에 다시 보인다
    for (const [id, r, from] of this.hops.leftover()) {
      if (seen.has(id)) continue;
      this.hops.forget(id);
      if (!this.hops.has(id)) continue;
      seen.add(id);
      this.draw(id, r, { ...from, facing: r.facing, running: false }, dt);
    }
    this.hops.update(dt);
    for (const [id, s] of this.shown) {
      if (seen.has(id)) continue;
      this.bubbles.remove(id);
      s.view.destroy();
      s.name.destroy();
      this.shown.delete(id);
    }
  }

  /** 놓인 장식 그리기 + 걷기 장애물 갱신 (서버와 같은 placementBlocks + 옮긴 시설) */
  private syncDecor(): void {
    const list = this.conn.placements, facs = this.conn.facilities;
    this.decor.sync(list, this.clock, this.place.moving?.id ?? null);
    const sig = [...list.map((p) => `${p.id}:${p.itemId}:${p.x}:${p.y}:${p.rot}`), ...facs.map((f) => `${f.id}:${f.x}:${f.y}`)].join('|');
    if (sig !== this.blocksSig) {
      this.blocksSig = sig;
      this.predictor.setBounds(islandBounds(placementBlocks(list), facs));
    }
  }

  private draw(id: string, r: ResidentSnap, at: Vec2 & { facing: number; running: boolean }, dt: number, holdBeat = false): void {
    // 처음 보이는 주민이 방금 던전에서 돌아왔으면 우물에서 튀어나와 제자리에 착지
    if (!this.shown.has(id)) this.hops.maybePop(id, r, at, this.conn.clock.serverNow());
    const hop = this.hops.step(id, dt);
    if (hop) at = { ...at, x: hop.x, y: hop.y, running: false };
    let s = this.shown.get(id);
    if (!s) {
      s = {
        view: new PlayerView(this.scene, 0, r.color, false),
        name: koText(this.scene, 0, 0, r.name, { font: 'koSmall', color: 'global.fx.flash', outline: 'four', align: 'center' }).setDepth(4500),
        p: newPlayerState({ x: at.x, y: at.y }),
        last: { x: at.x, y: at.y },
      };
      this.shown.set(id, s);
    }
    const moved = holdBeat ? null : Math.hypot(at.x - s.last.x, at.y - s.last.y);
    s.last = { x: at.x, y: at.y };
    s.p.pos = { x: at.x, y: at.y };
    s.p.facing = at.facing;
    s.p.run.running = at.running;
    s.view.hair = { style: r.hair, color: r.hairColor };
    // 공중이면 우물 앞에, 구멍 속이면 우물 뒤에 (구멍·앞 테두리가 가림)
    s.view.lift = hop?.z ?? 0;
    s.view.motionOverride = hop?.motion;
    s.view.hidden = !!hop?.hidden;
    s.view.depthOverride = hop?.depth;
    s.name.setVisible(!hop);
    // dt를 넘겨야 돌아서기(turn) 같은 시간 모션이 끝난다 (0이면 돌아선 뒤 다리가 멈춤)
    s.view.update(s.p, dt);
    s.view.draw(s.p, moved, 0, this.clock);
    const { sx, sy } = project(at.x, at.y);
    s.name.moveTo(sx, sy - NAME_ABOVE);
    this.bubbles.draw(id, sx, sy - NAME_ABOVE - 1, this.clock);
  }

  destroy(): void {
    for (const s of this.shown.values()) {
      s.view.destroy();
      s.name.destroy();
    }
    this.shown.clear();
    this.decor.destroy();
    this.place.exit();
    this.panels.destroy();
    this.chat.destroy();
    this.bubbles.destroy();
    this.hops.destroy();
    this.conn.leave();
  }
}
