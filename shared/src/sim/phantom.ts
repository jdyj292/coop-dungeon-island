// 대검 B 계열 3단계 (SK-7, skills.md 2장) 예약 판정: 보조 잔상(같은 자리·방향 다시 베기·다시 쏘기),
// 십자 검기 교차점(엇갈리는 순간 폭발), 일섬 반환(맞은 적마다 늦은 한 번). 연결은 echoes.ts
import type { ActionDef } from '../actions';
import { canBeHit } from '../body';
import type { Monster } from '../monster/state';
import type { PlayerState } from '../player';
import { meetDef, meetPoint } from './bolts';
import type { Echo } from './skillExtras';
import { hitMonster, type StrikeHit } from './strike';

/** 잔상이 다시 하는 판정: 계수 × mul, 후속·반복·연발·표식·이동·늦은 판정 없이 (연쇄·원 판정 스킬은 잔상 없음) */
export function phantomDef(def: ActionDef, mul: number): ActionDef | null {
  if (!def.hitbox && !def.projectile) return null;
  const { repeat, after, onWall, onStatusEnd, chain, mark, allyBuff, trail, repeatEnd, move, reinput, ...rest } = def;
  const pr = def.projectile && (({ burst, meet, ...p }) => p)(def.projectile);
  return { ...rest, coef: def.coef * mul, ...(pr ? { projectile: pr } : {}) };
}

/** 스킬 active 순간: 잔상(delay초 뒤 같은 자리), 엇갈림 폭발 예약 */
export function tier3bEchoes(pid: string, def: ActionDef, p: PlayerState, now: number): Echo[] {
  const at = { pid, x: p.pos.x, y: p.pos.y, facing: p.facing };
  const out: Echo[] = [];
  const ph = p.perks?.phantom, ghost = ph && def.mp !== undefined ? phantomDef(def, ph.mul) : null;
  if (ph && ghost) out.push({ ...at, kind: ghost.projectile ? 'shot' : 'after', def: ghost, at: now + ph.delay, look: 'phantom' });
  const m = meetPoint(def, at.x, at.y, at.facing);
  if (m) out.push({ ...at, x: m.x, y: m.y, kind: 'after', def: meetDef(def), at: now + m.sec, look: 'meet' });
  return out;
}

/** 일섬 반환: 맞힌 적마다 delay초 뒤 그 적에게 */
export function trailEchoes(pid: string, def: ActionDef, hits: StrikeHit[], facing: number, now: number): Echo[] {
  const t = def.trail;
  if (!t) return [];
  const { trail, after, hitbox, ...rest } = def;
  const hitDef: ActionDef = { ...rest, coef: t.coef, flags: [], area: { shape: 'circle', at: [0, 0], radius: 1, z: 'both' } };
  return hits.map((h) => ({ pid, kind: 'after', def: hitDef, x: h.m.body.x, y: h.m.body.y, facing, at: now + t.delay, look: 'cut', target: h.m.id }));
}

/** 한 몬스터만 맞히는 예약 판정 (기절·퇴장했거나 맞을 수 없으면 없음). 판정 자리는 그 몬스터 지금 자리 */
export function strikeTarget(e: Echo, p: PlayerState, monsters: Monster[]): StrikeHit[] {
  const m = monsters.find((x) => x.id === e.target);
  if (!m || m.body.ko || !canBeHit(m.body, e.def.flags)) return [];
  e.x = m.body.x;
  e.y = m.body.y;
  return [hitMonster(p, e.def, m, e.facing)];
}
