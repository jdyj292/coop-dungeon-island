// 섬 아래 띠 버튼 이름표의 챙길 일(쓸 SP)·가방 아래 돈 상자 (hud.md 8장, 승인 데모 island_hud_help.html)
import { COMBAT } from '@game/shared';
import type { IslandConnection } from '../net/islandNet';
import type { DetailLine } from '../ui/listPanel';

/** 쓸 SP 합 (모든 무기) */
export const spLeft = (conn: IslandConnection): number =>
  conn.skills.weapons.reduce((n, w) => n + Math.max(0, w.sp - w.spent), 0);

/** 가방 아래 상자: 지갑·공동 금고 (아래 띠 대신 여기서 확인) */
export const moneyLines = (conn: IslandConnection): DetailLine[] => [
  { icon: 'coin', text: `지갑 ${conn.me.wallet} · 내 장식·물약` },
  { icon: 'vault', text: `금고 ${conn.island.treasury} · 던전 코인 ${Math.round(COMBAT.settle.treasury * 100)}%`, dim: true },
];
