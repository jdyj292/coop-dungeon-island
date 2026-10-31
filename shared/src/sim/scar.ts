// 검흔 (검흔 베기, skills.md 2장, skills.json mark): 맞은 적에 time초 표식. 표식을 건 사람의 투사체가 그 적을 맞히면 터지며 mark.coef
// (표식은 사라짐). hop이면 터질 때 range 안 가장 가까운 다른 적에게 새 표식으로 옮겨감 (최대 count번)
import type { ActionDef } from '../actions';
import type { Monster } from '../monster/state';

/** 검흔 걸기 (같은 사람·다른 사람 모두 새로 덮어씀) */
export function markScar(pid: string, def: ActionDef, m: Monster, hops = def.mark?.hop?.count ?? 0): void {
  if (!def.mark || m.body.ko) return;
  m.scar = { pid, left: def.mark.time, def, hops };
}

/** 터짐 판정: 표식 계수, 다시 표식을 걸거나 띄우지 않음 */
export function scarBurstDef(def: ActionDef): ActionDef {
  const { mark, ...rest } = def;
  return { ...rest, coef: mark?.coef ?? 0, flags: [] };
}

/** 내 투사체에 맞은 몬스터 중 내 검흔이 있는 것 (표식을 떼어 돌려준다) */
export function takeScars(pid: string, hit: Monster[]): { m: Monster; scar: NonNullable<Monster['scar']> }[] {
  const out: { m: Monster; scar: NonNullable<Monster['scar']> }[] = [];
  for (const m of hit) {
    const s = m.scar;
    if (!s || s.pid !== pid || s.left <= 0) continue;
    delete m.scar;
    out.push({ m, scar: s });
  }
  return out;
}

/** 옮겨갈 대상: 터진 적에서 hop.range 안 가장 가까운 다른 적 (기절·퇴장 제외) */
export function hopTarget(from: Monster, def: ActionDef, monsters: Monster[]): Monster | null {
  const range = def.mark?.hop?.range ?? 0;
  let best: Monster | null = null, bestD = range;
  for (const m of monsters) {
    if (m === from || m.body.ko || m.body.gone) continue;
    const d = Math.hypot(m.body.x - from.body.x, m.body.y - from.body.y);
    if (d <= bestD) {
      best = m;
      bestD = d;
    }
  }
  return best;
}
