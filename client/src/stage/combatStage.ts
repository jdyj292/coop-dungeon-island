// 로컬 전투 무대: RoomSim(shared)을 1/60초 틱으로 돌리고, 이벤트로 연출을 붙이고, 그린다. 던전 씬과 tools/motion-preview가 같이 쓴다
import type Phaser from 'phaser';
import {
  arriveSecOf, FixedStep, RoomSim, TICK, weaponDef,
  type ActionDef, type Bounds, type Monster, type PlayerState, type PotionKind, type RoomDef, type SimEvent, type SimOptions, type Spawn,
  type Vec2, type WeaponDef,
} from '@game/shared';
import fx from '../../data/fx.json';
import { sfx } from '../audio/player';
import { soundsFor } from '../audio/sfxEvents';
import { actionSmear } from '../fx/actionSmear';
import { Afterimages } from '../fx/afterimage';
import { damageNumber } from '../fx/damageNumber';
import { BoltLayer } from '../fx/boltLayer';
import { HazardLayer } from '../fx/hazards';
import { hitPackage, type FxContext } from '../fx/hitPackage';
import { FxLayer } from '../fx/layer';
import { dust, ring } from '../fx/particles';
import { Rhythm } from '../fx/rhythm';
import { SleepMarks } from '../fx/wellArrival';
import { boltFizzle, boltHit, teleportPuff } from '../fx/spell';
import { castActive, castStart } from '../fx/spellCast';
import { HitStop, Shake } from '../fx/timing';
import { spriteData } from '../sprites/data';
import { PlayerView } from '../view/playerView';
import { project } from '../view/layout';
import { MonsterView, placeMonster } from '../view/monsterView';

/** 이펙트는 캐릭터 위, HUD 아래 */
const FX_DEPTH = 5000;

export interface StageInput {
  x: number;
  y: number;
  attack: boolean;
  skill: ActionDef | null;
  backstep: boolean;
  potion: PotionKind | null;
}

type Presses = Pick<StageInput, 'attack' | 'skill' | 'backstep' | 'potion'>;
const NO_PRESS: Presses = { attack: false, skill: null, backstep: false, potion: null };
export const NO_INPUT: StageInput = { x: 0, y: 0, ...NO_PRESS };

export class CombatStage {
  sim: RoomSim;
  readonly fx: FxContext;
  readonly rhythm = new Rhythm();
  private playerView: PlayerView;
  private views = new Map<number, MonsterView>();
  private hazards: HazardLayer;
  private ghosts: Afterimages;
  /** 게임 시간 누적 (대기 순환·떨림용, 히트스톱·슬로우를 따른다) */
  private clock = 0;
  /** 1/60초 고정 틱 (docs/network.md 12장) */
  private ticks = new FixedStep();
  /** 틱이 돌기 전에 들어온 누름 입력을 다음 틱까지 보관 */
  private pending: Presses = { ...NO_PRESS };
  /** 지난 그리기 이후 흐른 게임 시간 (잔상용) */
  private drawDt = 0;
  /** 전멸(깃털 없이 HP 0) 때 한 번 불림 */
  onWipe: (() => void) | null = null;
  /** 효과음 재생 (도구에서 끌 수 있게) */
  sound: (name: string) => void = (name) => { sfx.play(name); };
  /** 달리기 시작 소리용 */
  private wasRunning = false;
  private wasBackstep = false;
  private bolts: BoltLayer;
  /** 잠든 몬스터 Zzz (층 첫 방) */
  private sleepMarks: SleepMarks;

  constructor(private scene: Phaser.Scene, readonly bounds: Bounds, player: Vec2, spawns: Spawn[], readonly opts: SimOptions = {}, readonly weapon: WeaponDef = weaponDef('greatsword')) {
    this.sim = new RoomSim(this.weapon, bounds, player, opts);
    this.sim.spawn(spawns);
    this.playerView = new PlayerView(scene, FX_DEPTH - 1);
    this.playerView.weaponVisual = this.weapon.visual;
    this.playerView.teleport = this.weapon.backstepStyle === 'teleport';
    this.bolts = new BoltLayer(scene);
    this.fx = { layer: new FxLayer(scene, FX_DEPTH), stop: new HitStop(), shake: new Shake() };
    this.hazards = new HazardLayer(scene);
    this.ghosts = new Afterimages(scene);
    this.sleepMarks = new SleepMarks(scene, FX_DEPTH);
  }

  /** 방 규칙 (rooms.json): 층 첫 방은 우물에서 떨어져 들어오고 몬스터는 잠든 채 (dungeon.md 2·5장, 서버 dungeonGame과 같음) */
  enterRoom(room: RoomDef): void {
    this.player.arrive = arriveSecOf(room);
    if (room.wakeSec) this.sim.sleepAll(room.wakeSec);
  }

  get player(): PlayerState {
    return this.sim.player;
  }

  /** 퇴장하지 않은 몬스터 */
  get monsters(): Monster[] {
    return this.sim.alive;
  }

  spawn(list: Spawn[]): void {
    this.sim.spawn(list);
  }

  /** 처음 자리로 되돌린다 (연출 반복 재생용) */
  reset(player: Vec2, spawns: Spawn[]): void {
    this.views.forEach((v) => v.destroy());
    this.views.clear();
    this.sim = new RoomSim(this.weapon, this.bounds, player, this.opts);
    this.sim.spawn(spawns);
    this.rhythm.offset = 0;
    this.fx.layer.clear();
    this.fx.stop.clear();
    this.fx.shake.clear();
    this.ghosts.clear();
    this.ticks.reset();
    this.pending = { ...NO_PRESS };
  }

  /** realDt = 실제 경과 시간 (슬로우는 호출하는 쪽에서 곱함). 1/60초 틱으로 나눠 진행하고 한 번 그린다 */
  update(realDt: number, input: StageInput): void {
    this.pending.attack ||= input.attack;
    this.pending.skill ??= input.skill;
    this.pending.backstep ||= input.backstep;
    this.pending.potion ??= input.potion;
    const n = this.ticks.advance(realDt);
    let moved = 0;
    for (let i = 0; i < n; i++) {
      moved += this.tick({ ...input, ...this.pending });
      this.pending = { ...NO_PRESS };
    }
    this.draw(n > 0 ? moved : null);
  }

  /** 한 틱. 히트스톱 중에는 게임 시간이 멈추고 흔들림만 진행 (motion.md 3장). 반환 = 걸은 거리 */
  private tick(input: StageInput): number {
    const dt = this.fx.stop.filter(TICK);
    this.fx.shake.update(TICK);
    this.clock += dt;
    this.drawDt += dt;
    for (const m of this.sim.alive) this.view(m).update(m, dt);
    const { events, moved } = this.sim.tick(dt, input);
    // 방향 전환: 발밑 먼지 (motion.md 6장)
    if (this.playerView.update(this.player, dt)) {
      const { sx, sy } = project(this.player.pos.x, this.player.pos.y);
      dust(sx, sy, fx.dust.bounce).forEach((d) => this.fx.layer.add(d));
    }
    // 우물에서 떨어져 착지: 먼지·흔들림·쿵
    if (this.playerView.justLanded) {
      const { sx, sy } = project(this.player.pos.x, this.player.pos.y);
      dust(sx, sy, fx.dust.down).forEach((d) => this.fx.layer.add(d));
      this.fx.shake.start(fx.downShake.sec, fx.downShake.px);
      this.sound('wellLand');
    }
    events.forEach((e) => this.onEvent(e));
    // 효과음은 이벤트 순간 바로 (히트스톱과 무관, audio.md 4장)
    events.forEach((e) => soundsFor(e, { teleport: this.playerView.teleport }).forEach((n) => this.sound(n)));
    const running = this.player.run.running && !this.player.fighter.run;
    if (running && !this.wasRunning) this.sound('dash');
    this.wasRunning = running;
    this.rhythm.update(dt, !!this.player.fighter.run);
    this.fx.layer.update(dt);
    return moved;
  }

  private view(m: Monster): MonsterView {
    let v = this.views.get(m.id);
    if (!v) this.views.set(m.id, (v = new MonsterView(this.scene)));
    return v;
  }

  private onEvent(e: SimEvent): void {
    const add = (list: ReturnType<typeof dust>) => list.forEach((d) => this.fx.layer.add(d));
    if (e.type === 'fighter') {
      this.rhythm.onEvent(e.e);
      const p = this.player, caster = { x: p.pos.x, y: p.pos.y, facing: p.facing };
      if (e.e.type === 'start') castStart(this.fx.layer, this.weapon, e.e.run.def, caster);
      if (e.e.type === 'active') {
        this.smearFor(e.e.run.def);
        castActive(this.fx.layer, this.weapon, e.e.run.def, caster);
      }
    } else if (e.type === 'boltEnd') {
      const b = e.bolt, { sx, sy } = project(b.x, b.y, fx.spell.bolt.height);
      if (b.hit.length) this.fx.layer.add(boltHit(sx, sy));
      else add(boltFizzle(sx, sy));
    } else if (e.type === 'backstep' && this.playerView.teleport) {
      this.teleportAt(this.player);
    } else if (e.type === 'hit') {
      const b = e.m.body, facing = this.player.facing, { sx, sy } = project(b.x, b.y, b.z);
      const [ax, ay] = fx.star.at as [number, number];
      const v = this.view(e.m);
      v.hurt = b.armor ? 0 : fx.reaction.hurtSec;
      hitPackage(this.fx, e.def.fx?.grade ?? 'light', v, {
        x: sx + ax * facing, y: sy + ay, numberX: sx, numberY: sy - fx.number.above,
      }, e.damage, e.def.fx?.shake);
    } else if (e.type === 'playerHit') {
      // 플레이어 피격: 번쩍임 + 위험색 숫자 (경직·다운은 playerHurt 이벤트)
      const p = this.player, { sx, sy } = project(p.pos.x, p.pos.y);
      this.playerView.flash = fx.flashFrames.light * fx.frame;
      this.fx.layer.add(damageNumber(e.damage, sx, sy - fx.number.above, 'light', 'global.semantic.danger'));
    } else if (e.type === 'playerHurt') {
      const p = this.player, { sx, sy } = project(p.pos.x, p.pos.y);
      if (e.e === 'down') {
        add(dust(sx, sy, fx.dust.down));
        this.fx.shake.start(fx.downShake.sec, fx.downShake.px);
      }
      if (e.e === 'getup') this.playerView.onGetup();
      if (e.e === 'wipe') this.onWipe?.();
    } else if (e.type === 'monster') {
      const { sx, sy } = project(e.m.body.x, e.m.body.y), ev = e.e;
      if (ev.type === 'wallHit') {
        add(dust(sx, sy, fx.dust.down));
        this.fx.shake.start(fx.downShake.sec, fx.downShake.px);
      } else if (ev.type === 'body') {
        if (ev.e === 'bounce') {
          this.view(e.m).hurt = fx.reaction.hurtSec;
          add(dust(sx, sy, fx.dust.bounce));
        } else if (ev.e === 'down') {
          add(dust(sx, sy, fx.dust.down));
          this.fx.layer.add(ring(sx, sy));
          this.fx.shake.start(fx.downShake.sec, fx.downShake.px);
        } else if (ev.e === 'wall') {
          add(dust(sx, sy, fx.dust.bounce));
        } else if (ev.e === 'exit') {
          this.views.get(e.m.id)?.destroy();
          this.views.delete(e.m.id);
        }
      }
    }
  }

  private teleportAt(p: PlayerState): void {
    const { sx, sy } = project(p.pos.x, p.pos.y);
    teleportPuff(sx, sy - fx.spell.bolt.height).forEach((e) => this.fx.layer.add(e));
  }

  private smearFor(def: ActionDef): void {
    const p = this.player;
    actionSmear(this.fx.layer, def, () => ({ ...project(p.pos.x + this.rhythm.px * p.facing, p.pos.y), facing: p.facing }));
  }

  /** moved = 이번 프레임에 걸은 거리 (틱이 안 돌았으면 null: 걷기 박자 유지) */
  private draw(moved: number | null): void {
    const data = spriteData(), p = this.player;
    this.playerView.draw(p, moved, this.rhythm.px, this.clock);
    this.ghosts.update(this.drawDt, !!p.backstep && !this.playerView.teleport, this.playerView.actor.img);
    // 순간이동이 끝나는 순간: 나타나는 자리에 점
    if (this.wasBackstep && !p.backstep && this.playerView.teleport) this.teleportAt(p);
    this.wasBackstep = !!p.backstep;
    this.bolts.draw(this.sim.bolts);
    this.drawDt = 0;

    this.sim.alive.forEach((m, i) => placeMonster(this.scene, this.view(m), data, m, this.clock, i));
    if (this.sleepMarks.draw(this.sim.alive.map((m) => ({ m, v: this.view(m) })), this.clock)) this.sound('monWake');
    this.hazards.draw(this.sim);
    this.fx.layer.draw();
  }
}
