// 몬스터끼리 겹침 풀기 (지상·공격 중 아닐 때): 피격 상자가 겹치면 좌우로 벌린다 (+ separation 여유)
import type { Bounds } from '../movement';
import { attackPhase, monsterBounds, type Monster } from '../monster/state';
import { COMBAT } from '../data/load';

export function separateMonsters(alive: Monster[], bounds: Bounds): void {
  const margin = COMBAT.ai.separation;
  const list = alive.filter((m) => m.body.state === 'idle' && attackPhase(m) === null && m.body.z === 0);
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const ma = list[i]!, mc = list[j]!, a = ma.body, c = mc.body;
      const gapX = (ma.def.hurtbox.width + mc.def.hurtbox.width) / 2 + margin;
      const gapY = (ma.def.hurtbox.depth + mc.def.hurtbox.depth) / 2;
      const dx = c.x - a.x;
      if (Math.abs(dx) >= gapX || Math.abs(c.y - a.y) >= gapY) continue;
      const push = (gapX - Math.abs(dx)) / 2, dir = dx >= 0 ? 1 : -1;
      const ba = monsterBounds(ma, bounds), bc = monsterBounds(mc, bounds);
      a.x = Math.min(ba.maxX, Math.max(ba.minX, a.x - dir * push));
      c.x = Math.min(bc.maxX, Math.max(bc.minX, c.x + dir * push));
    }
  }
}
