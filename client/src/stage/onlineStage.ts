// 온라인 무대 (?online=1): 서버 상태를 100ms 과거로 보간해 그리고, 이벤트·상태 변화로 연출·소리를 붙인다 (docs/network.md 8장)
// 내 캐릭터는 예측 상태로 바로 그리고 서버 패치마다 보정 (network.md 7장, net/localPlayer.ts)
import type Phaser from 'phaser';
import {
  buildFrom, buildSkill, COMBAT, MONSTERS, NET, playerStateName, weaponDef,
  type Bounds, type Monster, type PlayerState, type S2C, type ZoneArea,
} from '@game/shared';
import fx from '../../data/fx.json';
import { sfx } from '../audio/player';
import { echoSound, shieldsRaised } from '../audio/sfxEvents';
import { Afterimages } from '../fx/afterimage';
import { damageNumber } from '../fx/damageNumber';
import { BoltLayer } from '../fx/boltLayer';
import { StatusLayer, type StatusView } from '../fx/statusFx';
import { HazardLayer } from '../fx/hazards';
import { ATTACKS, RemoteShots } from '../net/remoteShots';
import { monsterCue, playerCue } from './onlineCues';
import { castEcho } from '../fx/spellCast';
import { hitPackage, type FxContext } from '../fx/hitPackage';
import { FX_GROUND_DEPTH, FxLayer } from '../fx/layer';
import { dust } from '../fx/particles';
import { HitStop, Shake } from '../fx/timing';
import { SleepMarks } from '../fx/wellArrival';
import type { Connection } from '../net/connection';
import type { KeyInput } from '../net/inputSender';
import { LocalPlayer } from '../net/localPlayer';
import { mirrorMonster, mirrorPlayer } from '../net/mirror';
import { Transitions } from '../net/transitions';
import { spriteData } from '../sprites/data';
import { project } from '../view/layout';
import { MonsterView, placeMonster } from '../view/monsterView';
import type { PartyMember } from '../ui/hudParty';
import { DEFAULT_HAIR, hairOfLook, type Hair } from '../view/look';
import { PlayerView } from '../view/playerView';
import { drawReviveGauges } from '../view/reviveGauge';

const FX_DEPTH = 5000;
const DISCONNECTED_ALPHA = 0.45;

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
  onTalk: ((m: { type: 'chat'; msg: S2C['chat'] } | { type: 'emote'; msg: S2C['emote'] }) => void) | null = null;
  private players = new Map<string, Remote>();
  private monsters = new Map<string, { m: Monster; view: MonsterView }>();
  private hazards: HazardLayer;
  private cues = new Transitions();
  /** 몬스터 투사체·플레이어 마법탄 (이벤트로만 옴) */
  private shots = new RemoteShots();
  private boltLayer: BoltLayer;
  private status: StatusLayer;
  private statusViews: StatusView[] = [];
  private shielded = new Set<string>();
  private hits: S2C['hit'][] = [];
  private echoes: S2C['echo'][] = [];
  private clock = 0;
  /** 내 캐릭터 (입력·예측·보정) */
  readonly local: LocalPlayer;
  private zones: ZoneArea[] = [];
  private reviveG: Phaser.GameObjects.Graphics;
  /** 잠든 몬스터 Zzz (층 첫 방) */
  private sleepMarks: SleepMarks;

  constructor(private scene: Phaser.Scene, readonly conn: Connection, bounds: Bounds) {
    this.fx = { layer: new FxLayer(scene, FX_DEPTH), ground: new FxLayer(scene, FX_GROUND_DEPTH), stop: new HitStop(), shake: new Shake() };
    this.local = new LocalPlayer(conn, bounds);
    this.hazards = new HazardLayer(scene);
    this.boltLayer = new BoltLayer(scene);
    this.status = new StatusLayer(scene);
    this.reviveG = scene.add.graphics().setDepth(FX_DEPTH + 1);
    this.sleepMarks = new SleepMarks(scene, FX_DEPTH);
    conn.onEvent = (type, msg) => this.onEvent(type, msg);
    conn.onSnapshot = () => this.local.reconcile();
  }

  /** 플레이어 색 번호(입장 순서)·머리 (모르면 0·기본, 얼굴·대화 기록·정산 화면) */
  lookOf(pid: string): { color: number; hair: Hair } {
    const r = this.players.get(pid);
    return { color: r?.colorIndex ?? 0, hair: r?.view.hair ?? DEFAULT_HAIR };
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

  /** 보스 체력 비율·그로기·이름 (보스가 없으면 null, 위쪽 보스 HP 바·등장 띠) */
  boss(): { ratio: number; groggy: boolean; name: string } | null {
    for (const m of this.conn.monsters.latest?.items.values() ?? []) {
      const def = MONSTERS[m.type];
      if (def?.rank === 'boss') return { ratio: m.hpRatio / 255, groggy: m.state === 'groggy', name: def.name };
    }
    return null;
  }

  /** 플레이어 발 위치 (월드 화면 좌표, 던전 말풍선) */
  feet(): Map<string, { sx: number; sy: number }> {
    return new Map([...this.players].flatMap(([id, r]) => (r.last ? [[id, project(r.last.x, r.last.y)] as const] : [])));
  }

  /** 파티원 프레임 (나 제외, 입장 순서). 접속 끊김은 M3에서 서버가 state 'disconnected'로 보낸다 */
  party(): PartyMember[] {
    const latest = this.conn.players.latest?.items;
    const out: PartyMember[] = [];
    for (const [id, r] of this.players) {
      const s = latest?.get(id);
      if (id === this.conn.myId || !s) continue;
      out.push({ id, colorIndex: r.colorIndex, hair: r.view.hair, hp: s.maxHp ? s.hp / s.maxHp : 0, down: s.state === 'knocked', disconnected: s.state === 'disconnected' });
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
      this.cues.monster(m, s.state, s.actionStart).forEach((q) => monsterCue(this.fx, e!.m.body, q));
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
      r.view.hair = hairOfLook(s.look);
      const w = weaponDef(s.weapon);
      r.view.weaponVisual = w.visual;
      r.view.teleport = w.backstepStyle === 'teleport';
      // 나 = 예측 상태 (화면 위치는 보정 오프셋 포함), 다른 사람 = 보간
      const mine = id === c.myId && !!this.local.predictor;
      const p = mine ? { ...this.local.predictor!.state, pos: this.local.predictor!.display } : mirrorPlayer(s, t, s.weapon, undefined, now);
      if (mine) this.me = this.local.predictor!.state;
      if (r.view.update(p, realDt)) this.dustAt(p.pos.x, p.pos.y, fx.dust.bounce);
      // 우물에서 떨어져 착지: 먼지, 나면 흔들림·쿵
      if (r.view.justLanded) {
        this.dustAt(p.pos.x, p.pos.y, fx.dust.down);
        if (mine) {
          this.fx.shake.start(fx.downShake.sec, fx.downShake.px);
          sfx.play('wellLand');
        }
      }
      const cues = mine
        ? this.cues.player(id, p, playerStateName(p, myMoved ?? 0), this.local.predictor!.runStamp)
        : this.cues.player(id, p, s.state, s.actionStart);
      cues.forEach((q) => playerCue(this.fx, r!.view, p, q, mine, w));
      const moved = mine ? myMoved : r.last ? Math.hypot(p.pos.x - r.last.x, p.pos.y - r.last.y) : 0;
      r.last = { x: p.pos.x, y: p.pos.y };
      r.view.draw(p, moved, 0, this.clock);
      this.statusViews.push({ id, x: p.pos.x, y: p.pos.y, haste: !!s.hasted, shield: !!s.shielded });
      // 접속이 끊긴 동료는 반투명 (network.md 10장)
      r.view.actor.img.setAlpha(s.state === 'disconnected' ? DISCONNECTED_ALPHA : 1);
      r.ghosts.update(realDt, !!p.backstep && !r.view.teleport, r.view.actor.img);
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
    this.echoes = this.echoes.filter((e) => (e.t <= t ? (this.playEcho(e), false) : true));
    this.drawWorld(t, realDt);
    drawReviveGauges(this.reviveG, this.downedAllies());
  }

  private onEvent<K extends keyof S2C>(type: K, msg: S2C[K]): void {
    const now = this.conn.clock.serverNow();
    if (this.shots.on(type, msg, now)) return;
    if (type === 'hit') this.hits.push(msg as S2C['hit']);
    else if (type === 'echo') this.echoes.push(msg as S2C['echo']);
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
    } else if (type === 'result') this.onResult?.(msg as S2C['result']);
    else if (type === 'reward') sfx.play('coin');
    else if (type === 'comboBonus') this.onBonus?.((msg as S2C['comboBonus']).rate);
    else if (type === 'chat' || type === 'emote') this.onTalk?.({ type, msg } as Parameters<NonNullable<OnlineStage['onTalk']>>[0]);
    else if (type === 'rejected') this.local.predictor?.reject((msg as S2C['rejected']).seq);
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
    // 히트스톱 동기화: 내 공격이면 예측 중인 내 행동도 서버와 같은 시간(근접 역경직 포함) 멈춤 (몬스터·다른 사람은 서버 데이터가 이미 멈춰 있다)
    if (h.attacker === this.conn.myId) this.local.predictor?.stop(h.recoil, h.act, h.actT);
  }

  /** 변형 예약 판정: 그 사람의 노드로 스킬 정의를 찾아 로컬과 같은 연출·소리 */
  private playEcho(m: S2C['echo']): void {
    const snap = this.conn.players.latest?.items.get(m.pid);
    const def = buildSkill(weaponDef(snap?.weapon ?? 'greatsword'), buildFrom(snap?.skills ?? ''), m.act);
    if (!def) return;
    castEcho(this.fx, m.kind, def, { ...m, from: m.fx !== undefined && m.fy !== undefined ? { x: m.fx, y: m.fy } : undefined });
    echoSound(m.kind, def, m.look).forEach((n) => sfx.play(n));
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
    if (this.sleepMarks.draw(alive.map((e) => ({ m: e.m, v: e.view })), this.clock)) sfx.play('monWake');
    const shots = this.shots.at(t, this.fx.layer);
    this.boltLayer.draw(shots.bolts);
    this.hazards.draw({ zones: this.zones, alive: alive.map((e) => e.m), projectiles: shots.projectiles });
    this.status.draw(alive.map((e) => e.m), this.statusViews);
    if (shieldsRaised(this.shielded, new Set(this.statusViews.filter((v) => v.shield).map((v) => v.id)))) sfx.play('shield_up');
    this.statusViews = [];
    this.fx.layer.update(dt);
    this.fx.ground.update(dt);
    this.fx.ground.draw();
    this.fx.layer.draw();
  }
}
