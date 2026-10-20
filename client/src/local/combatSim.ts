// 로컬 전투 (roadmap 0-6, 서버 없음). M2에서 서버로 옮길 때 shared 함수를 그대로 쓴다
import {
  actionHits, actionMoveDelta, applyHit, canBeHit, canTurn, damageOf, MONSTERS, moveSpeed, newBody, newFighter,
  newRunState, stepBody, stepFighter, stepMove, stepRun,
  type ActionDef, type ActionRun, type Body, type BodyEvent, type Bounds, type Fighter, type RunState, type Vec2,
  type WeaponDef,
} from '@game/shared';

export interface LocalMonster {
  kind: string;
  body: Body;
  facing: number;
  hurtbox: { width: number; depth: number };
  /** 연출 타이머 (게임 시간) */
  flash: number;
  hurt: number;
  airT: number;
}

export interface LocalPlayer {
  pos: Vec2;
  facing: number;
  fighter: Fighter;
  run: RunState;
}

export interface PlayerInput {
  x: number;
  y: number;
  attack: boolean;
  skill: ActionDef | null;
}

export interface HitResult {
  monster: LocalMonster;
  def: ActionDef;
  damage: number;
}

export function spawnMonster(kind: string, x: number, y: number): LocalMonster {
  const def = MONSTERS[kind];
  if (!def) throw new Error(`몬스터 '${kind}' 없음`);
  return { kind, body: newBody(x, y, def.weight), facing: -1, hurtbox: def.hurtbox, flash: 0, hurt: 0, airT: 0 };
}

/** 플레이어 한 틱 (1/60초): 행동 → 행동 중 이동 또는 걷기·달리기 → active 진입 시 판정 */
export function stepPlayer(
  p: LocalPlayer, weapon: WeaponDef, input: PlayerInput, dt: number, bounds: Bounds, monsters: LocalMonster[],
) {
  const before = p.fighter.run && { run: p.fighter.run, t: p.fighter.run.t };
  const events = stepFighter(p.fighter, weapon, input, dt);
  if (input.x && canTurn(p.fighter)) p.facing = Math.sign(input.x);
  const running = stepRun(p.run, input.x, dt) && !p.fighter.run;
  const actMove = actionMoved(before, events.flatMap((e) => (e.type === 'start' ? [e.run] : [])));
  if (actMove) p.pos.x = Math.min(bounds.maxX, Math.max(bounds.minX, p.pos.x + actMove * p.facing));
  const moved = p.fighter.run ? 0 : stepAndMeasure(p, input, dt, moveSpeed(running, weapon.moveMul), bounds);
  const hits: HitResult[] = [];
  for (const e of events) {
    if (e.type !== 'active') continue;
    hits.push(...strike(p, e.run.def, monsters));
  }
  return { events, hits, moved, running };
}

/** 이번 틱의 행동 중 이동 거리: 진행 중이던 행동(끝났으면 끝까지) + 이번 틱에 시작한 행동 */
function actionMoved(before: { run: ActionRun; t: number } | null, started: ActionRun[]): number {
  let d = before ? actionMoveDelta(before.run.def, before.t, before.run.t) : 0;
  for (const r of started) if (r !== before?.run) d += actionMoveDelta(r.def, 0, r.t);
  return d;
}

function stepAndMeasure(p: LocalPlayer, input: PlayerInput, dt: number, speed: { x: number; y: number }, bounds: Bounds): number {
  const next = stepMove(p.pos, input, dt, speed, bounds);
  const d = Math.hypot(next.x - p.pos.x, next.y - p.pos.y);
  p.pos = next;
  return d;
}

/** 판정에 든 몬스터 모두에게 적중 */
export function strike(p: LocalPlayer, def: ActionDef, monsters: LocalMonster[]): HitResult[] {
  const out: HitResult[] = [];
  const a = { x: p.pos.x, y: p.pos.y, facing: p.facing };
  for (const m of monsters) {
    const t = { x: m.body.x, y: m.body.y, airborne: m.body.state === 'air', hurtbox: m.hurtbox };
    if (!canBeHit(m.body, def.flags) || !actionHits(a, def, t)) continue;
    const wasAir = m.body.state === 'air';
    applyHit(m.body, { dir: p.facing, strength: def.strength ?? 'light', flags: def.flags, launchVz: def.launchVz });
    if (m.body.state === 'air' && !wasAir) m.airT = 0;
    out.push({ monster: m, def, damage: damageOf(def.coef ?? 0) });
  }
  return out;
}

/** 몬스터 한 틱 (AI는 M1. 지금은 피격 반응과 플레이어 쪽 바라보기만) */
export function stepMonster(m: LocalMonster, dt: number, playerX: number, minX: number, maxX: number): BodyEvent[] {
  m.flash = Math.max(0, m.flash - dt);
  m.hurt = Math.max(0, m.hurt - dt);
  if (m.body.state === 'air') m.airT += dt;
  if (m.body.state === 'idle') m.facing = playerX < m.body.x ? -1 : 1;
  return stepBody(m.body, dt, minX, maxX);
}

export const newPlayer = (pos: Vec2): LocalPlayer => ({ pos, facing: 1, fighter: newFighter(), run: newRunState() });
