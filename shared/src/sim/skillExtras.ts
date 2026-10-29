// 변형 특수 판정 (data.md 3장 변형 특수 필드, skills.md 1장): 반복(repeat)·후속(after)은 시전한 자리·방향에 같은 판정을 예약,
// 해제 판정(onStatusEnd)은 그 행동이 건 빙결이 풀릴 때 그 몬스터에게 한 번. 재입력(reinput)은 player.ts
import type { ActionDef } from '../actions';
import { canBeHit } from '../body';
import type { Monster } from '../monster/state';
import type { PlayerState } from '../player';
import { actionHits } from '../shapes';
import { hitMonster, type StrikeHit } from './strike';

/** 예약 판정. kind = 반복 / 후속 / 해제 (그리기 구분) */
export interface Echo {
  pid: string;
  kind: 'repeat' | 'after' | 'shatter';
  def: ActionDef;
  x: number;
  y: number;
  facing: number;
  /** 시뮬레이션 시각 (초) */
  at: number;
}

/** active 순간: 이 행동이 예약하는 판정들 (반복은 첫 판정을 뺀 나머지). now = 시뮬레이션 시각 */
export function echoesOf(pid: string, def: ActionDef, p: PlayerState, now: number): Echo[] {
  const { repeat, after, ...plain } = def;
  const at = { pid, x: p.pos.x, y: p.pos.y, facing: p.facing };
  const out: Echo[] = [];
  if (repeat) for (let k = 1; k < repeat.count; k++) out.push({ ...at, kind: 'repeat', def: plain, at: now + k * repeat.interval });
  if (after) out.push({ ...at, kind: 'after', def: { ...plain, coef: after.coef }, at: now + after.delay });
  return out;
}

/** 예약 판정 한 번: 범위 안의 맞을 수 있는 몬스터 모두 */
export function strikeEcho(e: Echo, p: PlayerState, monsters: Monster[]): StrikeHit[] {
  const out: StrikeHit[] = [];
  for (const m of monsters) {
    if (!canBeHit(m.body, e.def.flags)) continue;
    if (!actionHits(e, e.def, { x: m.body.x, y: m.body.y, airborne: m.body.state === 'air', hurtbox: m.def.hurtbox })) continue;
    out.push(hitMonster(p, e.def, m, e.facing));
  }
  return out;
}

/** 빙결을 건 행동 → 풀릴 때 맞히는 행동 (빙결을 다시 걸지 않고 띄우거나 넘어뜨리지 않음) */
export function shatterDef(def: ActionDef): ActionDef {
  const { status, onStatusEnd, ...rest } = def;
  return { ...rest, coef: onStatusEnd?.coef ?? 0, flags: [] };
}

/** 빙결이 풀린 몬스터 (해제 판정을 걸어둔). 기절했으면 기록만 지운다 */
export function thawed(monsters: Monster[]): Monster[] {
  const out: Monster[] = [];
  for (const m of monsters) {
    if (!m.frozenBy || m.frozen > 0) continue;
    if (m.body.ko) delete m.frozenBy;
    else out.push(m);
  }
  return out;
}
