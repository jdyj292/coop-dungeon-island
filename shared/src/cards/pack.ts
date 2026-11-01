// 카드팩 굴림 (docs/skills.md 1장 얻기, balance.md 7장 카드 경제, 데이터 packs.json). 굴림은 서버, 난수는 넣어 준다 (테스트·시뮬)
// 1~size−1번째 장 = odds, 마지막 장 = lastMinTier 이상 (lastOdds 또는 odds를 그 티어들로 다시 나눔).
// 같은 티어 안에서는 그 무기 카드가 같은 확률. 무기에 없는 티어는 아래 티어로 (천장도 없음)
import type { PackDef } from '../data/schema';
import { packDef, tierOf, weaponCards } from './catalog';

/** [0, 1) 난수 */
export type Rng = () => number;

export interface PackRoll {
  cards: string[];
  tiers: number[];
  /** 천장 횟수: 마지막 높은 티어 뒤로 연 팩 수 (DB card_pity.opened). 천장 없는 팩은 0 */
  opened: number;
}

/** 무기 카드를 티어별로 */
function byTier(weapon: string): Map<number, string[]> {
  const m = new Map<number, string[]>();
  for (const id of weaponCards(weapon)) {
    const t = tierOf(id);
    m.set(t, [...(m.get(t) ?? []), id]);
  }
  return m;
}

/** 확률표에서 티어 하나 (from = 표의 첫 티어) */
function pickTier(odds: readonly number[], from: number, rng: Rng): number {
  const sum = odds.reduce((s, x) => s + x, 0);
  let r = rng() * sum;
  for (let i = 0; i < odds.length; i++) {
    r -= odds[i]!;
    if (r < 0 && odds[i]! > 0) return from + i;
  }
  let last = 0;
  odds.forEach((x, i) => { if (x > 0) last = i; });
  return from + last;
}

/** 마지막 장 확률표 (lastMinTier부터) */
export function lastOddsOf(p: PackDef): number[] {
  return p.lastOdds ?? p.odds.slice(Math.max(0, p.lastMinTier - p.minTier));
}

/** 무기에 카드가 있는 티어로: 없으면 아래로, 아래에도 없으면 위로 */
function present(tiers: Map<number, string[]>, t: number): number {
  for (let x = t; x >= 1; x--) if (tiers.get(x)?.length) return x;
  return [...tiers.keys()].filter((x) => x > t).sort((a, b) => a - b)[0] ?? t;
}

/** 팩 하나 굴림. opened = 지금까지 천장 횟수. 없는 팩·카드 없는 무기면 빈 결과 */
export function rollPack(weapon: string, pack: number, opened: number, rng: Rng): PackRoll {
  const p = packDef(pack), tiers = byTier(weapon);
  if (!p || !tiers.size) return { cards: [], tiers: [], opened };
  const out: number[] = [];
  for (let i = 0; i < p.size - 1; i++) out.push(present(tiers, pickTier(p.odds, p.minTier, rng)));
  const pity = p.pity && tiers.get(p.pity.tier)?.length ? p.pity : undefined;
  const forced = pity && opened + 1 >= pity.packs && !out.some((t) => t >= pity.tier);
  out.push(forced ? pity.tier : present(tiers, pickTier(lastOddsOf(p), p.lastMinTier, rng)));
  const cards = out.map((t) => {
    const ids = tiers.get(t)!;
    return ids[Math.min(ids.length - 1, Math.floor(rng() * ids.length))]!;
  });
  return { cards, tiers: out, opened: pity ? (out.some((t) => t >= pity.tier) ? 0 : opened + 1) : 0 };
}
