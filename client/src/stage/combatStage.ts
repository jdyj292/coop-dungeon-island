// 로컬 전투 무대: 플레이어·몬스터 진행, 타격 패키지, 그리기. 던전 씬과 tools/motion-preview가 같이 쓴다
import type Phaser from 'phaser';
import {
  FixedStep, fighterPose, MONSTERS, newBody, newPlayerState, PLAYER, TICK, weaponDef,
  type ActionDef, type BodyEvent, type Bounds, type FighterEvent, type Vec2,
} from '@game/shared';
import { Afterimages } from '../fx/afterimage';
import fx from '../../data/fx.json';
import { hitPackage, type FxContext } from '../fx/hitPackage';
import { FxLayer } from '../fx/layer';
import { dust, ring } from '../fx/particles';
import { Rhythm } from '../fx/rhythm';
import { smear, smearShape } from '../fx/smear';
import { isThrust, thrust } from '../fx/thrust';
import { HitStop, Shake } from '../fx/timing';
import {
  newPlayer, spawnMonster, stepMonster, stepPlayer, type HitResult, type LocalMonster, type LocalPlayer,
} from '../local/combatSim';
import { walkStep, type CharacterLook } from '../sprites/compose';
import { spriteData } from '../sprites/data';
import { stateFrames } from '../sprites/monster';
import { characterTexture } from '../sprites/textures';
import { newActorView, place, placeMonster, type ActorView } from '../view/actors';
import { project } from '../view/layout';

/** 이펙트는 캐릭터 위, HUD 아래 */
const FX_DEPTH = 5000;

export interface StageInput {
  x: number;
  y: number;
  attack: boolean;
  skill: ActionDef | null;
  backstep: boolean;
}

type Presses = Pick<StageInput, 'attack' | 'skill' | 'backstep'>;
const NO_PRESS: Presses = { attack: false, skill: null, backstep: false };
export const NO_INPUT: StageInput = { x: 0, y: 0, ...NO_PRESS };

export class CombatStage {
  readonly weapon = weaponDef('greatsword');
  player: LocalPlayer;
  readonly fx: FxContext;
  readonly rhythm = new Rhythm();
  private playerView: ActorView;
  private mushrooms: { m: LocalMonster; view: ActorView }[];
  private beat = 0;
  private walking = false;
  /** 게임 시간 누적 (대기 순환용, 히트스톱·슬로우를 따른다) */
  private clock = 0;
  /** 1/60초 고정 틱 (docs/network.md 12장) */
  private ticks = new FixedStep();
  /** 틱이 돌기 전에 들어온 누름 입력을 다음 틱까지 보관 */
  private pending: Presses = { ...NO_PRESS };
  /** 지난 그리기 이후 흐른 게임 시간 (잔상용) */
  private drawDt = 0;
  private ghosts: Afterimages;

  constructor(private scene: Phaser.Scene, readonly bounds: Bounds, player: Vec2, mushrooms: Vec2[]) {
    this.player = newPlayer(player);
    this.playerView = newActorView(scene);
    this.mushrooms = mushrooms.map((p) => ({ m: spawnMonster('mushroom', p.x, p.y), view: newActorView(scene) }));
    this.fx = { layer: new FxLayer(scene, FX_DEPTH), stop: new HitStop(), shake: new Shake() };
    this.ghosts = new Afterimages(scene);
  }

  /** 퇴장하지 않은 몬스터 */
  get monsters(): LocalMonster[] {
    return this.mushrooms.filter((e) => !e.m.body.gone).map((e) => e.m);
  }

  /** 처음 자리로 되돌린다 (연출 반복 재생용) */
  reset(player: Vec2, mushrooms: Vec2[]): void {
    this.player = newPlayerState({ ...player });
    this.mushrooms.forEach((e, i) => Object.assign(e.m, {
      body: newBody(mushrooms[i]!.x, mushrooms[i]!.y, e.m.body.weight), hp: MONSTERS[e.m.kind]!.hp,
      facing: -1, flash: 0, hurt: 0, airT: 0,
    }));
    this.ghosts.clear();
    this.rhythm.offset = 0;
    this.fx.layer.clear();
    this.fx.stop.clear();
    this.fx.shake.clear();
    this.ticks.reset();
    this.pending = { ...NO_PRESS };
  }

  /** realDt = 실제 경과 시간 (슬로우는 호출하는 쪽에서 곱함). 1/60초 틱으로 나눠 진행하고 한 번 그린다 */
  update(realDt: number, input: StageInput): void {
    this.pending.attack ||= input.attack;
    this.pending.skill ??= input.skill;
    this.pending.backstep ||= input.backstep;
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
    const p = this.player, b = this.bounds;
    // 몬스터를 먼저 진행: 이번 틱에 맞은 번쩍임·경직이 같은 틱에 깎이지 않게
    for (const m of this.monsters) stepMonster(m, dt, p.pos.x, b.minX, b.maxX).forEach((e) => this.onMonsterEvent(m, e));
    const res = stepPlayer(p, this.weapon, input, dt, b, this.monsters);
    res.events.forEach((e) => this.onPlayerEvent(e));
    res.hits.forEach((h) => this.onHit(h));
    this.rhythm.update(dt, !!p.fighter.run);
    this.fx.layer.update(dt);
    return res.moved;
  }

  private onPlayerEvent(e: FighterEvent): void {
    this.rhythm.onEvent(e);
    if (e.type !== 'active') return;
    const def = e.run.def, p = this.player;
    const foot = () => ({ ...project(p.pos.x + this.rhythm.px * p.facing, p.pos.y), facing: p.facing });
    if (isThrust(def.id)) {
      this.fx.layer.add(thrust(foot, def.fx?.grade ?? 'light'));
      return;
    }
    const shape = smearShape(def.poses?.active ?? '');
    if (!shape) return;
    const { sx, sy } = foot();
    const [cx, cy] = fx.smear.center as [number, number];
    this.fx.layer.add(smear(sx + cx * p.facing, sy + cy, p.facing, shape, def.fx?.grade ?? 'light'));
  }

  private onHit({ monster: m, def, damage }: HitResult): void {
    const b = m.body, facing = this.player.facing;
    const { sx, sy } = project(b.x, b.y, b.z);
    const [ax, ay] = fx.star.at as [number, number];
    m.hurt = fx.reaction.hurtSec;
    hitPackage(this.fx, def.fx?.grade ?? 'light', m, {
      x: sx + ax * facing, y: sy + ay, numberX: sx, numberY: sy - fx.number.above,
    }, damage, def.fx?.shake);
  }

  private onMonsterEvent(m: LocalMonster, e: BodyEvent): void {
    const { sx, sy } = project(m.body.x, m.body.y);
    const add = (list: ReturnType<typeof dust>) => list.forEach((d) => this.fx.layer.add(d));
    if (e === 'bounce') {
      m.hurt = fx.reaction.hurtSec;
      add(dust(sx, sy, fx.dust.bounce));
    } else if (e === 'down') {
      add(dust(sx, sy, fx.dust.down));
      this.fx.layer.add(ring(sx, sy));
      this.fx.shake.start(fx.downShake.sec, fx.downShake.px);
    } else if (e === 'wall') {
      add(dust(sx, sy, fx.dust.bounce));
    }
  }

  /** moved = 이번 프레임에 걸은 거리 (틱이 안 돌았으면 null: 걷기 박자 유지) */
  private draw(moved: number | null): void {
    const data = spriteData(), p = this.player;
    const acting = !!p.fighter.run;
    // 걷기 박자는 이동 거리로 넘긴다 (발이 미끄러져 보이지 않게)
    if (moved !== null) {
      this.walking = moved > 0;
      this.beat = this.walking ? this.beat + moved / data.poses.walk.pxPerBeat : 0;
    }
    const step = this.walking && !acting ? walkStep(data, Math.floor(this.beat)) : { frame: 'stand', bob: 0 };
    const look: CharacterLook = {
      hair: 'short', face: 'normal', outfit: data.outfits.sets.beginner!,
      weapon: 'greatsword_basic', pose: fighterPose(p.fighter) ?? 'idle', frame: step.frame, bob: step.bob,
    };
    const tex = characterTexture(this.scene, look, { hairColor: 'global.hairColors.0', playerColor: 'global.playerColors.0' });
    // 백스텝: 뛰어 물러나는 높이는 위치 오프셋으로만 (판정은 지상, motion.md 6장)
    const hop = p.backstep ? Math.round(Math.sin((p.backstep.t / PLAYER.backstep.sec) * Math.PI) * fx.backstepHop) : 0;
    place(this.playerView, tex, { x: p.pos.x + this.rhythm.px * p.facing, y: p.pos.y, z: hop, facing: p.facing });
    this.ghosts.update(this.drawDt, !!p.backstep, this.playerView.img);
    this.drawDt = 0;

    const idleSec = data.monsters.mushroom!.idleSec;
    const idle = stateFrames(data, 'mushroom', 'idle');
    this.mushrooms.forEach(({ m, view }, i) => {
      view.img.setVisible(!m.body.gone);
      view.shadow.setVisible(!m.body.gone);
      if (m.body.gone) return;
      const frame = idle[Math.floor(this.clock / idleSec + i * 0.5) % idle.length]!;
      placeMonster(this.scene, view, data, m, frame);
    });
    this.fx.layer.draw();
  }
}
