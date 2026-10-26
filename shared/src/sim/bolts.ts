// 플레이어 투사체 (스태프 평타 마법탄, skills.md 3장): 행동 active 순간 손 앞에서 발사 → 날아가다 처음 닿은 몬스터에 적중
// (pierce면 계속). 사거리 끝·방 벽·장애물에서 사라짐. 데이터 = 행동의 projectile { speed, range, radius, pierce }
import type { ActionDef } from '../actions';
import { canBeHit } from '../body';
import { pointBlocked } from '../map/collision';
import { MUZZLE } from '../monster/hazards';
import type { Monster } from '../monster/state';
import type { Bounds } from '../movement';
import { projectileHits } from '../shapes';

export interface Bolt {
  id: number;
  /** 쏜 플레이어 */
  pid: string;
  def: ActionDef;
  x: number;
  y: number;
  dir: number;
  traveled: number;
  done: boolean;
  /** 이미 맞힌 몬스터 (관통해도 같은 대상은 한 번) */
  hit: number[];
}

export function spawnBolt(id: number, pid: string, def: ActionDef, x: number, y: number, dir: number): Bolt {
  return { id, pid, def, x: x + dir * MUZZLE, y, dir, traveled: 0, done: false, hit: [] };
}

/** 한 틱: 날아가고, 이번 틱에 맞은 몬스터 (관통하지 않으면 첫 하나) */
export function stepBolt(b: Bolt, dt: number, bounds: Bounds, monsters: Monster[]): Monster[] {
  const pr = b.def.projectile!, d = pr.speed * dt;
  b.x += b.dir * d;
  b.traveled += d;
  if (b.traveled >= pr.range || b.x < bounds.minX || b.x > bounds.maxX || pointBlocked(b, bounds)) b.done = true;
  if (b.done) return [];
  const out: Monster[] = [];
  for (const m of monsters) {
    if (b.hit.includes(m.id) || !canBeHit(m.body, b.def.flags)) continue;
    if (!projectileHits(b.x, b.y, pr.radius, { x: m.body.x, y: m.body.y, airborne: m.body.state === 'air', hurtbox: m.def.hurtbox })) continue;
    out.push(m);
    b.hit.push(m.id);
    if (!pr.pierce) {
      b.done = true;
      break;
    }
  }
  return out;
}
