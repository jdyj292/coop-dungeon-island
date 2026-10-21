// 판정 모양 (docs/data.md 1장 "판정 모양", 의미 docs/combat.md 2장). 깊이(y)도 px 그대로 비교한다
import type { Area, Hitbox, Zone } from './data/schema';

export interface Origin {
  x: number;
  y: number;
  /** 1 = 오른쪽, -1 = 왼쪽 */
  facing: number;
}

/** 맞을 수 있는 플레이어 (pid = 방 안 플레이어 id) */
export type PlayerTarget = HitTarget & { pid: string };

export interface HitTarget {
  x: number;
  y: number;
  airborne: boolean;
  hurtbox: { width: number; depth: number };
}

type ZCond = Hitbox['z'];

export function zMatches(cond: ZCond, airborne: boolean): boolean {
  return cond === 'both' || (cond === 'air') === airborne;
}

/** 원과 피격 상자(너비 × 깊이)의 겹침 */
function circleHits(cx: number, cy: number, r: number, t: HitTarget): boolean {
  const dx = Math.max(0, Math.abs(t.x - cx) - t.hurtbox.width / 2);
  const dy = Math.max(0, Math.abs(t.y - cy) - t.hurtbox.depth / 2);
  return dx * dx + dy * dy <= r * r;
}

/** 사각형: 바라보는 방향으로 forward부터 width 길이(뒤로 back 추가), 깊이는 판정·피격 상자 겹침 */
export function hitboxHits(o: Origin, box: Hitbox, t: HitTarget): boolean {
  if (!zMatches(box.z, t.airborne)) return false;
  const rel = (t.x - o.x) * o.facing;
  const half = t.hurtbox.width / 2;
  if (rel + half < box.forward - (box.back ?? 0) || rel - half > box.forward + box.width) return false;
  return Math.abs(t.y - o.y) <= (box.depth + t.hurtbox.depth) / 2;
}

/** area 중심: at = [바라보는 방향 기준 x, 깊이] */
export function areaCenter(o: Origin, at: [number, number]): { x: number; y: number } {
  return { x: o.x + at[0] * o.facing, y: o.y + at[1] };
}

/** circle / rect / fan. fan은 바라보는 방향을 가운데로 angle(도) 폭의 부채꼴 */
export function areaHits(o: Origin, a: Area, t: HitTarget): boolean {
  if (!zMatches(a.z, t.airborne)) return false;
  const c = areaCenter(o, a.at);
  if (a.shape === 'rect') {
    return Math.abs(t.x - c.x) <= (a.width! + t.hurtbox.width) / 2 && Math.abs(t.y - c.y) <= (a.depth! + t.hurtbox.depth) / 2;
  }
  if (!circleHits(c.x, c.y, a.radius!, t)) return false;
  if (a.shape === 'circle') return true;
  const fx = (t.x - c.x) * o.facing, fy = t.y - c.y;
  if (fx === 0 && fy === 0) return true;
  return Math.abs((Math.atan2(fy, fx) * 180) / Math.PI) <= a.angle! / 2;
}

/** 날아가는 투사체 (원). 높이 조건 없음: 지상·공중 모두 맞음 */
export const projectileHits = (x: number, y: number, radius: number, t: HitTarget): boolean => circleHits(x, y, radius, t);

/** 장판 안에 서 있는지 (발 위치 기준, 공중이면 밖) */
export function zoneContains(o: Origin, z: Zone, t: HitTarget): boolean {
  if (t.airborne) return false;
  const c = areaCenter(o, z.at);
  if (z.shape === 'circle') return Math.hypot(t.x - c.x, t.y - c.y) <= z.radius!;
  return Math.abs(t.x - c.x) <= z.width! / 2 && Math.abs(t.y - c.y) <= z.depth! / 2;
}

/** 행동이 즉시 판정하는 모양(hitbox·area)으로 맞는지. projectile·zone은 생성된 물체가 따로 판정 */
export function actionHits(o: Origin, def: { hitbox?: Hitbox; area?: Area }, t: HitTarget): boolean {
  if (def.hitbox) return hitboxHits(o, def.hitbox, t);
  if (def.area) return areaHits(o, def.area, t);
  return false;
}
