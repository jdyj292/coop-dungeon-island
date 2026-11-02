// shared/data/cards.json · packs.json 형식 (docs/data.md 10장, 값 balance.md 7장 카드 경제)
// 계열 보너스 효과는 숫자 키 묶음: passives.json effect 형식인지는 crossCheck가 본다 (schema.ts와 순환 import를 피함)
import { z } from 'zod';

const int = z.number().int();
const tierNo = int.min(1);
/** 숫자 키 "1"·"2"… */
const numKey = z.string().regex(/^[1-9]\d*$/, '숫자 키 ("1"·"2"…)');
const percent = z.array(z.number().nonnegative()).min(1);

export const tier = z.object({
  /** 장착 숙련도 */
  equipLevel: int.min(1),
  /** 갈면 조각 */
  dust: int.nonnegative(),
  /** 지정 구매 조각 */
  craft: int.positive(),
  /** 테두리 색 키 (palette.json global.ui.card) */
  color: z.string(),
}).strict();

export const card = z.object({
  weapon: z.string(),
  kind: z.enum(['active', 'passive']),
  branch: z.enum(['A', 'B']),
  tier: tierNo,
  /** 패시브 비용 (없으면 티어, 강화해도 그대로) */
  cost: int.positive().optional(),
}).strict();

export const cards = z.object({
  tiers: z.record(numKey, tier),
  cards: z.record(card),
  /** 무기 → 처음 카드 id (티어 1 액티브 2장) */
  starter: z.record(z.array(z.string()).min(1)),
  /** 무기 → 계열 → [Ⅰ, Ⅱ] 효과 (passives.json effect 키) */
  branchBonus: z.record(z.object({ A: z.array(z.record(z.number())), B: z.array(z.record(z.number())) }).strict()),
}).strict();

export const pack = z.object({
  /** 열리는 숙련도 */
  unlockLevel: int.min(1),
  /** 코인 = 조각 같은 수 */
  price: int.positive(),
  size: int.min(1),
  minTier: tierNo,
  maxTier: tierNo,
  /** minTier부터 티어별 확률 (%, 합 100): 1~size−1번째 장 */
  odds: percent,
  /** 마지막 장의 가장 낮은 티어 */
  lastMinTier: tierNo,
  /** lastMinTier부터 티어별 확률. 없으면 odds에서 그 티어들만 다시 나눔 */
  lastOdds: percent.optional(),
  /** packs번째 팩까지 tier가 안 나오면 그 팩 마지막 장 = tier */
  pity: z.object({ tier: tierNo, packs: int.positive() }).strict().optional(),
  /** 팩 색 키 (palette.json global.ui.card) */
  color: z.string(),
}).strict();

export const packs = z.object({ packs: z.record(numKey, pack) }).strict();

export type TierDef = z.infer<typeof tier>;
export type CardDef = z.infer<typeof card>;
export type CardsFile = z.infer<typeof cards>;
export type PackDef = z.infer<typeof pack>;
export type PacksFile = z.infer<typeof packs>;
