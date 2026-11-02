// 계열 보너스 (docs/skills.md 1장, 값 cards.json branchBonus): 장착한 같은 계열 카드(액티브 + 패시브) 수로 Ⅰ·Ⅱ.
// Ⅱ가 Ⅰ을 대신. 효과 키는 passives.json effect와 같음 (passives.ts perksOf가 합침)
import { CARD_DATA } from '../data/load';
import { BRANCHES, CARD, CARDS, type Branch } from './catalog';

/** 계열별 장착 장수 (그 무기 카드만) */
export function branchCounts(weapon: string, ids: Iterable<string>): Record<Branch, number> {
  const out: Record<Branch, number> = { A: 0, B: 0 };
  for (const id of new Set(ids)) {
    const c = CARDS[id];
    if (c?.weapon === weapon && (c.branch === 'A' || c.branch === 'B')) out[c.branch]++;
  }
  return out;
}

/** 장수 → 보너스 단계 (0 = 없음, 1 = Ⅰ, 2 = Ⅱ) */
export const bonusStep = (count: number): number => CARD.branchBonusAt.filter((n) => count >= n).length;

/** 켜진 보너스 효과를 계열마다 (단계 0이면 빠짐) */
export function branchBonuses(weapon: string, ids: Iterable<string>): { branch: Branch; step: number; effect: Readonly<Record<string, number>> }[] {
  const counts = branchCounts(weapon, ids), table = CARD_DATA.branchBonus[weapon];
  return BRANCHES.flatMap((branch) => {
    const step = bonusStep(counts[branch]), effect = step ? table?.[branch][step - 1] : undefined;
    return effect ? [{ branch, step, effect }] : [];
  });
}
