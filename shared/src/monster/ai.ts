// 몬스터 AI 한 틱: 피격 반응 → 어지러움·그로기 → 공격 진행 → 감지·공격 선택·이동 (docs/combat.md 6장, docs/dungeon.md 3·5장)
import { stepBody } from '../body';
import { COMBAT } from '../data/load';
import type { MonsterAttack } from '../data/schema';
import { actionHits } from '../shapes';
import { endAttack, startAttack, stepAttack, type AiContext, type MonsterEvent } from './attack';
import { hasArmor, monsterBounds, monsterHalf, stepBodyIn, type Monster } from './state';
import { aimable, aimDy, spreadGoal, waitGoal } from './spacing';
import { moveBox } from '../map/collision';

export type { AiContext, MonsterEvent };

const sideOf = (m: Monster, px: number) => (m.body.x >= px ? 1 : -1);

/** 공격이 지금 플레이어에게 닿을 만한가 (패턴 규칙에 거리 조건이 없을 때, 보스) */
function canReach(m: Monster, def: MonsterAttack, ctx: AiContext): boolean {
  const p = ctx.player, dx = p.x - m.body.x, dy = p.y - m.body.y;
  if (def.zone || def.damage === 0) return true;
  const mv = def.move;
  if (mv && 'speed' in mv) return Math.abs(dy) <= (def.hitbox?.depth ?? 0) / 2 && Math.abs(dx) <= mv.maxDistance;
  const target = ctx.target ?? { x: p.x, y: p.y, airborne: false, hurtbox: { width: 1, depth: 1 } };
  return actionHits({ x: m.body.x, y: m.body.y + aimDy(m, def, p), facing: dx < 0 ? -1 : 1 }, def, target);
}

/** 쓸 공격과 (못 쓰면) 가고 싶은 자리 */
function decide(m: Monster, ctx: AiContext): { def?: MonsterAttack; goal?: { x: number; y: number } } {
  const p = ctx.player, dx = Math.abs(p.x - m.body.x), dy = Math.abs(p.y - m.body.y);
  const attacks = new Map(m.def.attacks.map((a) => [a.id, a]));
  const ready = (id: string) => (m.cooldowns[id] ?? 0) <= 0;
  const side = sideOf(m, p.x);
  const pat = m.def.pattern;
  if (pat.type === 'loop') {
    // 체력 조건을 넘으면 다음 단계 (예: "hp<0.5")
    const cur = pat.phases[m.loop.phase]!;
    const lim = /^hp<([\d.]+)$/.exec(cur.until ?? '');
    if (lim && m.hp / m.maxHp < Number(lim[1]) && m.loop.phase < pat.phases.length - 1) m.loop = { phase: m.loop.phase + 1, index: 0 };
    if (m.timer > 0) return {};
    const def = attacks.get(pat.phases[m.loop.phase]!.sequence[m.loop.index]!)!;
    if (canReach(m, def, ctx)) return { def };
    const near = def.move && 'speed' in def.move ? m.body.x : p.x + side * 24;
    return { goal: { x: near, y: p.y } };
  }
  const usable = pat.rules.filter((r) => {
    const def = attacks.get(r.attack)!;
    // 대각선 조준이 되는 공격은 aimDepth만큼 더 비껴 있어도 친다
    const depthOk = dy <= (r.alignDepth ?? (def.hitbox?.depth ?? def.area?.radius ?? 8) / 2) + (aimable(def) ? COMBAT.ai.aimDepth : 0);
    return ready(r.attack) && dx >= r.range[0] && dx <= r.range[1] && depthOk;
  });
  if (usable.length) return { def: attacks.get(usable[Math.floor(ctx.rng() * usable.length)]!.attack) };
  const ai = COMBAT.ai, rule = pat.rules[0]!;
  if (m.def.ai.type === 'turret') return {};
  if (m.def.ai.type === 'charger') {
    // 돌진 거리를 벌릴 자리가 벽 너머면 반대편으로 돌아간다 (벽에 끼어 돌진을 못 하지 않게)
    const b = monsterBounds(m, ctx.bounds), want = p.x + side * ai.chargerDistance;
    const x = want < b.minX || want > b.maxX ? p.x - side * ai.chargerDistance : want;
    return { goal: { x, y: p.y } };
  }
  return { goal: { x: p.x + side * (rule.range[0] + rule.range[1]) / 2, y: p.y } };
}

function moveToward(m: Monster, goal: { x: number; y: number }, dt: number, ctx: AiContext): void {
  const sp = m.def.move;
  if (!sp) return;
  if (sp.style === 'hop') {
    // 튀어 다가오기: 박자의 앞부분만 이동 (motion.md 8장)
    m.hopT += dt;
    if (m.hopT % COMBAT.ai.hopSec > COMBAT.ai.hopSec * COMBAT.ai.hopMove) {
      m.moving = true;
      return;
    }
  }
  const b = m.body, bd = monsterBounds(m, ctx.bounds);
  const step = (cur: number, to: number, v: number) => (Math.abs(to - cur) <= 1 ? cur : cur + Math.sign(to - cur) * Math.min(Math.abs(to - cur), v * dt));
  const n = moveBox(b, { x: step(b.x, goal.x, sp.x), y: step(b.y, goal.y, sp.y) }, monsterHalf(m), bd);
  m.moving = n.x !== b.x || n.y !== b.y || sp.style === 'hop';
  b.x = n.x;
  b.y = n.y;
}

export function stepMonsterAi(m: Monster, dt: number, ctx: AiContext): MonsterEvent[] {
  const ev: MonsterEvent[] = [];
  for (const id of Object.keys(m.cooldowns)) m.cooldowns[id] = Math.max(0, m.cooldowns[id]! - dt);
  m.moving = false;
  m.body.armor = hasArmor(m);
  for (const e of stepBodyIn(m, dt, ctx.bounds)) ev.push({ type: 'body', e });
  if (m.body.ko || m.body.state !== 'idle') {
    // 맞아서 반응 중이면 공격은 끊긴다 (슈퍼아머면 body가 idle 그대로라 계속)
    if (m.attack) endAttack(m, ctx);
    if (m.mode === 'selfStun') m.mode = 'idle';
    // 띄워지거나 다운되면 빙결이 풀린다 (경직은 그대로 이어짐)
    if (m.body.state === 'air' || m.body.state === 'down') m.frozen = 0;
    return ev;
  }
  // 잠: 아무것도 하지 않음 (맞으면 strike.ts가 깨움)
  if (m.sleep > 0) return ev;
  // 빙결: 하던 공격은 취소, 움직이지 않음
  if (m.frozen > 0) {
    if (m.attack) endAttack(m, ctx);
    return ev;
  }
  if (m.mode === 'selfStun' || m.mode === 'groggy') {
    m.timer -= dt;
    if (m.timer <= 0) Object.assign(m, { mode: 'idle', timer: 0 });
    return ev;
  }
  if (m.mode === 'attack') return ev.concat(stepAttack(m, dt, ctx));

  const p = ctx.player, dx = p.x - m.body.x;
  if (!m.aware && Math.hypot(dx, p.y - m.body.y) <= m.def.detectRange) m.aware = true;
  if (!m.aware) return ev;
  if (dx !== 0) m.facing = Math.sign(dx);
  if (m.timer > 0) m.timer = Math.max(0, m.timer - dt);
  const { def, goal } = decide(m, ctx);
  const free = !m.def.usesToken || ctx.tokens.available(m.id);
  const eliteOk = m.def.rank !== 'elite' || !ctx.eliteBusy(m);
  if (def && free && eliteOk) {
    ev.push(startAttack(m, def, ctx));
    return ev;
  }
  // 공격 차례(토큰)면 다가가되 앞자리를 동료가 차지했으면 반대편·옆 줄로, 아니면 둘레의 제 자리에서 기다림 (spacing.ts)
  const to = !free ? waitGoal(m, ctx.player, monsterBounds(m, ctx.bounds)) : goal ? spreadGoal(m, goal, ctx.player, ctx.others) : null;
  if (to) moveToward(m, to, dt, ctx);
  return ev;
}
