// 정산 (CLAUDE.md 핵심 게임 규칙, docs/balance.md 7장): 클리어·귀환 = 코인 × (1 + 콤보 보너스), 전멸 = 코인 절반 손실(보너스 없음)·재료 유지
// 그 코인의 treasury 비율은 공동 금고, 나머지는 개인 지갑. 경험치로 숙련도 레벨. 저장은 M4 (DB)
import { addExp, COMBAT, type S2C } from '@game/shared';
import type { RunLoot } from './reward';

export type RunEnd = S2C['result']['kind'];

export interface Member {
  pid: string;
  name: string;
  /** 정산 전 숙련도 레벨·남은 경험치 (계정이 생기기 전까지 Lv1·0) */
  level: number;
  levelExp: number;
}

export function settle(kind: RunEnd, members: Member[], lootOf: (pid: string) => RunLoot): S2C['result'] {
  const s = COMBAT.settle;
  const lines = members.map((m) => {
    const l = lootOf(m.pid);
    const bonusCoins = kind === 'wipe' ? 0 : Math.round(l.coins * l.bonus);
    const total = kind === 'wipe' ? Math.round(l.coins * (1 - s.wipeCoinLoss)) : l.coins + bonusCoins;
    const treasury = Math.round(total * s.treasury);
    const after = addExp(m.level, m.levelExp, l.exp);
    return {
      pid: m.pid, name: m.name, coins: l.coins, bonusPct: kind === 'wipe' ? 0 : Math.round(l.bonus * 100), bonusCoins,
      lost: kind === 'wipe' ? l.coins - total : 0, wallet: total - treasury, treasury, materials: l.materials, exp: l.exp,
      levelBefore: m.level, levelAfter: after.level, levelExp: after.exp,
    };
  });
  return { kind, lines, treasury: lines.reduce((sum, x) => sum + x.treasury, 0) };
}
