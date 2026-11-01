// cards.json · packs.json 교차 참조 (docs/data.md 10장): 모든 스킬·패시브가 카드인지, 카드가 있는 스킬·패시브인지,
// 티어·팩 범위·확률 합, 처음 카드, 계열 보너스 효과 형식, 색 키
import type { CrossRefs, GameData, Issue } from './crossCheck';
import * as S from './schema';

const sum = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0);

export function checkCards(d: GameData, refs: CrossRefs): Issue[] {
  const out: Issue[] = [];
  const err = (where: string, message: string) => out.push({ level: 'error', where, message });
  const { tiers, cards, starter, branchBonus } = d.cards;
  const tierNos = Object.keys(tiers).map(Number).sort((a, b) => a - b);
  const hasTier = (t: number) => !!tiers[String(t)];
  const color = (where: string, key: string) => { if (!refs.cardColors.includes(key)) err(where, `색 '${key}'가 palette.json global.ui.card에 없음`); };

  tierNos.forEach((t, i) => { if (t !== i + 1) err(`cards.tiers.${t}`, '티어 번호는 1부터 빠짐없이'); });
  for (const [t, def] of Object.entries(tiers)) color(`cards.tiers.${t}.color`, def.color);

  // 카드 → 스킬·패시브
  const commonIds = Object.values(d.passives).filter((p) => p.weapon === '*').map((p) => p.id);
  for (const [id, c] of Object.entries(cards)) {
    const at = `cards.cards.${id}`;
    if (!d.weapons[c.weapon]) err(`${at}.weapon`, `무기 '${c.weapon}' 없음`);
    if (!hasTier(c.tier)) err(`${at}.tier`, `티어 ${c.tier}가 tiers에 없음`);
    const [w, pid] = id.split('.');
    // 공용 패시브: 펼치기 전(data-validate)이면 '*' 원본, 펼친 뒤(게임 로더)면 '<무기>.<id>'
    const src = c.kind === 'active' ? d.skills[id]
      : d.passives[id] ?? (pid !== undefined && w === c.weapon && commonIds.includes(pid) ? { weapon: c.weapon, branch: 'common' } : undefined);
    if (!src) err(at, c.kind === 'active' ? '스킬(skills.json)이 아님' : '패시브(passives.json, 공용은 <무기>.<id>)가 아님');
    else {
      if (src.weapon !== c.weapon) err(`${at}.weapon`, `원본 무기 '${src.weapon}'와 다름`);
      if (src.branch !== c.branch) err(`${at}.branch`, `원본 계열 '${src.branch}'와 다름`);
    }
    if (c.cost !== undefined && c.kind !== 'passive') err(`${at}.cost`, '비용은 패시브 카드만');
  }
  // 스킬·패시브 → 카드 (공용 패시브는 카드가 있는 무기마다)
  for (const id of Object.keys(d.skills)) if (!cards[id]) err(`skills.${id}`, '카드(cards.json)가 없음');
  const cardWeapons = new Set(Object.values(cards).map((c) => c.weapon));
  for (const p of Object.values(d.passives)) {
    if (p.weapon !== '*') { if (!cards[p.id] && (p.branch !== 'common' || cardWeapons.has(p.weapon))) err(`passives.${p.id}`, '카드(cards.json)가 없음'); }
    else for (const w of cardWeapons) if (!cards[`${w}.${p.id}`]) err(`passives.${p.id}`, `카드 '${w}.${p.id}'가 없음`);
  }

  for (const [w, ids] of Object.entries(starter)) {
    for (const id of ids) if (cards[id]?.weapon !== w || cards[id]?.branch !== 'base' || cards[id]?.kind !== 'active') err(`cards.starter.${w}`, `'${id}'는 이 무기 기본 스킬 카드가 아님`);
    if (ids.length > d.combat.card.activeSlots) err(`cards.starter.${w}`, '액티브 칸보다 많음');
  }
  for (const w of cardWeapons) if (!starter[w]) err(`cards.starter`, `무기 '${w}' 처음 카드 없음`);

  const effect = S.passive.shape.effect;
  for (const [w, byBranch] of Object.entries(branchBonus)) {
    if (!d.weapons[w]) err(`cards.branchBonus.${w}`, `무기 '${w}' 없음`);
    for (const [b, steps] of Object.entries(byBranch)) {
      if (steps.length !== d.combat.card.branchBonusAt.length) err(`cards.branchBonus.${w}.${b}`, `단계 ${steps.length} ≠ combat.json card.branchBonusAt ${d.combat.card.branchBonusAt.length}`);
      steps.forEach((e, i) => {
        const r = effect.safeParse(e);
        if (!r.success) err(`cards.branchBonus.${w}.${b}.${i}`, r.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join(', '));
      });
    }
  }

  for (const [n, p] of Object.entries(d.packs.packs)) {
    const at = `packs.packs.${n}`;
    color(`${at}.color`, p.color);
    if (p.minTier > p.maxTier || !hasTier(p.minTier) || !hasTier(p.maxTier)) err(at, `티어 범위 ${p.minTier}~${p.maxTier}가 tiers 밖이거나 뒤집힘`);
    if (p.odds.length !== p.maxTier - p.minTier + 1) err(`${at}.odds`, `길이 ${p.odds.length} ≠ 티어 ${p.minTier}~${p.maxTier}`);
    if (sum(p.odds) !== 100) err(`${at}.odds`, `합 ${sum(p.odds)} ≠ 100`);
    if (p.lastMinTier < p.minTier || p.lastMinTier > p.maxTier) err(`${at}.lastMinTier`, '티어 범위 밖');
    if (p.lastOdds) {
      if (p.lastOdds.length !== p.maxTier - p.lastMinTier + 1) err(`${at}.lastOdds`, `길이 ${p.lastOdds.length} ≠ 티어 ${p.lastMinTier}~${p.maxTier}`);
      if (sum(p.lastOdds) !== 100) err(`${at}.lastOdds`, `합 ${sum(p.lastOdds)} ≠ 100`);
    } else if (!sum(p.odds.slice(p.lastMinTier - p.minTier))) err(`${at}.lastMinTier`, '마지막 장에 나올 티어의 확률이 0');
    if (p.pity && (p.pity.tier < p.minTier || p.pity.tier > p.maxTier)) err(`${at}.pity.tier`, '티어 범위 밖');
  }
  if (!d.packs.packs[String(d.combat.card.welcomePacks.pack)]) err('combat.card.welcomePacks.pack', `팩 ${d.combat.card.welcomePacks.pack} 없음`);
  return out;
}
