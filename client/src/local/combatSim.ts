// 로컬 전투 (roadmap 0-6, 서버 없음). M2에서 서버로 옮길 때 shared 함수를 그대로 쓴다
import {
  applyHit, canBeHit, canTurn, damageOf, hitTest, newBody, newFighter, stepBody, stepFighter, stepMove,
  type ActionDef, type Body, type BodyEvent, type Bounds, type Fighter, type MoveSpeed, type Vec2,
  type WeaponDef, MONSTERS,
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

/** 플레이어 한 틱: 행동 → (행동 중이 아니면) 이동 → active 진입 시 판정 */
export function stepPlayer(
  p: LocalPlayer, weapon: WeaponDef, input: PlayerInput, dt: number, speed: MoveSpeed, bounds: Bounds,
  monsters: LocalMonster[],
) {
  const events = stepFighter(p.fighter, weapon, input, dt);
  if (input.x && canTurn(p.fighter)) p.facing = Math.sign(input.x);
  const moved = p.fighter.run ? 0 : stepAndMeasure(p, input, dt, speed, bounds);
  const hits: HitResult[] = [];
  for (const e of events) {
    if (e.type !== 'active' || !e.run.def.hitbox) continue;
    hits.push(...strike(p, e.run.def, monsters));
  }
  return { events, hits, moved };
}

function stepAndMeasure(p: LocalPlayer, input: PlayerInput, dt: number, speed: MoveSpeed, bounds: Bounds): number {
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
    if (!canBeHit(m.body, def.flags) || !hitTest(a, def.hitbox!, t)) continue;
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

export const newPlayer = (pos: Vec2): LocalPlayer => ({ pos, facing: 1, fighter: newFighter() });
