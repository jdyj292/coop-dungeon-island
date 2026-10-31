// 특수 판정 (data.md 3장 특수 필드, skills.md 1장): 반복(repeat)·후속(after)은 시전한 자리·방향에 같은 판정을 예약
// (반복은 판정마다 앞으로 옮기거나(step) 가까운 몬스터 쪽으로 따라가고(seek), copies 자리에 같은 반복을 더),
// 연발 투사체(projectile.burst)는 나머지 발을 예약, 해제 판정(onStatusEnd)은 그 행동이 건 빙결이 풀릴 때 그 몬스터에게 한 번.
// 재입력(reinput)은 player.ts, 벽꿍(onWall)은 room.ts
import type { ActionDef } from '../actions';
import { canBeHit } from '../body';
import type { Monster } from '../monster/state';
import type { PlayerState } from '../player';
import { actionHits, areaCenter } from '../shapes';
import type { Cast } from './bolts';
import { hitMonster, type StrikeHit } from './strike';

/** 연출 사건이 있는 예약 판정 종류: 반복 / 후속(벽꿍 포함) / 해제 */
export type EchoKind = 'repeat' | 'after' | 'shatter';

/**
 * 연출 그림 (SK-4 2차, art.md 7장): 없으면 종류·행동 판정으로 기존 그림. chain = 번개 줄(from → 대상), scar = 검흔 터짐,
 * blast = 화염구 끝 폭발, stick = 꽂힌 대검 둘레 베기, quake = 여진 충격파, orbEnd = 구슬 확장 끝 폭발
 */
export type EchoLook = 'chain' | 'scar' | 'blast' | 'stick' | 'quake' | 'orbEnd';

/** 예약 판정. shot = 연발 투사체 (판정 대신 발사, 연출은 마법탄 사건), chain = 연쇄 다음 대상 (sim/echoes.ts, 연출은 해제와 같은 shatter) */
export interface Echo {
  pid: string;
  kind: EchoKind | 'shot' | 'chain';
  def: ActionDef;
  x: number;
  y: number;
  facing: number;
  /** 시뮬레이션 시각 (초) */
  at: number;
  /** 반복 묶음이 함께 쓰는 자리 (step·seek로 옮겨 감)와 이 판정이 묶음의 몇 번째인지 */
  spot?: { x: number; y: number };
  k?: number;
  /** 반복 규칙 (def에서는 빠짐) */
  rep?: NonNullable<ActionDef['repeat']>;
  /** 연쇄: 남은 대상 수, 이미 맞은 몬스터 id */
  chain?: { left: number; hit: number[] };
  /** 연발 투사체(shot)의 시전 (보조 검기 순환) */
  cast?: Cast;
  /** 연출 그림, 번개 줄이 시작하는 자리 (연쇄) */
  look?: EchoLook;
  from?: { x: number; y: number };
}

/** active 순간: 이 행동이 예약하는 판정들 (반복은 첫 판정을 뺀 나머지, copies는 첫 판정부터). now = 시뮬레이션 시각 */
export function echoesOf(pid: string, def: ActionDef, p: PlayerState, now: number): Echo[] {
  const { repeat, after, ...plain } = def;
  const at = { pid, x: p.pos.x, y: p.pos.y, facing: p.facing };
  const out: Echo[] = [];
  if (repeat) {
    const group = (dx: number, dy: number, from: number) => {
      const spot = { x: at.x + dx * at.facing, y: at.y + dy };
      for (let k = from; k < repeat.count; k++) out.push({ ...at, ...spot, kind: 'repeat', def: plain, at: now + k * repeat.interval, spot, k, rep: repeat });
    };
    group(0, 0, 1);
    for (const [dx, dy] of repeat.copies ?? []) group(dx, dy, 0);
  }
  if (after) out.push({ ...at, kind: 'after', def: { ...plain, coef: after.coef }, at: now + after.delay });
  const burst = def.projectile?.burst;
  if (burst) for (let k = 1; k < burst.count; k++) out.push({ ...at, kind: 'shot', def: plain, at: now + k * burst.interval });
  return out;
}

/** 반복 판정 직전: 묶음 자리를 앞으로(step) 옮기고 가까운 몬스터 쪽으로(seek) 따라간 뒤, 판정 자리를 정한다 */
export function placeEcho(e: Echo, monsters: Monster[]): void {
  const r = e.rep, spot = e.spot;
  if (!spot || !r) return;
  if (r.step && e.k) spot.x += r.step * e.facing;
  if (r.seek && e.def.area) {
    const c = areaCenter({ ...spot, facing: e.facing }, e.def.area.at);
    let best: { dx: number; dy: number; d: number } | null = null;
    for (const m of monsters) {
      if (!canBeHit(m.body, e.def.flags) || (e.def.area.z === 'air' && m.body.state !== 'air')) continue;
      const dx = m.body.x - c.x, dy = m.body.y - c.y, d = Math.hypot(dx, dy);
      if (!best || d < best.d) best = { dx, dy, d };
    }
    if (best && best.d > 0) {
      const k = Math.min(1, r.seek / best.d);
      spot.x += best.dx * k;
      spot.y += best.dy * k;
    }
  }
  e.x = spot.x;
  e.y = spot.y;
}

/** 예약 판정 한 번: 범위 안의 맞을 수 있는 몬스터 모두 */
export function strikeEcho(e: Echo, p: PlayerState, monsters: Monster[]): StrikeHit[] {
  const out: StrikeHit[] = [];
  for (const m of monsters) {
    if (!canBeHit(m.body, e.def.flags)) continue;
    if (!actionHits(e, e.def, { x: m.body.x, y: m.body.y, airborne: m.body.state === 'air', hurtbox: m.def.hurtbox })) continue;
    out.push(hitMonster(p, e.def, m, e.facing, e));
  }
  return out;
}

/** 빙결을 건 행동 → 풀릴 때 맞히는 행동 (빙결을 다시 걸지 않고 띄우거나 넘어뜨리지 않음) */
export function shatterDef(def: ActionDef): ActionDef {
  const { status, onStatusEnd, ...rest } = def;
  return { ...rest, coef: onStatusEnd?.coef ?? 0, flags: [] };
}

/** 벽꿍 판정: 추가 판정 (다시 밀거나 벽꿍을 걸지 않음. 다운은 room.ts가 knockDown) */
export function wallDef(def: ActionDef): ActionDef {
  const { onWall, ...rest } = def;
  return { ...rest, coef: onWall?.coef ?? 0, flags: ['downhit'] };
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
