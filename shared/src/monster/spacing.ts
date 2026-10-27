// 몬스터 퍼지기·대각선 조준 (dungeon.md 3장): 한 번 휘두르기에 여러 마리가 같이 맞지 않게 자리를 나누고,
// 옆 줄에 선 몬스터도 깊이를 조금 틀어 칠 수 있게 한다. 값은 combat.json ai (aimDepth, spread)
import { COMBAT } from '../data/load';
import type { MonsterAttack } from '../data/schema';
import type { Bounds } from '../movement';
import type { Monster } from './state';

type Pt = { x: number; y: number };

/** 대각선 조준이 되는 공격: 근접 타격(내려치기·박치기). 돌진·구르기(줄 예고)·투사체·장판은 똑바로 */
export const aimable = (def: MonsterAttack): boolean =>
  def.damage > 0 && !def.projectile && !def.zone && !(def.move && 'speed' in def.move);

/** 공격 시작 때 고정하는 깊이 조준 (플레이어 쪽, 최대 aimDepth) */
export function aimDy(m: Monster, def: MonsterAttack, player: Pt): number {
  if (!aimable(def)) return 0;
  const lim = COMBAT.ai.aimDepth;
  return Math.max(-lim, Math.min(lim, player.y - m.body.y));
}

/** 전진하며 치는 공격(박치기)은 몸이 대각선으로 움직이고, 제자리 공격은 판정만 깊이로 옮긴다 */
export const aimMoves = (def: MonsterAttack): boolean => !!def.move && 'distance' in def.move;

/** 공격 판정·예고 기준점 (서버 판정과 클라이언트 예고가 같은 함수) */
export function attackOrigin(m: Monster): { x: number; y: number; facing: number } {
  const a = m.attack!;
  return { x: m.body.x, y: m.body.y + (aimMoves(a.def) ? 0 : a.dy), facing: a.dir };
}

const near = (a: Pt, b: Pt) => Math.abs(a.x - b.x) < COMBAT.ai.spread.x && Math.abs(a.y - b.y) < COMBAT.ai.spread.y;
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * 가려는 자리에 나보다 플레이어에 가까운 동료가 이미 있으면 다른 자리:
 * 플레이어 반대편 → 위·아래 줄(lane) → 반대편 위·아래 줄. 다 막히면 기다리는 자리(ringSlot)로 물러남
 * (뒤에 줄 서지 않게). 가까운 쪽이 자리를 지키므로 매 틱 같은 답이 나와 떨리지 않는다
 */
export function spreadGoal(m: Monster, goal: Pt, player: Pt, others: readonly Monster[]): Pt {
  const mine = dist(m.body, player);
  const ahead = others.filter((o) => o !== m && !o.body.gone && !o.body.ko && o.def.move && dist(o.body, player) < mine);
  const taken = (g: Pt) => ahead.some((o) => near(o.body, g));
  if (!taken(goal)) return goal;
  const s = COMBAT.ai.spread, off = goal.x - player.x;
  const other = player.x - off;
  const options = [
    { x: other, y: goal.y },
    { x: goal.x, y: goal.y + s.lane }, { x: goal.x, y: goal.y - s.lane },
    { x: other, y: goal.y + s.lane }, { x: other, y: goal.y - s.lane },
  ];
  return options.find((g) => !taken(g)) ?? ringSlot(m, player);
}

/** 황금각: 번호가 이어진 몬스터도 고리 위에서 고르게 흩어진다 */
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/**
 * 공격 차례가 아닌 몬스터가 기다리는 자리: 플레이어 둘레 타원(좌우 orbitDistance, 깊이 orbitDepth) 위,
 * 몬스터 번호마다 다른 각도 → 양옆·위아래로 나뉘어 둘러싼다 (한쪽에 일자로 줄 서지 않게)
 */
export function ringSlot(m: Monster, player: Pt, bounds?: Bounds): Pt {
  const ai = COMBAT.ai, a = m.id * GOLDEN;
  let dx = Math.cos(a) * ai.orbitDistance, dy = Math.sin(a) * ai.orbitDepth;
  // 방 밖 자리는 반대편으로 뒤집는다 (벽에 몰려 줄 서지 않게)
  if (bounds && (player.x + dx < bounds.minX || player.x + dx > bounds.maxX)) dx = -dx;
  if (bounds && (player.y + dy < bounds.minY || player.y + dy > bounds.maxY)) dy = -dy;
  return { x: player.x + dx, y: player.y + dy };
}

/** 이보다 가까우면(타원 비율, 좌우 약 20px) 플레이어가 바로 옆까지 다가온 것: 물러나지 않고 그대로 */
const HOLD = 0.35;

/**
 * 기다리는 몬스터가 갈 곳: 제 자리(ringSlot)로. 자리가 플레이어 반대편이면 위·아래로 돌아서 가고(가로지르지 않게),
 * 플레이어가 바로 옆까지 다가왔으면 물러나지 않고 그대로 (쫓아가면 잡힌다)
 */
export function waitGoal(m: Monster, player: Pt, bounds?: Bounds): Pt | null {
  const ai = COMBAT.ai, b = m.body;
  if (Math.hypot((b.x - player.x) / ai.orbitDistance, (b.y - player.y) / ai.orbitDepth) < HOLD) return null;
  const slot = ringSlot(m, player, bounds);
  const across = Math.sign(b.x - player.x) !== Math.sign(slot.x - player.x) && Math.abs(b.y - player.y) < ai.orbitDepth * HOLD;
  return across ? { x: b.x, y: player.y + (slot.y >= player.y ? 1 : -1) * ai.orbitDepth } : slot;
}
