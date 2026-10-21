// 몬스터 대상 선택 (docs/dungeon.md 3장): 공격 중이 아니면 가장 가까운 플레이어, 공격 중에는 대상 유지
// 쓰러짐·무적인 플레이어는 후보에서 빼고, 후보가 없으면 전원 중 가장 가까운 플레이어
import type { Monster } from '../monster/state';
import type { PlayerState } from '../player';
import { isInvulnerable } from '../playerHurt';

export interface AimCandidate {
  pid: string;
  state: PlayerState;
}

export function chooseTarget(m: Monster, players: AimCandidate[], current: string | undefined): string | undefined {
  if (m.attack && current && players.some((p) => p.pid === current)) return current;
  const open = players.filter((p) => !isInvulnerable(p.state));
  const list = open.length ? open : players;
  let best: AimCandidate | undefined, bestD = Infinity;
  for (const p of list) {
    const d = Math.hypot(p.state.pos.x - m.body.x, p.state.pos.y - m.body.y);
    if (d < bestD) [best, bestD] = [p, d];
  }
  return best?.pid;
}
