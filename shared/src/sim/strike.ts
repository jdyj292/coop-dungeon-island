// 플레이어 행동 → 몬스터 적중 (active 동안 매 틱, 같은 행동에 한 대상은 한 번: combat.md 2장)
// 마법탄(bolts.ts)도 맞힐 때는 같은 hitMonster (피해·반응·MP·필살기·상태 이상)
import type { ActionDef, ActionRun } from '../actions';
import { applyHit, canBeHit, knockDown } from '../body';
import { COMBAT, PLAYER } from '../data/load';
import { damageOf } from '../hit';
import { freezeMonster, slowMonster, type Monster } from '../monster/state';
import type { PlayerState } from '../player';
import { gainMpOnHit, gainUlt } from '../playerHurt';
import { actionHits, areaCenter, type Origin } from '../shapes';

export interface StrikeHit {
  m: Monster;
  damage: number;
  /** 이 적중으로 체력 0 → 기절 (보상 시점) */
  ko: boolean;
}

/** 판정에 쓸 몬스터 위치 (지연 보정이면 되감은 위치, network.md 9장) */
export type PosOf = (m: Monster) => { x: number; y: number; airborne: boolean };
const current: PosOf = (m) => ({ x: m.body.x, y: m.body.y, airborne: m.body.state === 'air' });

/**
 * 한 몬스터에 적중: 반응(경직·띄우기·끌어당김), 피해(내 ATK × 계수 × 보조 노드 배율), 체력 0이면 기절, 상태 이상(빙결·감속·체공), MP·필살기 게이지.
 * dir = 밀려나는 방향, from = 판정 기준 (pull은 area 중심, 없으면 기준 자리로 끌어옴)
 */
export function hitMonster(p: PlayerState, def: ActionDef, m: Monster, dir: number, from?: Origin): StrikeHit {
  // 중압 표식은 감속 동안만: 감속이 끝났으면 지운다 (다시 느리게 한 사람 기준으로 새로 건다)
  if (m.slow.left <= 0) m.pressed = 0;
  // 다운 상태 대상은 피해 감소 (balance.md 1장, 보조 짓밟기가 올림). 맞기 전 상태로
  const mul = takenMul(p, m) * (m.body.state === 'down' ? (p.perks?.downDamage ?? COMBAT.downDamageMul) : 1);
  applyHit(m.body, { dir, strength: def.strength ?? 'light', flags: def.flags, launchVz: def.launchVz });
  // 파쇄참: 슈퍼아머 대상도 잠깐 경직 (공격은 끊긴다, ai.ts). 다운 유지(대지붕괴): 땅의 적은 바로 다운
  if (def.armorBreak && m.body.armor && !m.body.ko && m.body.state === 'idle') Object.assign(m.body, { state: 'hitstun', timer: def.armorBreak });
  // 다운 유지는 밀어내지 않음 (장판 밖으로 미끄러지지 않게)
  if (def.keepDown && m.body.state !== 'air' && !m.body.armor) {
    Object.assign(m.body, { push: 0, pushY: 0 });
    knockDown(m.body);
  }
  if (def.flags?.includes('pull') && from) pullToward(m, def.area ? areaCenter(from, def.area.at) : from);
  // 잠든 몬스터는 맞으면 바로 깨어남 (그 몬스터만, dungeon.md 5장)
  m.sleep = 0;
  const damage = damageOf(def.coef * mul, p.atk);
  const ko = m.hp > 0 && m.hp - damage <= 0;
  m.hp = Math.max(0, m.hp - damage);
  if (m.hp === 0) m.body.ko = true;
  if (def.status?.type === 'freeze' && !m.body.ko) freezeMonster(m, def.status.time);
  if (def.status?.type === 'slow' && !m.body.ko) slowMonster(m, def.status.time, def.status.amount ?? 0);
  if (def.status?.type === 'hold' && m.body.state === 'air' && !m.body.armor) m.body.hold = Math.max(m.body.hold, def.status.time);
  markMonster(p, def, m);
  gainMpOnHit(p);
  gainUlt(p, PLAYER.ultimate.onHit);
  return { m, damage, ko };
}

/** 피해 배율 (skills.md 보조 노드): 날 선 칼날(떨어진 적, 내 노드), 연소·중압(몬스터에 걸린 표식, 누가 때려도) */
function takenMul(p: PlayerState, m: Monster): number {
  let mul = 1;
  const far = p.perks?.far;
  if (far && Math.hypot(m.body.x - p.pos.x, m.body.y - p.pos.y) > far.minDist) mul *= far.mul;
  if (m.burn.left > 0) mul *= m.burn.mul;
  if (m.slow.left > 0 && m.pressed > 0) mul *= m.pressed;
  return mul;
}

/** 표식 걸기: 연소 = 그 원소 스킬 적중, 중압 = 감속 판정 적중 */
function markMonster(p: PlayerState, def: ActionDef, m: Monster): void {
  if (m.body.ko) return;
  const burn = p.perks?.burn, press = p.perks?.press;
  if (burn && def.element === burn.element) m.burn = { left: burn.time, mul: burn.takenMul };
  if (press && def.status?.type === 'slow') m.pressed = press.takenMul;
}

/** 끌어당김: 몬스터를 기준점 쪽으로 (좌우는 밀림, 깊이는 pushY). 슈퍼아머·고정형은 안 끌려옴 */
function pullToward(m: Monster, to: { x: number; y: number }): void {
  if (m.body.armor || m.body.weight === 'fixed') return;
  m.body.push = to.x - m.body.x;
  m.body.pushY = to.y - m.body.y;
  m.body.knockback = false;
}

/** 다단히트(hits) 몇 번째 판정인가: active 시작부터 interval마다 한 번 (같은 행동에 한 대상은 판정마다 한 번) */
export function waveOf(def: ActionDef, t: number): number {
  if (!def.hits) return 0;
  return Math.min(def.hits.count - 1, Math.max(0, Math.floor((t - def.phases.windup) / def.hits.interval)));
}

/** 판정에 든 몬스터 모두에게 적중. 체력 0이면 기절 (combat.md 3장). done = 이 행동에 이미 맞은 (판정 번호, 몬스터 id) */
export function strike(p: PlayerState, run: ActionRun, monsters: Monster[], done: Set<number>, posOf: PosOf = current): StrikeHit[] {
  const def = run.def, out: StrikeHit[] = [];
  const a = { x: p.pos.x, y: p.pos.y, facing: p.facing };
  const wave = waveOf(def, run.t) * 1e6;
  for (const m of monsters) {
    if (done.has(wave + m.id) || !canBeHit(m.body, def.flags)) continue;
    const t = { ...posOf(m), hurtbox: m.def.hurtbox };
    if (!actionHits(a, def, t)) continue;
    done.add(wave + m.id);
    out.push(hitMonster(p, def, m, p.facing, a));
  }
  return out;
}

export function phaseIsActive(run: ActionRun): boolean {
  const { windup, active } = run.def.phases;
  return run.t >= windup && run.t < windup + active;
}
