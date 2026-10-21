// 보상 (docs/balance.md 7장): 몬스터가 기절하면 방 안 파티원 모두에게 각자 코인·재료·경험치 (인원과 무관하게 1인당)
// 콤보 코인 보너스는 한 판에서 달성한 가장 높은 단계만 기억하고 정산(3-5)에서 더한다. 보물상자는 E로 한 번 (rooms.json chest)
import { COMBAT, comboCoinBonus, type MonsterDef, type S2C } from '@game/shared';

/** 한 판 동안 쌓이는 개인 보상 */
export interface RunLoot {
  coins: number;
  materials: number;
  exp: number;
  /** 콤보 코인 보너스 비율 (0, 0.05 …) */
  bonus: number;
}

export const newLoot = (): RunLoot => ({ coins: 0, materials: 0, exp: 0, bonus: 0 });

/** 몬스터 하나 처치 보상 (재료는 확률, 1 이상이면 개수) */
export function killReward(def: MonsterDef, rng: () => number): S2C['reward'] {
  const [lo, hi] = def.reward.coins;
  const coins = lo + Math.floor(rng() * (hi - lo + 1));
  const m = def.reward.material ?? 0;
  const material = m >= 1 ? Math.floor(m) : rng() < m ? 1 : 0;
  return { coins, material, exp: def.reward.exp };
}

export function addLoot(l: RunLoot, r: S2C['reward']): void {
  l.coins += r.coins;
  l.materials += r.material;
  l.exp += r.exp;
}

/** 콤보 단계 달성 → 보너스 비율 (더 높을 때만 바뀜). 바뀌었으면 새 비율 */
export function raiseBonus(l: RunLoot, milestone: number, solo: boolean): number | null {
  const rate = comboCoinBonus(milestone, solo ? COMBAT.combo.soloMilestones : COMBAT.combo.teamMilestones);
  if (rate <= l.bonus) return null;
  l.bonus = rate;
  return rate;
}

/** 보낼 메시지 (to = 받는 사람, null = 전원) */
export type LootMessage =
  | { to: string | null; type: 'reward'; msg: S2C['reward'] }
  | { to: string | null; type: 'comboBonus'; msg: S2C['comboBonus'] };

/** 파티원별 한 판 보상 장부 (방이 바뀌어도 이어짐) */
export class LootBook {
  private loots = new Map<string, RunLoot>();

  constructor(private rng: () => number) {}

  of(pid: string): RunLoot {
    let l = this.loots.get(pid);
    if (!l) this.loots.set(pid, (l = newLoot()));
    return l;
  }

  /** 몬스터 기절: 파티원마다 따로 굴린 보상 */
  kill(def: MonsterDef, pids: string[]): LootMessage[] {
    return pids.map((pid) => {
      const r = killReward(def, this.rng);
      addLoot(this.of(pid), r);
      return { to: pid, type: 'reward' as const, msg: r };
    });
  }

  /** 보물상자: 파티원 모두에게 같은 양 */
  chest(c: { coins: number; material: number }, pids: string[]): LootMessage[] {
    return pids.map((pid) => {
      const r = { coins: c.coins, material: c.material, exp: 0 };
      addLoot(this.of(pid), r);
      return { to: pid, type: 'reward' as const, msg: r };
    });
  }

  /** 콤보 단계: 솔로는 그 사람만, 팀은 전원 */
  milestone(count: number, pids: string[], solo: boolean): LootMessage[] {
    const out: LootMessage[] = [];
    for (const pid of pids) {
      const rate = raiseBonus(this.of(pid), count, solo);
      if (rate !== null) out.push({ to: pid, type: 'comboBonus', msg: { count, rate } });
    }
    return out;
  }
}
