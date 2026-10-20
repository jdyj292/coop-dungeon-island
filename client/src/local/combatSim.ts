// 로컬 전투 (서버 없음). 플레이어 행동은 shared/player.ts, 몬스터 쪽은 M1 1-4에서 shared로 옮긴다
import {
  actionHits, applyHit, canBeHit, damageOf, fighterPhase, MONSTERS, newBody, newPlayerState, stepBody, stepPlayerState,
  type ActionDef, type ActionRun, type Body, type BodyEvent, type Bounds, type PlayerInput, type PlayerState, type PlayerStep,
  type Vec2, type WeaponDef,
} from '@game/shared';

export interface LocalMonster {
  kind: string;
  body: Body;
  hp: number;
  facing: number;
  hurtbox: { width: number; depth: number };
  /** 연출 타이머 (게임 시간) */
  flash: number;
  hurt: number;
  airT: number;
}

export type LocalPlayer = PlayerState;
export type { PlayerInput };

export interface HitResult {
  monster: LocalMonster;
  def: ActionDef;
  damage: number;
}

export function spawnMonster(kind: string, x: number, y: number): LocalMonster {
  const def = MONSTERS[kind];
  if (!def) throw new Error(`몬스터 '${kind}' 없음`);
  return { kind, body: newBody(x, y, def.weight), hp: def.hp, facing: -1, hurtbox: def.hurtbox, flash: 0, hurt: 0, airT: 0 };
}

/** 행동마다 이미 맞은 대상 (같은 행동에 한 대상은 한 번, combat.md 2장) */
const struck = new WeakMap<ActionRun, Set<LocalMonster>>();

/**
 * 플레이어 한 틱 (1/60초) + 판정. active 구간 동안 매 틱 판정한다
 * (행동 중 이동하는 대시·돌진은 지나가며 닿은 대상도 맞음). active가 한 틱보다 짧아도 진입한 틱에 한 번은 판정
 */
export function stepPlayer(
  p: LocalPlayer, weapon: WeaponDef, input: PlayerInput, dt: number, bounds: Bounds, monsters: LocalMonster[],
): PlayerStep & { hits: HitResult[] } {
  const res = stepPlayerState(p, weapon, input, dt, bounds);
  const runs = new Set<ActionRun>();
  for (const e of res.events) if (e.type === 'active') runs.add(e.run);
  if (p.fighter.run && fighterPhase(p.fighter) === 'active') runs.add(p.fighter.run);
  const hits: HitResult[] = [];
  for (const run of runs) {
    let done = struck.get(run);
    if (!done) struck.set(run, (done = new Set()));
    const fresh = monsters.filter((m) => !done.has(m));
    for (const h of strike(p, run.def, fresh)) {
      done.add(h.monster);
      hits.push(h);
    }
  }
  return { ...res, hits };
}

/** 판정에 든 몬스터 모두에게 적중. 체력이 0이 되면 기절 (combat.md 3장) */
export function strike(p: LocalPlayer, def: ActionDef, monsters: LocalMonster[]): HitResult[] {
  const out: HitResult[] = [];
  const a = { x: p.pos.x, y: p.pos.y, facing: p.facing };
  for (const m of monsters) {
    const t = { x: m.body.x, y: m.body.y, airborne: m.body.state === 'air', hurtbox: m.hurtbox };
    if (!canBeHit(m.body, def.flags) || !actionHits(a, def, t)) continue;
    const wasAir = m.body.state === 'air';
    applyHit(m.body, { dir: p.facing, strength: def.strength ?? 'light', flags: def.flags, launchVz: def.launchVz });
    if (m.body.state === 'air' && !wasAir) m.airT = 0;
    const damage = damageOf(def.coef);
    m.hp = Math.max(0, m.hp - damage);
    if (m.hp === 0) m.body.ko = true;
    out.push({ monster: m, def, damage });
  }
  return out;
}

/** 몬스터 한 틱 (AI는 1-4. 지금은 피격 반응과 플레이어 쪽 바라보기만) */
export function stepMonster(m: LocalMonster, dt: number, playerX: number, minX: number, maxX: number): BodyEvent[] {
  m.flash = Math.max(0, m.flash - dt);
  m.hurt = Math.max(0, m.hurt - dt);
  if (m.body.state === 'air') m.airT += dt;
  if (m.body.state === 'idle') m.facing = playerX < m.body.x ? -1 : 1;
  return stepBody(m.body, dt, minX, maxX);
}

export const newPlayer = (pos: Vec2): LocalPlayer => newPlayerState(pos);
