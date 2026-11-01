// 카드 창 그리기 값 (hud.md 8장): 카드 하나의 모양·상세, 보유 카드 줄(기본·공용 / A / B, 티어 순), 계열 보너스. 순수 함수 (stage/islandCards.ts가 씀)
import {
  bonusStep, BRANCHES, canEnhance, cardBranch, craftPriceOf, dustOf, equipLevelOf, owns, passiveCost, PASSIVES, SKILLS, tierDef, tierOf, weaponCards, weaponDef,
  type Branch, type CardKind, type CardLoadout, type Collection,
} from '@game/shared';
import { frameStyle } from '../ui/cardFrame';
import { SK } from '../ui/cardParts';
import type { BonusInfo, CardInfo } from '../ui/cardTypes';
import { bonusLines } from './cardText';

const KEYS = ['A', 'S', 'D', 'F'];
const branchName = (weapon: string, b: Branch): string => weaponDef(weapon).branches?.[b].name ?? b;
const branchColor = (weapon: string, b: Branch): string => `global.ui.skillBranch.${weapon}.${b}`;

export type CardView = 'act' | 'pas';
export interface CardRow { branch: Branch | 'base'; name: string; color: string; ids: string[] }

/** 카드 줄: 기본(공용) / 계열들, 줄 안은 티어 순 (카드 상점 지정 구매·고르기 창 거르기 탭) */
export function cardRows(weapon: string, view: CardView): CardRow[] {
  const kind: CardKind = view === 'act' ? 'active' : 'passive', ids = weaponCards(weapon, kind).sort((a, b) => tierOf(a) - tierOf(b));
  return [
    { branch: 'base' as const, name: view === 'act' ? '기본' : '공용', color: SK.key, ids: ids.filter((id) => ['base', 'common'].includes(cardBranch(id))) },
    ...BRANCHES.map((b) => ({ branch: b, name: branchName(weapon, b), color: branchColor(weapon, b), ids: ids.filter((id) => cardBranch(id) === b) })),
  ];
}

/** 고르기 창 거르기 탭: 전체 + 카드가 있는 줄 (계열이 늘면 탭도 늘어남) */
export function pickFilters(weapon: string, view: CardView): { name: string; ids: string[] }[] {
  const rows = cardRows(weapon, view).filter((r) => r.ids.length);
  return [{ name: '전체', ids: rows.flatMap((r) => r.ids) }, ...rows.map((r) => ({ name: r.name, ids: r.ids }))];
}

/** 계열 보너스: 끼운 같은 계열 카드 (기본·공용 빼고) → 단계·효과 글자 */
export function cardBonus(weapon: string, lo: CardLoadout): BonusInfo[] {
  const eq = [...lo.active.filter((x): x is string => !!x), ...lo.passive];
  return BRANCHES.map((b) => {
    const ids = eq.filter((id) => cardBranch(id) === b);
    return { branch: b, name: branchName(weapon, b), color: branchColor(weapon, b), ids, step: bonusStep(ids.length), steps: bonusLines(weapon, b) };
  });
}

/** 카드 하나: 모양(계열 테두리·보유·강화·강화 가능·자물쇠·꼬리표) + 상세(이름·설명·변형·효과·비용·조각 값) */
export function cardInfo(weapon: string, level: number, c: Collection, lo: CardLoadout, id: string): CardInfo {
  const s = SKILLS[id], pv = PASSIVES[id], br = cardBranch(id), o = c[id], tier = tierOf(id), lv = equipLevelOf(id);
  const owned = owns(c, id), enhanced = !!o?.enhanced, plain = br === 'base' || br === 'common', vars = s?.variants ?? {};
  const k = lo.active.indexOf(id), equipped = k >= 0 || lo.passive.includes(id);
  return {
    id, tier, tierColor: `global.ui.card.${tierDef(tier)?.color ?? 'tier1'}`, frame: frameStyle(weapon, br), owned, enhanced, ready: canEnhance(c, id),
    count: o?.count ?? 0, spare: enhanced ? o!.count : 0, equipLevel: lv, locked: owned && level < lv, tag: k >= 0 ? KEYS[k]! : equipped ? 'P' : null,
    name: s?.name ?? pv?.name ?? id, desc: s?.desc ?? pv?.desc ?? '', active: !!s,
    kind: br === 'base' ? '기본 스킬' : br === 'common' ? '공용 패시브' : `${branchName(weapon, br)} · ${s ? '액티브' : '패시브'}`,
    color: plain ? SK.key : branchColor(weapon, br), branchName: plain ? null : branchName(weapon, br), equipped,
    variants: Object.values(vars).map((v) => ({ name: v.name, desc: v.desc })), variantIndex: o?.variant ? Object.keys(vars).indexOf(o.variant) : -1,
    ...(pv ? { pointDesc: pv.pointDesc } : {}), cost: passiveCost(id, enhanced), dust: dustOf(id), craft: craftPriceOf(id),
  };
}
