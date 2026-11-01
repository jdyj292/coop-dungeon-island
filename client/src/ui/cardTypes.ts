// 카드 창 그리기 값·판정 (hud.md 8장). 그리기는 cardWindow.ts(장착)·cardPicker.ts(고르기 창)·cardDetail.ts(상세), 값은 stage/islandCards.ts CardPanel
import type { Branch } from '@game/shared';
import type { FaceLook } from './cardParts';

export type CardBtn = 'grind' | 'equip' | 'enhance';
export type CardHit =
  | { kind: 'tab'; i: number } | { kind: 'card'; id: string } | { kind: 'aslot'; k: number } | { kind: 'pslot'; i: number } | { kind: 'padd' }
  | { kind: 'filter'; i: number } | { kind: 'pclose' } | { kind: 'bonus'; b: Branch } | { kind: 'btn'; b: CardBtn } | { kind: 'var'; i: number } | { kind: 'inside' };

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
  /** 종류 글자 ("기본 스킬", "파쇄 · 액티브" 등) */
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

/** 고르기 창: 액티브(slot = 끼울 A S D F 칸) 또는 패시브 */
export interface Picker {
  kind: 'active' | 'passive';
  slot: number;
}

/** 고르기 창 칸 수 (가로 · 보이는 줄) */
export const PICK_COLS = 5, PICK_ROWS = 3;
/** 장착 화면 무기 탭 줄 (키보드 칸) */
export const TAB_ROW = -1;

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
  bonus: BonusInfo[];
  bonusAt: readonly number[];
  card(id: string): CardInfo;
  sel: string;
  hover: string | null;
  hoverBtn: string | null;
  hoverBonus: Branch | null;
  /** 장착 화면 키보드 칸 (-1 = 무기 탭 줄, 액티브 0~3, 패시브 4~, 마지막 = 패시브 + 칸) */
  focus: number;
  /** 고르기 창 키보드가 거르기 탭 줄에 있음 (아니면 카드 격자) */
  pickRow: boolean;
  /** 열린 고르기 창 (없으면 장착 화면) */
  picker: Picker | null;
  /** 고르기 창 거르기 탭 (전체 · 기본/공용 · 계열들, 카드가 있는 것만) */
  filters: string[];
  filter: number;
  /** 고르기 창에 보이는 카드 (거른 뒤) · 위에서 넘긴 줄 수 */
  pick: string[];
  scroll: number;
  owned: number;
  total: number;
  /** 갈기 확인 중인 카드 */
  grindArm: string | null;
  note: { text: string; color: string } | null;
  busy: boolean;
}
