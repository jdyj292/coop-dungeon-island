// 카드 창 글자 (hud.md 8장): 요청이 막힌 사유, 계열 보너스 효과 키(cards.json branchBonus) → 화면 글자 (Mul = 배율 %, Add = %p)
import { CARD_DATA, type Branch, type CardMsgFail } from '@game/shared';

const NAME: Record<string, string> = {
  chargeSpeedMul: '충전 속도', chargeBonusAdd: '충전 최대', projectileRangeMul: '투사체 사거리', projectileCooldownMul: '투사체 쿨',
  areaMul: '판정 크기', mpMul: '스킬 MP', slowTimeMul: '감속 시간', slowAdd: '감속량',
};

/** 효과 하나 → "충전 속도 +15%" */
export function bonusText(key: string, v: number): string {
  const name = NAME[key] ?? key;
  if (key.endsWith('Add')) return `${name} +${Math.round(v * 100)}%p`;
  const pct = Math.round((v - 1) * 100);
  return `${name} ${pct > 0 ? '+' : ''}${pct}%`;
}

/** 계열 보너스 [Ⅰ, Ⅱ] 효과 글자 줄 */
export const bonusLines = (weapon: string, branch: Branch): string[][] =>
  (CARD_DATA.branchBonus[weapon]?.[branch] ?? []).map((ef) => Object.entries(ef).map(([k, v]) => bonusText(k, v)));

export const FAIL_TEXT: Record<CardMsgFail, string> = {
  card: '이 칸에 낄 수 없는 카드입니다', owned: '가진 카드가 아닙니다', variant: '변형은 강화 카드만 고릅니다', cap: '패시브 비용 한도를 넘습니다',
  locked: '아직 숙련도가 모자랍니다', slot: '없는 칸입니다', dust: '조각이 모자랍니다', coin: '코인이 모자랍니다', gift: '선물 팩이 없습니다',
  equipped: '장착한 카드의 마지막 장입니다', busy: '출발 카운트다운 중에는 못 바꿉니다',
};

