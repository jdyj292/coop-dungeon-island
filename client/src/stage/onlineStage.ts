// 온라인 무대 (?online=1): 서버 상태를 100ms 과거로 보간해 그리고, 이벤트·상태 변화로 연출·소리를 붙인다 (docs/network.md 8장)
// 내 캐릭터는 예측 상태로 바로 그리고 서버 패치마다 보정 (network.md 7장, net/localPlayer.ts)
import type Phaser from 'phaser';
import {
  COMBAT, MONSTERS, NET, playerStateName,
  type ActionDef, type Bounds, type Monster, type MonsterAttack, type PlayerState, type Projectile, type S2C, type ZoneArea,
} from '@game/shared';
import fx from '../../data/fx.json';
import { sfx } from '../audio/player';
import { actionSmear } from '../fx/actionSmear';
import { Afterimages } from '../fx/afterimage';
import { damageNumber } from '../fx/damageNumber';
import { HazardLayer } from '../fx/hazards';
import { hitPackage, type FxContext } from '../fx/hitPackage';
import { FxLayer } from '../fx/layer';
import { dust, ring } from '../fx/particles';
import { HitStop, Shake } from '../fx/timing';
import type { Connection } from '../net/connection';
import type { KeyInput } from '../net/inputSender';
import { LocalPlayer } from '../net/localPlayer';
import { mirrorMonster, mirrorPlayer } from '../net/mirror';
import { Transitions, type Cue } from '../net/transitions';
import { spriteData } from '../sprites/data';
import { project } from '../view/layout';
import { MonsterView, placeMonster } from '../view/monsterView';
import type { PartyMember } from '../ui/hudParty';
import { PlayerView } from '../view/playerView';
import { drawReviveGauges } from '../view/reviveGauge';

const FX_DEPTH = 5000;
const DISCONNECTED_ALPHA = 0.45;
const WEAPON = 'greatsword';

/** 몬스터 공격 id → 정의 (투사체·장판 그리기용) */
const ATTACKS = new Map<string, MonsterAttack>(Object.values(MONSTERS).flatMap((m) => m.attacks.map((a) => [a.id, a] as const)));

interface Remote {
  view: PlayerView;
  /** 플레이어 색 번호 (입장 순서) */
  colorIndex: number;
  ghosts: Afterimages;
  last: { x: number; y: number } | null;
}

export class OnlineStage {
  readonly fx: FxContext;
  /** 내 캐릭터 (HUD·카메라용, 아직 상태가 없으면 null) */
  me: PlayerState | null = null;
  /** 개인 콤보 (솔로 방) */
  combo = { count: 0, left: 0 };
  onClear: (() => void) | null = null;
  /** 한 판 끝 (정산 화면) */
  onResult: ((r: S2C['result']) => void) | null = null;
  /** 콤보 코인 보너스 달성 (비율) */
  onBonus: ((rate: number) => void) | null = null;
  onChat: ((m: S2C['chat']) => void) | null = null;
  private players = new Map<string, Remote>();
  private monsters = new Map<string, { m: Monster; view: MonsterView }>();
  private hazards: HazardLayer;
  private cues = new Transitions();
  private projectiles = new Map<number, { p: Projectile; t0: number; x0: number; endAt: number }>();
  private hits: S2C['hit'][] = [];
  private clock = 0;
  /** 내 캐릭터 (입력·예측·보정) */
  readonly local: LocalPlayer;
  private zones: ZoneArea[] = [];
  private reviveG: Phaser.GameObjects.Graphics;

  constructor(private scene: Phaser.Scene, readonly conn: Connection, bounds: Bounds) {
    this.fx = { layer: new FxLayer(scene, FX_DEPTH), stop: new HitStop(), shake: new Shake() };
    this.local = new LocalPlayer(conn, bounds, WEAPON);
    this.hazards = new HazardLayer(scene);
    this.reviveG = scene.add.graphics().setDepth(FX_DEPTH + 1);
    conn.onEvent = (type, msg) => this.onEvent(type, msg);
    conn.onSnapshot = () => this.local.reconcile();
  }

  /** 플레이어 색 번호 (입장 순서, 모르면 0) */
  colorOf(pid: string): number {
    return this.players.get(pid)?.colorIndex ?? 0;
  }

  /** 쓰러진 동료 (나 제외): 화면 위치와 부활 진행도 0~1 */
  downedAllies(): { pid: string; x: number; y: number; progress: number }[] {
    const latest = this.conn.players.latest?.items;
    const out: { pid: string; x: number; y: number; progress: number }[] = [];
    for (const [pid, r] of this.players) {
      const s = latest?.get(pid);
      if (pid !== this.conn.myId && s?.state === 'knocked' && r.last) out.push({ pid, ...r.last, progress: s.reviveProgress / 255 });
    }
    return out;
  }

  /** 보스 체력 비율·그로기 (보스가 없으면 null, 위쪽 보스 HP 바) */
  boss(): { ratio: number; groggy: boolean } | null {
    for (const m of this.conn.monsters.latest?.items.values() ?? []) {
      if (MONSTERS[m.type]?.rank === 'boss') return { ratio: m.hpRatio / 255, groggy: m.state === 'groggy' };
    }
    return null;
  }

  /** 내 플레이어 색 번호 (아래 HUD 얼굴) */
  get myColor(): number {
    return this.players.get(this.conn.myId)?.colorIndex ?? 0;
  }

  /** 파티원 프레임 (나 제외, 입장 순서). 접속 끊김은 M3에서 서버가 state 'disconnected'로 보낸다 */
  party(): PartyMember[] {
    const latest = this.conn.players.latest?.items;
    const out: PartyMember[] = [];
    for (const [id, r] of this.players) {
      const s = latest?.get(id);
      if (id === this.conn.myId || !s) continue;
      out.push({ id, colorIndex: r.colorIndex, hp: s.maxHp ? s.hp / s.maxHp : 0, down: s.state === 'knocked', disconnected: s.state === 'disconnected' });
    }
    return out;
  }

  /** 화면에 보일 콤보: 2인 이상이면 팀 콤보(서버 상태), 아니면 개인 콤보 (combat.md 7장) */
  get comboCount(): number {
    const live = this.conn.live;
    return (live.partySize ?? 1) >= 2 ? live.teamCombo ?? 0 : this.combo.count;
  }

  /** realDt = 실제 경과 초 */
  update(realDt: number, keys: KeyInput): void {
    const c = this.conn, now = c.clock.serverNow(), t = now - NET.interpDelayMs;
    this.clock += realDt;
    this.fx.shake.update(realDt);
    this.zones = this.zonesAt(t);
    const myMoved = this.local.step(realDt, keys, this.zones);
    this.combo.left = Math.max(0, this.combo.left - realDt);
    if (!this.combo.left) this.combo.count = 0;

    // 몬스터
    const ms = c.monsters.sample(t);
    for (const [id, s] of ms) {
      let e = this.monsters.get(id);
      const m = mirrorMonster(s, t, e?.m);
      if (!e) this.monsters.set(id, (e = { m, view: new MonsterView(this.scene) }));
      e.view.update(m, realDt);
      this.cues.monster(m, s.state, s.actionStart).forEach((q) => this.monsterCue(e!, q));
    }
    for (const [id, e] of this.monsters) {
      if (ms.has(id)) continue;
      e.view.destroy();
      this.monsters.delete(id);
      this.cues.forget(`m:${id}`);
    }

    // 플레이어 (색 번호는 서버가 정함: 섬 주민 순서)
    const ps = c.players.sample(t);
    for (const [id, s] of ps) {
      let r = this.players.get(id);
      if (!r) this.players.set(id, (r = { view: new PlayerView(this.scene, FX_DEPTH - 1, s.color), colorIndex: s.color, ghosts: new Afterimages(this.scene), last: null }));
      // 나 = 예측 상태 (화면 위치는 보정 오프셋 포함), 다른 사람 = 보간
      const mine = id === c.myId && !!this.local.predictor;
      const p = mine ? { ...this.local.predictor!.state, pos: this.local.predictor!.display } : mirrorPlayer(s, t, WEAPON, undefined, now);
      if (mine) this.me = this.local.predictor!.state;
      if (r.view.update(p, realDt)) this.dustAt(p.pos.x, p.pos.y, fx.dust.bounce);
      const cues = mine
        ? this.cues.player(id, p, playerStateName(p, myMoved ?? 0), this.local.predictor!.runStamp)
        : this.cues.player(id, p, s.state, s.actionStart);
      cues.forEach((q) => this.playerCue(r!, p, q, mine));
      const moved = mine ? myMoved : r.last ? Math.hypot(p.pos.x - r.last.x, p.pos.y - r.last.y) : 0;
      r.last = { x: p.pos.x, y: p.pos.y };
      r.view.draw(p, moved, 0, this.clock);
      // 접속이 끊긴 동료는 반투명 (network.md 10장)
      r.view.actor.img.setAlpha(s.state === 'disconnected' ? DISCONNECTED_ALPHA : 1);
      r.ghosts.update(realDt, !!p.backstep, r.view.actor.img);
    }
    for (const [id, r] of this.players) {
      if (ps.has(id)) continue;
      r.view.destroy();
      r.ghosts.clear();
      this.players.delete(id);
      this.cues.forget(`p:${id}`);
    }

    // 적중 연출은 그리는 시점이 서버 적중 시각에 닿을 때 (보간된 화면과 맞춤)
    this.hits = this.hits.filter((h) => (h.t <= t ? (this.playHit(h), false) : true));
    this.drawWorld(t, realDt);
    drawReviveGauges(this.reviveG, this.downedAllies());
  }

  private onEvent<K extends keyof S2C>(type: K, msg: S2C[K]): void {
    const now = this.conn.clock.serverNow();
    if (type === 'hit') this.hits.push(msg as S2C['hit']);
    else if (type === 'playerHit') {
      const m = msg as S2C['playerHit'], r = this.players.get(m.pid), pos = r?.last;
      sfx.play(m.strength === 'heavy' ? 'hitHeavy' : 'hitLight');
      if (r && pos) {
        r.view.flash = fx.flashFrames.light * fx.frame;
        const { sx, sy } = project(pos.x, pos.y);
        this.fx.layer.add(damageNumber(m.damage, sx, sy - fx.number.above, 'light', 'global.semantic.danger'));
      }
    } else if (type === 'combo') {
      const m = msg as S2C['combo'];
      if (m.pid === this.conn.myId) this.combo = { count: m.count, left: COMBAT.combo.windowSec };
    } else if (type === 'roomClear') {
      sfx.play('roomClear');
      this.onClear?.();
    } else if (type === 'projSpawn') {
      const m = msg as S2C['projSpawn'], def = ATTACKS.get(m.kind);
      if (def) this.projectiles.set(m.id, { p: { id: m.id, ownerId: m.owner, def, x: m.x, y: m.y, dir: m.dir, traveled: 0, done: false, hitPids: [] }, t0: m.t0, x0: m.x, endAt: Infinity });
    } else if (type === 'projEnd') {
      const pr = this.projectiles.get((msg as S2C['projEnd']).id);
      if (pr) pr.endAt = now;
    } else if (type === 'result') {
      this.onResult?.(msg as S2C['result']);
    } else if (type === 'reward') {
      sfx.play('coin');
    } else if (type === 'comboBonus') {
      this.onBonus?.((msg as S2C['comboBonus']).rate);
    } else if (type === 'chat') this.onChat?.(msg as S2C['chat']);
    else if (type === 'rejected') {
      this.local.predictor?.reject((msg as S2C['rejected']).seq);
    }
  }

  private playHit(h: S2C['hit']): void {
    const e = this.monsters.get(String(h.target)), attacker = this.players.get(h.attacker);
    const { sx, sy } = project(h.x, h.y, h.z);
    const [ax, ay] = fx.star.at as [number, number];
    const facing = attacker?.last && attacker.last.x > h.x ? -1 : 1;
    // 등급·적중 소리: 공격자가 지금 하는 행동의 데이터 (audio.md 3장)
    const def = this.cues.lastDef(`p:${h.attacker}`);
    if (e) e.view.hurt = e.m.body.armor ? 0 : fx.reaction.hurtSec;
    hitPackage(this.fx, def?.fx?.grade ?? 'light', e?.view ?? { flash: 0 }, { x: sx + ax * facing, y: sy + ay, numberX: sx, numberY: sy - fx.number.above }, h.damage);
    if (def?.sfx?.hit) sfx.play(def.sfx.hit);
    // 히트스톱 동기화: 내 공격이면 예측 중인 내 행동도 같은 시간 멈춤 (몬스터·다른 사람은 서버 데이터가 이미 멈춰 있다)
    if (h.attacker === this.conn.myId) this.local.predictor?.stop(h.hitstop);
  }

  private playerCue(r: Remote, p: PlayerState, q: Cue, mine: boolean): void {
    if (q.type === 'actionStart' && q.def.sfx?.windup) sfx.play(q.def.sfx.windup);
    if (q.type === 'actionActive') {
      if (q.def.sfx?.active) sfx.play(q.def.sfx.active);
      // 플레이어 cue의 def는 항상 플레이어 행동
      actionSmear(this.fx.layer, q.def as ActionDef, () => ({ ...project(p.pos.x, p.pos.y), facing: p.facing }));
    }
    if (q.type !== 'enter') return;
    if (q.state === 'backstep') sfx.play('backstep');
    if (q.state === 'run' && mine) sfx.play('dash');
    if (q.state === 'down') {
      this.dustAt(p.pos.x, p.pos.y, fx.dust.down);
      if (mine) this.fx.shake.start(fx.downShake.sec, fx.downShake.px);
    }
    if (q.from === 'down') r.view.onGetup();
  }

  private monsterCue(e: { m: Monster; view: MonsterView }, q: Cue): void {
    const b = e.m.body;
    if (q.type === 'actionStart' && q.def.sfx?.windup) sfx.play(q.def.sfx.windup);
    if (q.type === 'actionActive' && q.def.sfx?.active) sfx.play(q.def.sfx.active);
    if (q.type !== 'enter') return;
    if (q.state === 'down') {
      sfx.play('down');
      this.dustAt(b.x, b.y, fx.dust.down);
      const { sx, sy } = project(b.x, b.y);
      this.fx.layer.add(ring(sx, sy));
      this.fx.shake.start(fx.downShake.sec, fx.downShake.px);
    }
    if (q.state === 'groggy' || q.state === 'dizzy') {
      if (q.state === 'groggy') sfx.play('mon_bear_roar');
      this.dustAt(b.x, b.y, fx.dust.down);
      this.fx.shake.start(fx.downShake.sec, fx.downShake.px);
    }
  }

  private dustAt(x: number, y: number, kind: typeof fx.dust.down): void {
    const { sx, sy } = project(x, y);
    dust(sx, sy, kind).forEach((d) => this.fx.layer.add(d));
  }

  /** 시각 t의 장판 (상태 → 그리기·감속 판정용) */
  private zonesAt(t: number): ZoneArea[] {
    const zones: ZoneArea[] = [];
    this.conn.live.zones?.forEach((z) => {
      const def = ATTACKS.get(z.attackId)?.zone;
      if (def) zones.push({ id: Number(z.id), attackId: z.attackId, def, x: z.x, y: z.y, left: Math.max(0, (z.endsAt - t) / 1000) });
    });
    return zones;
  }

  /** 몬스터·투사체·장판·이펙트 그리기. t = 그리는 서버 시각 */
  private drawWorld(t: number, dt: number): void {
    const data = spriteData(), alive = [...this.monsters.values()];
    alive.forEach((e, i) => placeMonster(this.scene, e.view, data, e.m, this.clock, i));
    for (const [id, pr] of this.projectiles) {
      if (t >= pr.endAt) this.projectiles.delete(id);
      else pr.p.x = pr.x0 + pr.p.dir * pr.p.def.projectile!.speed * Math.max(0, (t - pr.t0) / 1000);
    }
    this.hazards.draw({ zones: this.zones, alive: alive.map((e) => e.m), projectiles: [...this.projectiles.values()].map((p) => p.p) });
    this.fx.layer.update(dt);
    this.fx.layer.draw();
  }
}
