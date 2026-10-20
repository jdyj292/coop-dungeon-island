// 자동 재생 대본: 3연타(선입력) → 쉼 → 올려베기 → 기상 → 처음으로. 입력만 만들고 판정은 게임 코드가 한다
import { fighterPhase, skillDef } from '@game/shared';
import { NO_INPUT, type CombatStage, type StageInput } from '../../../client/src/stage/combatStage';

export type ScriptMode = 'all' | 'combo' | 'launch';
const LAUNCH = skillDef('gs_launch');
/** 동작 사이 쉬는 시간 (게임 시간 초) */
const REST = 0.6;

export class Script {
  private part: 'combo' | 'launch' | 'rest' = 'combo';
  private pressed = new Set<number>();
  private wait = 0;
  private after: 'launch' | 'reset' = 'reset';
  /** true면 무대를 처음 자리로 되돌린다 (올려베기 전, 한 바퀴 끝) */
  needsReset = false;
  /** 한 바퀴 끝: 되돌린 뒤 restart */
  finished = false;

  constructor(public mode: ScriptMode) {
    this.restart();
  }

  restart(): void {
    this.part = this.mode === 'launch' ? 'launch' : 'combo';
    this.pressed.clear();
    this.wait = 0;
    this.needsReset = false;
    this.finished = false;
  }

  /** 한 틱의 입력. dt는 게임 시간 (히트스톱 중 0) */
  step(stage: CombatStage, dt: number): StageInput {
    const f = stage.player.fighter;
    if (this.part === 'rest') {
      this.wait -= dt;
      if (this.wait > 0) return NO_INPUT;
      if (this.after === 'launch') {
        // 3타 knockback으로 멀어졌으니 제자리에서 올려베기
        this.part = 'launch';
        this.pressed.clear();
        this.needsReset = true;
        return NO_INPUT;
      }
      this.needsReset = true;
      this.finished = true;
      return NO_INPUT;
    }
    if (this.part === 'combo') {
      const run = f.run;
      // 1타는 비어 있을 때, 다음 타는 active~recovery 중 선입력
      const next = !run ? 0 : run.kind === 'basic' && fighterPhase(f) !== 'windup' ? run.step + 1 : -1;
      if (next >= 0 && next < stage.weapon.basic.length && !this.pressed.has(next)) {
        this.pressed.add(next);
        return { ...NO_INPUT, attack: true };
      }
      if (!run && this.pressed.size === stage.weapon.basic.length) this.rest(this.mode === 'all' ? 'launch' : 'reset');
      return NO_INPUT;
    }
    // 올려베기: 한 번 쓰고, 버섯이 모두 일어설 때까지 기다림
    if (!this.pressed.has(0)) {
      this.pressed.add(0);
      return { ...NO_INPUT, skill: LAUNCH };
    }
    if (!f.run && stage.monsters.every((m) => m.body.state === 'idle')) this.rest('reset');
    return NO_INPUT;
  }

  private rest(after: 'launch' | 'reset'): void {
    this.part = 'rest';
    this.after = after;
    this.wait = REST;
  }
}
