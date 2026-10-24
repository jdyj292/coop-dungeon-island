// 플레이어 행동 → 몬스터 적중 (active 동안 매 틱, 같은 행동에 한 대상은 한 번: combat.md 2장)
import type { ActionRun } from '../actions';
import { applyHit, canBeHit } from '../body';
import { PLAYER } from '../data/load';
import { damageOf } from '../hit';
import type { Monster } from '../monster/state';
import type { PlayerState } from '../player';
import { gainMpOnHit, gainUlt } from '../playerHurt';
import { actionHits } from '../shapes';

export interface StrikeHit {
  m: Monster;
  damage: number;
  /** 이 적중으로 체력 0 → 기절 (보상 시점) */
  ko: boolean;
}

/** 판정에 쓸 몬스터 위치 (지연 보정이면 되감은 위치, network.md 9장) */
export type PosOf = (m: Monster) => { x: number; y: number; airborne: boolean };
const current: PosOf = (m) => ({ x: m.body.x, y: m.body.y, airborne: m.body.state === 'air' });

/** 판정에 든 몬스터 모두에게 적중. 체력 0이면 기절 (combat.md 3장). done = 이 행동에 이미 맞은 몬스터 id */
export function strike(p: PlayerState, run: ActionRun, monsters: Monster[], done: Set<number>, posOf: PosOf = current): StrikeHit[] {
  const def = run.def, out: StrikeHit[] = [];
  const a = { x: p.pos.x, y: p.pos.y, facing: p.facing };
  for (const m of monsters) {
    if (done.has(m.id) || !canBeHit(m.body, def.flags)) continue;
    const t = { ...posOf(m), hurtbox: m.def.hurtbox };
    if (!actionHits(a, def, t)) continue;
    done.add(m.id);
    applyHit(m.body, { dir: p.facing, strength: def.strength ?? 'light', flags: def.flags, launchVz: def.launchVz });
    const damage = damageOf(def.coef, p.atk);
    const ko = m.hp > 0 && m.hp - damage <= 0;
    m.hp = Math.max(0, m.hp - damage);
    if (m.hp === 0) m.body.ko = true;
    gainMpOnHit(p);
    gainUlt(p, PLAYER.ultimate.onHit);
    out.push({ m, damage, ko });
  }
  return out;
}

export function phaseIsActive(run: ActionRun): boolean {
  const { windup, active } = run.def.phases;
  return run.t >= windup && run.t < windup + active;
}
