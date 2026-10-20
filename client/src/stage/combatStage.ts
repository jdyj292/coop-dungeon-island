// 로컬 전투 무대: 플레이어·몬스터 진행, 타격 패키지, 그리기. 던전 씬과 tools/motion-preview가 같이 쓴다
import type Phaser from 'phaser';
import {
  fighterPose, newFighter, newBody, PLAYER_MOVE, weaponDef,
  type ActionDef, type BodyEvent, type Bounds, type FighterEvent, type Vec2,
} from '@game/shared';
import fx from '../../data/fx.json';
import { hitPackage, type FxContext } from '../fx/hitPackage';
import { FxLayer } from '../fx/layer';
import { dust, ring } from '../fx/particles';
import { Rhythm } from '../fx/rhythm';
import { smear, smearShape } from '../fx/smear';
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
}

export const NO_INPUT: StageInput = { x: 0, y: 0, attack: false, skill: null };

export class CombatStage {
  readonly weapon = weaponDef('greatsword');
  player: LocalPlayer;
  readonly fx: FxContext;
  readonly rhythm = new Rhythm();
  private playerView: ActorView;
  private mushrooms: { m: LocalMonster; view: ActorView }[];
  private beat = 0;
  /** 게임 시간 누적 (대기 순환용, 히트스톱·슬로우를 따른다) */
  private clock = 0;

  constructor(private scene: Phaser.Scene, readonly bounds: Bounds, player: Vec2, mushrooms: Vec2[]) {
    this.player = newPlayer(player);
    this.playerView = newActorView(scene);
    this.mushrooms = mushrooms.map((p) => ({ m: spawnMonster('mushroom', p.x, p.y), view: newActorView(scene) }));
    this.fx = { layer: new FxLayer(scene, FX_DEPTH), stop: new HitStop(), shake: new Shake() };
  }

  get monsters(): LocalMonster[] {
    return this.mushrooms.map((e) => e.m);
  }

  /** 처음 자리로 되돌린다 (연출 반복 재생용) */
  reset(player: Vec2, mushrooms: Vec2[]): void {
    Object.assign(this.player, { pos: { ...player }, facing: 1, fighter: newFighter() });
    this.mushrooms.forEach((e, i) => Object.assign(e.m, {
      body: newBody(mushrooms[i]!.x, mushrooms[i]!.y, e.m.body.weight), facing: -1, flash: 0, hurt: 0, airT: 0,
    }));
    this.rhythm.offset = 0;
    this.fx.layer.clear();
    this.fx.stop.clear();
    this.fx.shake.clear();
  }

  /** dt = 실제 경과 시간 (슬로우는 호출하는 쪽에서 곱함). 히트스톱 중에는 흔들림만 진행 (motion.md 3장) */
  update(realDt: number, input: StageInput): void {
    const dt = this.fx.stop.filter(realDt);
    this.fx.shake.update(realDt);
    this.clock += dt;
    const p = this.player, b = this.bounds;
    // 몬스터를 먼저 진행: 이번 틱에 맞은 번쩍임·경직이 같은 틱에 깎이지 않게
    for (const m of this.monsters) stepMonster(m, dt, p.pos.x, b.minX, b.maxX).forEach((e) => this.onMonsterEvent(m, e));
    const res = stepPlayer(p, this.weapon, input, dt, PLAYER_MOVE.walk, b, this.monsters);
    res.events.forEach((e) => this.onPlayerEvent(e));
    res.hits.forEach((h) => this.onHit(h));
    this.rhythm.update(dt, !!p.fighter.run);
    this.fx.layer.update(dt);
    this.draw(res.moved);
  }

  private onPlayerEvent(e: FighterEvent): void {
    this.rhythm.onEvent(e);
    if (e.type !== 'active') return;
    const def = e.run.def;
    const shape = smearShape(def.poses?.active ?? '');
    if (!shape) return;
    const p = this.player, { sx, sy } = project(p.pos.x + this.rhythm.px * p.facing, p.pos.y);
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

  private draw(moved: number): void {
    const data = spriteData(), p = this.player;
    const acting = !!p.fighter.run;
    // 걷기 박자는 이동 거리로 넘긴다 (발이 미끄러져 보이지 않게)
    this.beat = moved > 0 ? this.beat + moved / data.poses.walk.pxPerBeat : 0;
    const step = moved > 0 && !acting ? walkStep(data, Math.floor(this.beat)) : { frame: 'stand', bob: 0 };
    const look: CharacterLook = {
      hair: 'short', face: 'normal', outfit: data.outfits.sets.beginner!,
      weapon: 'greatsword_basic', pose: fighterPose(p.fighter) ?? 'idle', frame: step.frame, bob: step.bob,
    };
    const tex = characterTexture(this.scene, look, { hairColor: 'global.hairColors.0', playerColor: 'global.playerColors.0' });
    place(this.playerView, tex, { x: p.pos.x + this.rhythm.px * p.facing, y: p.pos.y, facing: p.facing });

    const idleSec = data.monsters.mushroom!.idleSec;
    const idle = stateFrames(data, 'mushroom', 'idle');
    this.mushrooms.forEach(({ m, view }, i) => {
      const frame = idle[Math.floor(this.clock / idleSec + i * 0.5) % idle.length]!;
      placeMonster(this.scene, view, data, m, frame);
    });
    this.fx.layer.draw();
  }
}
