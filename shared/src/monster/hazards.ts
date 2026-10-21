// 몬스터가 남기는 물체: 투사체(포자탄)와 장판(졸음 구름). 형식 docs/data.md 1장 projectile·zone
import { pointBlocked } from '../map/collision';
import type { Bounds } from '../movement';
import type { MonsterAttack, Zone as ZoneDef } from '../data/schema';
import { areaCenter, projectileHits, zoneContains, type HitTarget, type PlayerTarget } from '../shapes';

export interface Projectile {
  id: number;
  ownerId: number;
  def: MonsterAttack;
  x: number;
  y: number;
  dir: number;
  traveled: number;
  done: boolean;
  /** 이미 맞힌 플레이어 (관통 투사체가 같은 사람을 매 틱 맞히지 않게) */
  hitPids: string[];
}

export interface ZoneArea {
  id: number;
  /** 만든 공격 id (그리기 색 고르기용) */
  attackId: string;
  def: ZoneDef;
  x: number;
  y: number;
  left: number;
}

/** 손 위치(발밑 앞 8px)에서 바라보는 방향으로 발사 (data.md 판정 모양) */
export const MUZZLE = 8;

export function spawnProjectile(id: number, ownerId: number, def: MonsterAttack, x: number, y: number, dir: number): Projectile {
  return { id, ownerId, def, x: x + dir * MUZZLE, y, dir, traveled: 0, done: false, hitPids: [] };
}

/** 한 틱: 날아가고, 사거리·벽에서 사라짐. 맞으면 true (맞은 뒤 사라짐, pierce면 계속) */
/** 이번 틱에 맞은 플레이어 id (관통하지 않으면 첫 한 명) */
export function stepProjectile(p: Projectile, dt: number, b: Bounds, targets: PlayerTarget[]): string[] {
  const pr = p.def.projectile!;
  const d = pr.speed * dt;
  p.x += p.dir * d;
  p.traveled += d;
  // 사거리 끝, 방 벽, 장애물(바위)에 닿으면 사라짐
  if (p.traveled >= pr.range || p.x < b.minX || p.x > b.maxX || pointBlocked(p, b)) p.done = true;
  if (p.done) return [];
  const hit: string[] = [];
  for (const t of targets) {
    if (p.hitPids.includes(t.pid) || !projectileHits(p.x, p.y, pr.radius, t)) continue;
    hit.push(t.pid);
    p.hitPids.push(t.pid);
    if (!pr.pierce) {
      p.done = true;
      break;
    }
  }
  return hit;
}

export function spawnZone(id: number, attack: MonsterAttack, origin: { x: number; y: number; facing: number }): ZoneArea {
  const def = attack.zone!, c = areaCenter(origin, def.at);
  return { id, attackId: attack.id, def, x: c.x, y: c.y, left: def.duration };
}

export function stepZone(z: ZoneArea, dt: number): void {
  z.left = Math.max(0, z.left - dt);
}

/** 장판 안에 있는지 (발 위치 기준) */
export const inZone = (z: ZoneArea, t: HitTarget): boolean =>
  z.left > 0 && zoneContains({ x: z.x, y: z.y, facing: 1 }, { ...z.def, at: [0, 0] }, t);

/** 감속 장판(졸음 구름) 안이면 이동 속도 × (1 - amount), 여러 개면 가장 느린 것 (RoomSim·클라이언트 예측 공용) */
export function zoneSpeedMul(zones: ZoneArea[], pos: { x: number; y: number }, hurtbox: HitTarget['hurtbox']): number {
  const t = { x: pos.x, y: pos.y, airborne: false, hurtbox };
  let mul = 1;
  for (const z of zones) if (z.def.effect.type === 'slow' && inZone(z, t)) mul = Math.min(mul, 1 - (z.def.effect.amount ?? 0));
  return mul;
}
