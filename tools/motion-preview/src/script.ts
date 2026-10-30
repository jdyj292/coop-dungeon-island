// 자동 재생 대본: 3연타(선입력) → 쉼 → 스킬 → 기상 → 처음으로. 입력만 만들고 판정은 게임 코드가 한다
// 스킬 = 무기 기본 스킬 모두 (대검은 올려베기 → 대지가르기, 스태프는 화염 폭발 → 얼음 장판 → 순간이동 백스텝, MVP 보충 ST-2a)
import { buildFrom, buildSkill, fighterPhase, skillDef, SKILLS, type ActionDef } from '@game/shared';
import { NO_INPUT, type CombatStage, type StageInput } from '../../../client/src/stage/combatStage';

export type ScriptMode = 'all' | 'combo' | 'launch';
/** 동작 사이 쉬는 시간 (게임 시간 초) */
const REST = 0.6;

/** 대본에 쓰는 스킬: 무기 기본 스킬 모두, build = 스킬 노드 코드(변형 미리보기, 게임 ?skills=와 같은 형식). 계열 스킬을 고르면 그 스킬만 */
const scriptSkills = (stage: CombatStage, build: string): ActionDef[] => {
  const b = buildFrom(build), base = stage.weapon.baseSkills, branch = Object.keys(b).filter((id) => SKILLS[id] && !base.includes(id));
  return (branch.length ? branch : base).map((id) => buildSkill(stage.weapon, b, id) ?? skillDef(id));
};

export class Script {
  private part: 'combo' | 'launch' | 'backstep' | 'rest' = 'combo';
  private pressed = new Set<number>();
  private wait = 0;
  private after: 'launch' | 'backstep' | 'reset' = 'reset';
  /** 지금 쓰는 스킬 순서 */
  private skill = 0;
  /** true면 무대를 처음 자리로 되돌린다 (스킬 전, 한 바퀴 끝) */
  needsReset = false;
  /** 한 바퀴 끝: 되돌린 뒤 restart */
  finished = false;
  /** 스킬 노드 코드 (예: gs_earthsplit:3:fan) */
  build = '';

  constructor(public mode: ScriptMode) {
    this.restart();
  }

  restart(): void {
    this.part = this.mode === 'launch' ? 'launch' : 'combo';
    this.pressed.clear();
    this.wait = 0;
    this.skill = 0;
    this.needsReset = false;
    this.finished = false;
  }

  /** 한 틱의 입력. dt는 게임 시간 (히트스톱 중 0) */
  step(stage: CombatStage, dt: number): StageInput {
    const f = stage.player.fighter;
    if (this.part === 'rest') {
      this.wait -= dt;
      if (this.wait > 0) return NO_INPUT;
      if (this.after === 'launch' || this.after === 'backstep') {
        // 3타 knockback으로 멀어졌으니 제자리에서 다음 동작
        this.part = this.after;
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
    if (this.part === 'backstep') {
      if (!this.pressed.has(0)) {
        this.pressed.add(0);
        return { ...NO_INPUT, backstep: true };
      }
      if (!stage.player.backstep) this.rest('reset');
      return NO_INPUT;
    }
    // 스킬: 한 번 쓰고, 버섯이 모두 일어설 때까지 기다린 뒤 다음 스킬 (마지막이면 순간이동 무기는 백스텝)
    const skills = scriptSkills(stage, this.build);
    if (!this.pressed.has(0)) {
      this.pressed.add(0);
      return { ...NO_INPUT, skill: skills[this.skill] ?? null };
    }
    if (f.run || !stage.monsters.every((m) => m.body.state === 'idle' && !(m.frozen > 0))) return NO_INPUT;
    this.skill++;
    if (this.skill < skills.length) this.rest('launch');
    else this.rest(stage.weapon.backstepStyle === 'teleport' ? 'backstep' : 'reset');
    return NO_INPUT;
  }

  private rest(after: 'launch' | 'backstep' | 'reset'): void {
    this.part = 'rest';
    this.after = after;
    this.wait = REST;
  }
}
