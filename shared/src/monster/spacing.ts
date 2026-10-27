// 몬스터 퍼지기·대각선 조준 (dungeon.md 3장): 한 번 휘두르기에 여러 마리가 같이 맞지 않게 자리를 나누고,
// 옆 줄에 선 몬스터도 깊이를 조금 틀어 칠 수 있게 한다. 값은 combat.json ai (aimDepth, spread)
import { COMBAT } from '../data/load';
import type { MonsterAttack } from '../data/schema';
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
 * 플레이어 반대편 → 위·아래 줄(lane) → 반대편 위·아래 줄. 다 막히면 한 칸 뒤에서 기다림.
 * 가까운 쪽이 자리를 지키므로 매 틱 같은 답이 나와 떨리지 않는다
 */
export function spreadGoal(m: Monster, goal: Pt, player: Pt, others: readonly Monster[]): Pt {
  const mine = dist(m.body, player);
  const ahead = others.filter((o) => o !== m && !o.body.gone && !o.body.ko && o.def.move && dist(o.body, player) < mine);
  const taken = (g: Pt) => ahead.some((o) => near(o.body, g));
  if (!taken(goal)) return goal;
  const s = COMBAT.ai.spread, off = goal.x - player.x, side = Math.sign(off) || 1;
  const other = player.x - off;
  const options = [
    { x: other, y: goal.y },
    { x: goal.x, y: goal.y + s.lane }, { x: goal.x, y: goal.y - s.lane },
    { x: other, y: goal.y + s.lane }, { x: other, y: goal.y - s.lane },
  ];
  return options.find((g) => !taken(g)) ?? { x: goal.x + side * s.x, y: goal.y };
}
