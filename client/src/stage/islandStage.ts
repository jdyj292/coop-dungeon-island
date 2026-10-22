// 섬 진행 (클라이언트): 내 걷기 예측·보정, 다른 주민 보간, 주민 그림·이름 (docs/network.md 7·8장, hud.md 8장 월드 표시)
import type Phaser from 'phaser';
import { FixedStep, islandBounds, NET, newPlayerState, TICK, type PlayerState, type Vec2 } from '@game/shared';
import type { IslandConnection, ResidentSnap } from '../net/islandNet';
import { InputSender, type KeyInput } from '../net/inputSender';
import { WalkPredictor } from '../net/walkPredict';
import { koText, type KoText } from '../ui/koText';
import { project } from '../view/layout';
import { PlayerView } from '../view/playerView';

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

  constructor(private scene: Phaser.Scene, readonly conn: IslandConnection) {
    const mine = conn.residents.latest?.items.get(conn.userId);
    this.predictor = new WalkPredictor(islandBounds(), { x: mine?.x ?? 0, y: mine?.y ?? 0 });
    this.sender = new InputSender(conn);
    conn.onSnapshot = () => this.reconcile();
    conn.onRejoined = () => {
      // 다시 들어가면 서버가 새 자리를 준다: 첫 스냅샷에서 바로 맞춤
      this.sent.seq = 0;
    };
  }

  /** 내 위치 (화면) */
  get myPos(): Vec2 {
    return this.predictor.display;
  }

  private reconcile(): void {
    const me = this.conn.residents.latest?.items.get(this.conn.userId);
    if (me) this.predictor.reconcile({ x: me.x, y: me.y }, me.lastInputSeq, TICK);
  }

  /** 프레임마다. keys = 방향 입력 (패널이 열려 있으면 0) */
  update(dt: number, keys: { x: number; y: number }): void {
    this.clock += dt;
    const k: KeyInput = { x: keys.x, y: keys.y, attack: false, skill: null, backstep: false, potion: null };
    const s = this.sender.update(k, dt, null);
    this.sent = { x: s.x, y: s.y, run: s.run, seq: s.seq };
    for (let n = this.ticks.advance(dt); n > 0; n--) this.predictor.tick({ mx: this.sent.x, my: this.sent.y, run: this.sent.run }, TICK, this.sent.seq);
    const others = this.conn.residents.sample(this.conn.clock.serverNow() - NET.interpDelayMs);
    const seen = new Set<string>();
    for (const [id, r] of others) {
      if (!r.online) continue;
      seen.add(id);
      const mine = id === this.conn.userId;
      const w = this.predictor.state;
      this.draw(id, r, mine ? { ...this.predictor.display, facing: w.facing, running: w.run.running } : { x: r.x, y: r.y, facing: r.facing, running: r.state === 'run' });
    }
    for (const [id, s] of this.shown) {
      if (seen.has(id)) continue;
      s.view.destroy();
      s.name.destroy();
      this.shown.delete(id);
    }
  }

  private draw(id: string, r: ResidentSnap, at: Vec2 & { facing: number; running: boolean }): void {
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
    const moved = Math.hypot(at.x - s.last.x, at.y - s.last.y);
    s.last = { x: at.x, y: at.y };
    s.p.pos = { x: at.x, y: at.y };
    s.p.facing = at.facing;
    s.p.run.running = at.running;
    s.view.update(s.p, 0);
    s.view.draw(s.p, moved, 0, this.clock);
    const { sx, sy } = project(at.x, at.y);
    s.name.moveTo(sx, sy - NAME_ABOVE);
  }

  destroy(): void {
    for (const s of this.shown.values()) {
      s.view.destroy();
      s.name.destroy();
    }
    this.shown.clear();
    this.conn.leave();
  }
}
