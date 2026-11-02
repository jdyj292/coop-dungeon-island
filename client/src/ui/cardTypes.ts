// 카드 창 그리기 값·판정 (hud.md 8장, 승인 데모 card_window.html · card_redesign.html). 그리기는 cardWindow.ts·cardDetail.ts, 값은 stage/islandCards.ts CardPanel
import type { Branch } from '@game/shared';
import type { FaceLook } from './cardParts';

export type CardView = 'act' | 'pas';
export type CardBtn = 'grind' | 'equip' | 'enhance';
export type CardHit =
  | { kind: 'tab'; i: number } | { kind: 'view'; v: CardView } | { kind: 'card'; id: string } | { kind: 'aslot'; k: number } | { kind: 'pslot'; i: number }
  | { kind: 'passArea' } | { kind: 'bonus'; b: Branch } | { kind: 'btn'; b: CardBtn } | { kind: 'var'; i: number } | { kind: 'inside' };

/** 계열 보너스 한 계열 (그리기용) */
export interface BonusInfo {
  branch: Branch;
  name: string;
  color: string;
  /** 끼운 그 계열 카드 */
  ids: string[];
  /** 0 = 없음, 1 = Ⅰ, 2 = Ⅱ */
  step: number;
  /** [Ⅰ, Ⅱ] 효과 글자 */
  steps: string[][];
}

/** 상세에 보이는 카드 (그리기용) */
export interface CardInfo extends FaceLook {
  name: string;
  desc: string;
  active: boolean;
  /** 종류 글자 ("기본 스킬", "A 파쇄 · 액티브" 등) */
  kind: string;
  branchName: string | null;
  equipped: boolean;
  variants: { name: string; desc: string }[];
  variantIndex: number;
  pointDesc?: string[];
  /** 패시브 비용 (지금 단계: 강화면 +1) */
  cost: number;
  dust: number;
  craft: number;
}

/** 카드 창이 그리는 값 (stage/islandCards.ts CardPanel) */
export interface CardSource {
  tabs: string[];
  tab: number;
  weaponName: string;
  level: number;
  dust: number;
  cap: number;
  used: number;
  merge: number;
  enhancedMul: number;
  active: (string | null)[];
  passive: string[];
  view: CardView;
  rows: { branch: Branch | 'base'; name: string; color: string; ids: string[] }[];
  owned: number;
  total: number;
  bonus: BonusInfo[];
  bonusAt: readonly number[];
  card(id: string): CardInfo;
  sel: string;
  hover: string | null;
  hoverBtn: string | null;
  hoverBonus: Branch | null;
  /** 갈기 확인 중인 카드 */
  grindArm: string | null;
  /** 끌고 있는 카드 (움직였을 때만): 어디서, 놓을 액티브 칸·패시브 칸 위 */
  drag: { id: string; from: string; aslot: number; pass: boolean } | null;
  note: { text: string; color: string } | null;
  busy: boolean;
}

/** 패시브 칸 (놓기 판정) */
export const PASS_AREA = { x: 120, y: 26, w: 116, h: 40 } as const;
