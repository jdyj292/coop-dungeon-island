// 플레이어 투사체 (스태프 평타 마법탄, skills.md 3장): 행동 active 순간 손 앞에서 발사 → 날아가다 처음 닿은 몬스터에 적중
// (pierce면 계속). 사거리 끝·방 벽·장애물에서 사라짐. 데이터 = 행동의 projectile { speed, range, radius, pierce }
// SK-4 1차b: back = 사거리 끝에서 던진 사람 쪽으로 같은 줄을 따라 돌아옴 (지나치면 왕복 1번, 다리마다 같은 적을 다시 한 번),
// rehit = 관통하며 같은 적을 이 초마다 다시, blast = 끝나는 자리 원형 판정 (관통이 아니면 닿은 적에게 직접 피해 없이 폭발만, room.ts)
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
  /** 이미 맞힌 몬스터 (관통해도 같은 대상은 한 번, 돌아오는 다리마다 새로) */
  hit: number[];
  /** 왕복 투사체(back): 지금 다리 (짝수 = 나가는 중, 홀수 = 돌아오는 중), 이번 틱에 방향을 바꿨나 (원격 연출 다시 보냄) */
  leg: number;
  turned: boolean;
  /** 날아간 시간, 몬스터 id → 마지막으로 맞힌 시각 (rehit) */
  age: number;
  last: Record<number, number>;
  /** 쏜 스킬 시전 (보조 검기 순환: 시전 번호 n당 한 번, skill = 시전한 스킬 id). 평타 투사체는 없음 */
  cast?: Cast;
  /** 깊이 방향 성분 (진행 1px당 y 변화, -1~1, 몬스터 투사체와 같음). 좌우 성분은 dir × √(1 − dy²). 없으면 0 (SK-7 십자 검기) */
  dy?: number;
  /** 보조 잔상이 다시 쏜 투사체 (반투명으로 그림) */
  ghost?: boolean;
}

export interface Cast {
  n: number;
  skill: string;
}

export function spawnBolt(id: number, pid: string, def: ActionDef, x: number, y: number, dir: number, muzzle = MUZZLE, cast?: Cast): Bolt {
  return { id, pid, def, x: x + dir * muzzle, y, dir, traveled: 0, done: false, hit: [], leg: 0, turned: false, age: 0, last: {}, ...(cast ? { cast } : {}) };
}

/** 한 번에 나가는 투사체 자리·방향 (총구 적용 전 x, 깊이 성분 dy) */
export interface Launch {
  x: number;
  y: number;
  dir: number;
  dy: number;
}

/**
 * 발사 한 번의 투사체들: 여러 줄(lanes) × 방향(aims). meet면 각 줄이 앞 meet.at px 가운데 줄로 비스듬히 모인다.
 * 위아래로만 가는 방향(aims [0, ±1])은 좌우 성분 0, 넉백 방향은 바라보는 쪽
 */
export function volley(def: ActionDef, x: number, y: number, facing: number): Launch[] {
  const pr = def.projectile!, out: Launch[] = [];
  for (const lane of pr.lanes ?? [0]) {
    for (const [ax, ay] of pr.aims ?? [[1, 0]]) {
      const fx = pr.meet ? pr.meet.at : ax, fy = pr.meet ? -lane : ay, len = Math.hypot(fx, fy) || 1;
      out.push({ x, y: y + lane, dir: Math.sign(fx) * facing || facing, dy: fy / len });
    }
  }
  return out;
}

/** 엇갈리는 자리와 그때까지 걸리는 초 (meet, 총구 앞에서 잰다) */
export function meetPoint(def: ActionDef, x: number, y: number, facing: number): { x: number; y: number; sec: number } | null {
  const pr = def.projectile, m = pr?.meet;
  if (!pr || !m) return null;
  const lane = Math.max(0, ...(pr.lanes ?? [0]).map(Math.abs));
  return { x: x + facing * (MUZZLE + m.at), y, sec: Math.hypot(m.at, lane) / pr.speed };
}

/** 돌아오는 다리를 끝내고 다음 다리로 (왕복이 남았으면 다시 나감) */
function nextLeg(b: Bolt, legs: number): void {
  b.leg++;
  if (b.leg >= legs) {
    b.done = true;
    return;
  }
  b.dir = -b.dir;
  b.traveled = 0;
  b.hit = [];
  b.turned = true;
}

/** 한 틱: 날아가고, 이번 틱에 맞은 몬스터 (관통하지 않으면 첫 하나). homeX = 던진 사람의 지금 x (왕복 투사체가 돌아올 곳) */
export function stepBolt(b: Bolt, dt: number, bounds: Bounds, monsters: Monster[], homeX?: number): Monster[] {
  const pr = b.def.projectile!, d = pr.speed * dt, legs = pr.back ? pr.back * 2 : 1;
  b.turned = false;
  const dy = b.dy ?? 0;
  b.x += b.dir * (dy ? Math.sqrt(1 - dy * dy) : 1) * d;
  b.y += dy * d;
  b.traveled += d;
  b.age += dt;
  const back = b.leg % 2 === 1;
  if (back) {
    // 돌아오는 중: 던진 사람을 지나치면 끝 (못 따라잡으면 사거리 3배에서 끝)
    if (homeX === undefined || Math.sign(homeX - b.x) !== b.dir || b.traveled >= pr.range * 3) nextLeg(b, legs);
  } else if (b.traveled >= pr.range) {
    if (b.leg + 1 < legs) nextLeg(b, legs);
    else b.done = true;
  }
  if (b.x < bounds.minX || b.x > bounds.maxX || (dy !== 0 && (b.y < bounds.minY || b.y > bounds.maxY)) || pointBlocked(b, bounds)) b.done = true;
  if (b.done) return [];
  const out: Monster[] = [];
  for (const m of monsters) {
    if (!canBeHit(m.body, b.def.flags)) continue;
    if (pr.rehit ? b.age - (b.last[m.id] ?? -Infinity) < pr.rehit : b.hit.includes(m.id)) continue;
    if (!projectileHits(b.x, b.y, pr.radius, { x: m.body.x, y: m.body.y, airborne: m.body.state === 'air', hurtbox: m.def.hurtbox })) continue;
    b.hit.push(m.id);
    b.last[m.id] = b.age;
    if (!pr.pierce) {
      b.done = true;
      // 폭발형은 닿은 적에게 직접 피해 없이 그 적 자리에서 폭발 (echoes.ts)
      if (pr.blast) Object.assign(b, { x: m.body.x, y: m.body.y });
      else out.push(m);
      break;
    }
    out.push(m);
  }
  return out;
}

/** 끝 판정 (blast): 투사체가 끝난 자리의 원형 판정. 계수는 blast.coef, 없으면 투사체 계수 */
export function blastDef(def: ActionDef): ActionDef {
  const { projectile, ...rest } = def;
  const bl = projectile!.blast!;
  return { ...rest, coef: bl.coef ?? def.coef, area: { shape: 'circle', at: [0, 0], radius: bl.radius, z: 'both' }, flags: (def.flags ?? []).filter((f) => f !== 'projectile') };
}

/** 엇갈림 폭발 (meet): 그 자리 원형 판정 */
export function meetDef(def: ActionDef): ActionDef {
  const { projectile, ...rest } = def;
  const m = projectile!.meet!;
  return { ...rest, coef: m.coef, area: { shape: 'circle', at: [0, 0], radius: m.radius, z: 'both' }, flags: (def.flags ?? []).filter((f) => f !== 'projectile') };
}

/** 분열 조각: 폭발 자리에서 앞뒤로 나가는 작은 투사체 정의 (폭발·분열 없음) */
export function shardDef(def: ActionDef): ActionDef {
  const s = def.projectile!.blast!.shards!;
  return { ...def, coef: s.coef, projectile: { speed: s.speed, range: s.range, radius: s.radius, pierce: false } };
}
