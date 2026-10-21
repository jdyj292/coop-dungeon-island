// 내 캐릭터 예측·보정 (docs/network.md 7장): 같은 공유 함수로 바로 움직이고, 서버 패치가 오면
// lastInputSeq 이하를 지우고 서버 상태에서 남은 입력을 다시 적용 → 화면 위치와의 차이를 무시·부드럽게·즉시 보정
// 이동 입력은 "바뀔 때 + 20Hz"로 보내므로 서버가 한 입력을 적용한 틱 수가 2~3틱 다를 수 있다 (보정 규칙이 흡수)
import {
  NET, newPlayerState, stepPlayerState,
  type Bounds, type PlayerInput, type PlayerState, type PlayerStep, type Vec2, type WeaponDef,
} from '@game/shared';

interface Pending {
  /** 이 틱까지 보낸 마지막 seq */
  seq: number;
  /** 이 틱에 보낸 행동 메시지 seq (거절되면 누름을 지운다) */
  actionSeq: number | null;
  input: PlayerInput;
  speedMul: number;
}

export type Correction = 'none' | 'ignore' | 'smooth' | 'snap';

/** 깊은 복사 (행동 정의는 공유) */
function clone(p: PlayerState): PlayerState {
  const run = p.fighter.run;
  return {
    ...p, pos: { ...p.pos }, fighter: { ...p.fighter, run: run && { ...run } }, run: { ...p.run },
    backstep: p.backstep && { ...p.backstep }, cooldowns: { ...p.cooldowns }, potions: { ...p.potions }, potionCd: { ...p.potionCd },
    hurt: p.hurt && { ...p.hurt },
  };
}

export class Predictor {
  state: PlayerState;
  /** 화면 위치 = state.pos + offset (부드러운 보정 중 남은 차이) */
  offset: Vec2 = { x: 0, y: 0 };
  /** 새 행동이 시작될 때마다 1씩 (소리·스미어 계기 구분용) */
  runStamp = 0;
  private pending: Pending[] = [];
  private smoothLeft = 0;
  /** 지금 행동을 시작한 행동 메시지 seq */
  private runSeq: number | null = null;
  /** 지금 백스텝을 시작한 행동 메시지 seq */
  private backstepSeq: number | null = null;

  constructor(private weapon: WeaponDef, private bounds: Bounds, start: Vec2) {
    this.state = newPlayerState({ ...start });
  }

  get display(): Vec2 {
    return { x: this.state.pos.x + this.offset.x, y: this.state.pos.y + this.offset.y };
  }

  /** 1/60초 한 틱 예측. seq = 지금까지 보낸 마지막 seq */
  tick(input: PlayerInput, dt: number, seq: number, actionSeq: number | null = null, speedMul = 1): PlayerStep {
    this.pending.push({ seq, actionSeq, input, speedMul });
    const res = stepPlayerState(this.state, this.weapon, input, dt, this.bounds, speedMul);
    if (res.events.some((e) => e.type === 'start')) {
      this.runStamp++;
      this.runSeq = actionSeq;
    }
    if (res.backstepStarted) this.backstepSeq = actionSeq;
    // 부드러운 보정: 남은 차이를 smoothMs 동안 줄인다
    if (this.smoothLeft > 0) {
      const k = Math.min(1, dt / this.smoothLeft);
      this.offset = { x: this.offset.x * (1 - k), y: this.offset.y * (1 - k) };
      this.smoothLeft = Math.max(0, this.smoothLeft - dt);
    }
    return res;
  }

  /**
   * 서버 패치: server = 그 시각의 내 서버 상태(mirror), lastSeq = 서버가 처리한 마지막 입력.
   * 서버 쪽 자원(HP·MP·물약)은 그대로 받고, 쿨타임은 예측과 서버 중 긴 쪽 (먼저 누른 것을 다시 못 누르게)
   */
  reconcile(server: PlayerState, lastSeq: number, dt: number): { mode: Correction; error: number } {
    this.pending = this.pending.filter((p) => p.seq > lastSeq);
    const sim = clone(server);
    for (const p of this.pending) stepPlayerState(sim, this.weapon, p.input, dt, this.bounds, p.speedMul);
    const s = this.state;
    Object.assign(s, { hp: sim.hp, maxHp: sim.maxHp, mp: sim.mp, potions: sim.potions, ult: sim.ult, feathers: sim.feathers });
    for (const [id, left] of Object.entries(sim.cooldowns)) s.cooldowns[id] = Math.max(s.cooldowns[id] ?? 0, left);
    // 맞는 것(경직·다운·쓰러짐)은 예측하지 않는다: 서버를 따른다
    s.hurt = sim.hurt;
    s.downed = sim.downed;
    if (sim.hurt || sim.downed) s.fighter.run = null;

    const shown = this.display;
    const error = Math.hypot(sim.pos.x - shown.x, sim.pos.y - shown.y);
    if (error <= NET.correctIgnorePx) return { mode: 'ignore', error };
    // 다시 계산한 상태로 바꾸되, 화면은 지금 자리에서 출발 (smooth) 또는 바로 이동 (snap)
    s.pos = sim.pos;
    s.backstep = sim.backstep;
    if ((sim.fighter.run?.def.id ?? '') !== (s.fighter.run?.def.id ?? '')) s.fighter = sim.fighter;
    if (error > NET.correctSnapPx) {
      this.offset = { x: 0, y: 0 };
      this.smoothLeft = 0;
      return { mode: 'snap', error };
    }
    this.offset = { x: shown.x - sim.pos.x, y: shown.y - sim.pos.y };
    this.smoothLeft = NET.correctSmoothMs / 1000;
    return { mode: 'smooth', error };
  }

  /** 서버가 행동을 거절: 그 행동이면 취소하고 대기 포즈로, 다시 적용할 때도 그 누름은 뺀다 */
  reject(seq: number): void {
    for (const p of this.pending) {
      if (p.actionSeq === seq) p.input = { ...p.input, attack: false, skill: null, backstep: false, potion: null };
    }
    if (this.runSeq === seq) {
      this.state.fighter.run = null;
      this.runSeq = null;
    }
    if (this.backstepSeq === seq) {
      this.state.backstep = null;
      this.backstepSeq = null;
    }
  }
}
