// 모션 무대: 게임과 같은 CombatStage를 대본 입력으로 돌린다. 속도·일시정지·한 프레임 넘기기
import Phaser from 'phaser';
import { fighterPhase, type Vec2 } from '@game/shared';
import { color } from '../../../client/src/palette';
import { CombatStage } from '../../../client/src/stage/combatStage';
import { FLOOR_TOP } from '../../../client/src/view/layout';
import { drawRoomBg } from '../../../client/src/view/roomBg';
import { Script, type ScriptMode } from './script';

export const VIEW_W = 176;
const DEPTH_TILES = 4;
export const VIEW_H = FLOOR_TOP + DEPTH_TILES * 10 + 6;
const PLAYER: Vec2 = { x: 48, y: 32 };
const MUSHROOM: Vec2 = { x: 64, y: 32 };
const FRAME = 1 / 60;

/** 화면 밖(조작 패널)에서 바꾸는 값 */
export const controls = {
  speed: 1,
  paused: false,
  /** 일시정지 중 넘길 프레임 수 */
  stepFrames: 0,
  mode: 'all' as ScriptMode,
  restart: false,
  onInfo: (_text: string) => {},
};

export class MotionScene extends Phaser.Scene {
  private stage!: CombatStage;
  private script = new Script(controls.mode);
  private clock = 0;

  constructor() {
    super('Motion');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(color('floors.1.env.void'));
    this.textures.addCanvas('motion-bg', drawRoomBg(1, VIEW_W + 16, DEPTH_TILES, VIEW_H + 8));
    this.add.image(-8, 0, 'motion-bg').setOrigin(0, 0).setDepth(-1000);
    this.stage = new CombatStage(this, { minX: 8, maxX: VIEW_W - 8, minY: 0, maxY: DEPTH_TILES * 16 }, PLAYER, [MUSHROOM]);
  }

  private restart(): void {
    this.stage.reset(PLAYER, [MUSHROOM]);
    this.script.mode = controls.mode;
    this.script.restart();
    this.clock = 0;
  }

  update(_time: number, delta: number): void {
    if (controls.restart) {
      controls.restart = false;
      this.restart();
    }
    let dt: number;
    if (controls.paused) {
      if (controls.stepFrames <= 0) return;
      controls.stepFrames--;
      dt = FRAME;
    } else {
      dt = Math.min(0.05, delta / 1000) * controls.speed;
    }
    const s = this.stage;
    const input = this.script.step(s, s.fx.stop.active ? 0 : dt);
    s.update(dt, input);
    this.clock += dt;
    if (this.script.needsReset) {
      const lap = this.script.finished;
      s.reset(PLAYER, [MUSHROOM]);
      this.script.needsReset = false;
      if (lap) this.restart();
    }
    const shake = s.fx.shake.offset();
    this.cameras.main.setScroll(-shake.x, -shake.y);
    controls.onInfo(this.info());
  }

  private info(): string {
    const s = this.stage, f = s.player.fighter, m = s.monsters[0]!.body;
    const run = f.run ? `${f.run.def.id} ${fighterPhase(f)} ${f.run.t.toFixed(3)}s` : '대기';
    const stop = s.fx.stop.active ? '  [히트스톱]' : '';
    return `t ${this.clock.toFixed(3)}s  플레이어 ${run}${stop}\n버섯 ${m.state} z ${m.z.toFixed(1)} x ${m.x.toFixed(1)}`;
  }
}
