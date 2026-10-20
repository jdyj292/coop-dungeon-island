// 몬스터가 남기는 물체: 투사체(포자탄)와 장판(졸음 구름). 형식 docs/data.md 1장 projectile·zone
import type { MonsterAttack, Zone as ZoneDef } from '../data/schema';
import { areaCenter, projectileHits, zoneContains, type HitTarget } from '../shapes';

export interface Projectile {
  id: number;
  ownerId: number;
  def: MonsterAttack;
  x: number;
  y: number;
  dir: number;
  traveled: number;
  done: boolean;
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
  return { id, ownerId, def, x: x + dir * MUZZLE, y, dir, traveled: 0, done: false };
}

/** 한 틱: 날아가고, 사거리·벽에서 사라짐. 맞으면 true (맞은 뒤 사라짐, pierce면 계속) */
export function stepProjectile(p: Projectile, dt: number, minX: number, maxX: number, target: HitTarget | null): boolean {
  const pr = p.def.projectile!;
  const d = pr.speed * dt;
  p.x += p.dir * d;
  p.traveled += d;
  if (p.traveled >= pr.range || p.x < minX || p.x > maxX) p.done = true;
  if (p.done || !target || !projectileHits(p.x, p.y, pr.radius, target)) return false;
  if (!pr.pierce) p.done = true;
  return true;
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
