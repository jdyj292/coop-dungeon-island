// 온라인: 그리는 시점의 상태 변화 → 소리·연출 계기 (로컬은 SimEvent가 주는 것을 상태 비교로 대신, audio.md 3장 연결표와 같게)
// 행동 시작 = windup 소리, active 진입 = active 소리·스미어, 백스텝·다운·기상·그로기 진입
import { attackPhase, fighterPhase, type ActionDef, type Monster, type MonsterAttack, type PlayerState } from '@game/shared';

export type Cue =
  | { type: 'actionStart'; def: ActionDef | MonsterAttack }
  | { type: 'actionActive'; def: ActionDef | MonsterAttack }
  | { type: 'enter'; state: string; from: string };

interface Seen {
  key: string;
  def: ActionDef | MonsterAttack | undefined;
  active: boolean;
  state: string;
}

/** 엔티티별로 직전 모습을 기억하고 바뀐 점을 돌려준다 */
export class Transitions {
  private seen = new Map<string, Seen>();

  /** state = 스냅샷 상태 이름, key = 행동 id + 시작 시각 (같은 행동 반복 구분) */
  private diff(id: string, state: string, def: ActionDef | MonsterAttack | undefined, key: string, active: boolean): Cue[] {
    const prev = this.seen.get(id);
    this.seen.set(id, { key, def, active, state });
    if (!prev) return [];
    const out: Cue[] = [];
    if (def && key !== prev.key) out.push({ type: 'actionStart', def });
    if (def && active && (!prev.active || key !== prev.key)) out.push({ type: 'actionActive', def });
    if (state !== prev.state) out.push({ type: 'enter', state, from: prev.state });
    return out;
  }

  player(id: string, p: PlayerState, state: string, actionStart: number): Cue[] {
    const run = p.fighter.run;
    return this.diff(`p:${id}`, state, run?.def, run ? `${run.def.id}@${actionStart}` : '', fighterPhase(p.fighter) === 'active');
  }

  monster(m: Monster, state: string, actionStart: number): Cue[] {
    const a = m.attack;
    return this.diff(`m:${m.id}`, state, a?.def, a ? `${a.def.id}@${actionStart}` : '', attackPhase(m) === 'active');
  }

  /** 이 엔티티가 마지막으로 하던 행동 (적중 소리·등급용) */
  lastDef(id: string): ActionDef | MonsterAttack | undefined {
    return this.seen.get(id)?.def;
  }

  forget(id: string): void {
    this.seen.delete(id);
  }
}
