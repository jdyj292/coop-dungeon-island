// 연쇄 판정 (번개 연쇄, skills.md 3장, skills.json chain): 첫 대상 = 앞쪽 range 안 가장 가까운 적,
// 다음 = 지난 대상에서 jump 안의 아직 안 맞은 가장 가까운 적. interval마다 한 마리씩 최대 count마리 (예약은 echoes.ts)
import type { ActionDef } from '../actions';
import { canBeHit } from '../body';
import type { Monster } from '../monster/state';

/** 바라보는 쪽 뒤로 이만큼(px)까지는 앞으로 친다 (겹쳐 선 적) */
const BEHIND = 4;

function nearest(from: { x: number; y: number }, monsters: Monster[], max: number, ok: (m: Monster) => boolean): Monster | null {
  let best: Monster | null = null, bestD = max;
  for (const m of monsters) {
    if (m.body.ko || !ok(m)) continue;
    const d = Math.hypot(m.body.x - from.x, m.body.y - from.y);
    if (d <= bestD) {
      best = m;
      bestD = d;
    }
  }
  return best;
}

/** 연쇄 다음 대상. hit이 비었으면 시전자(from·facing) 앞쪽 range, 아니면 지난 대상(from)에서 jump 안 */
export function chainTarget(from: { x: number; y: number; facing: number }, def: ActionDef, monsters: Monster[], hit: number[]): Monster | null {
  const c = def.chain!, first = hit.length === 0;
  return nearest(from, monsters, first ? c.range : c.jump, (m) =>
    canBeHit(m.body, def.flags) && !hit.includes(m.id) && (!first || (m.body.x - from.x) * from.facing >= -BEHIND));
}
