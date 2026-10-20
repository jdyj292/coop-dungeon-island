// 피격 반응과 높이(z): 경직·밀림·띄우기·바운드·다운·기상 (docs/combat.md 3장, 수치 shared/data/combat.json)
import { COMBAT } from './data/load';
import type { Strength } from './actions';

export type Weight = 'light' | 'medium' | 'heavy' | 'fixed' | 'boss';
export type BodyState = 'idle' | 'hitstun' | 'air' | 'down' | 'getup';

export interface Body {
  x: number;
  y: number;
  z: number;
  vz: number;
  state: BodyState;
  /** 현재 상태의 남은 시간 (hitstun·down·getup) */
  timer: number;
  /** 아직 덜 밀린 거리 (부호 = 방향) */
  push: number;
  /** 마지막으로 맞은 방향 (다운 미끄러짐·눕는 방향) */
  hitDir: number;
  knockback: boolean;
  bounced: boolean;
  forceDown: boolean;
  airHits: number;
  gravityMul: number;
  weight: Weight;
}

export const newBody = (x: number, y: number, weight: Weight): Body => ({
  x, y, z: 0, vz: 0, state: 'idle', timer: 0, push: 0, hitDir: 1, knockback: false,
  bounced: false, forceDown: false, airHits: 0, gravityMul: 1, weight,
});

export interface HitInfo {
  /** 밀리는 방향 (공격자가 바라보는 방향) */
  dir: number;
  strength: Strength;
  flags?: string[];
  launchVz?: number;
}

export type BodyEvent = 'bounce' | 'down' | 'getup' | 'wall';

/** 다운 중에는 downhit만, 기상 중에는 무적 */
export function canBeHit(b: Body, flags: string[] = []): boolean {
  if (b.state === 'getup') return false;
  if (b.state === 'down') return flags.includes('downhit');
  return true;
}

export function applyHit(b: Body, hit: HitInfo): void {
  const flags = hit.flags ?? [];
  const mul = COMBAT.weightMul[b.weight];
  const stun = COMBAT.stun[hit.strength];
  // fixed(고정형): 경직만 받고 밀림·띄우기·넉백은 무시 (combat.md 3장 경직)
  const fixed = b.weight === 'fixed';
  b.hitDir = hit.dir;
  b.push = fixed ? 0 : hit.dir * stun.push * mul;
  b.knockback = !fixed && flags.includes('knockback');
  if (b.state === 'air') {
    if (!flags.includes('hold')) b.vz = Math.max(b.vz, 0) + COMBAT.airHitVz;
    else b.vz = 0;
    b.airHits++;
    b.gravityMul *= COMBAT.airGravityMul;
    if (b.airHits > COMBAT.maxAirHits || flags.includes('down')) b.forceDown = true;
  } else if (flags.includes('launch') && mul > 0 && !fixed) {
    Object.assign(b, { state: 'air', vz: hit.launchVz ?? COMBAT.launchVz, bounced: false, forceDown: false });
  } else if (mul > 0) {
    b.state = 'hitstun';
    b.timer = stun.time * mul;
  }
}

/** 한 틱 진행. minX·maxX는 방 벽 */
export function stepBody(b: Body, dt: number, minX: number, maxX: number): BodyEvent[] {
  const events: BodyEvent[] = [];
  if (b.push !== 0) {
    let d = b.push * Math.min(1, COMBAT.pushRate * dt);
    if (Math.abs(b.push - d) < 0.05) d = b.push;
    b.x += d;
    b.push -= d;
    if (b.x < minX || b.x > maxX) {
      b.x = Math.min(maxX, Math.max(minX, b.x));
      b.push = 0;
      if (b.knockback && b.state === 'hitstun') {
        b.timer += COMBAT.wallStunSec;
        events.push('wall');
      }
      b.knockback = false;
    }
  }
  switch (b.state) {
    case 'air':
      b.vz -= COMBAT.gravity * b.gravityMul * dt;
      b.z += b.vz * dt;
      if (b.z <= 0 && b.vz < 0) {
        b.z = 0;
        if (!b.bounced && !b.forceDown) {
          b.bounced = true;
          b.vz = COMBAT.bounceVz;
          events.push('bounce');
        } else {
          Object.assign(b, { state: 'down', vz: 0, timer: COMBAT.downSec, push: b.hitDir * COMBAT.downSlide });
          events.push('down');
        }
      }
      break;
    case 'hitstun':
      b.timer -= dt;
      if (b.timer <= 0) b.state = 'idle';
      break;
    case 'down':
      b.timer -= dt;
      if (b.timer <= 0) {
        Object.assign(b, { state: 'getup', timer: COMBAT.getupSec, airHits: 0, gravityMul: 1, forceDown: false });
        events.push('getup');
      }
      break;
    case 'getup':
      b.timer -= dt;
      if (b.timer <= 0) b.state = 'idle';
      break;
  }
  return events;
}
