// 공격 토큰: 동시에 공격 동작(windup~active)에 들어갈 수 있는 일반 몬스터 수 (docs/dungeon.md 3장, 수 combat.json tokens)
import { COMBAT } from '../data/load';

export class AttackTokens {
  private holders = new Set<number>();
  readonly count: number;

  /** partySize = 던전 인원 (1~4) */
  constructor(partySize = 1) {
    const t = COMBAT.tokens;
    this.count = t[Math.min(t.length, Math.max(1, partySize)) - 1]!;
  }

  /** 이 몬스터가 지금 토큰을 가질 수 있나 */
  available(id: number): boolean {
    return this.holders.has(id) || this.holders.size < this.count;
  }

  tryTake(id: number): boolean {
    if (this.holders.has(id)) return true;
    if (this.holders.size >= this.count) return false;
    this.holders.add(id);
    return true;
  }

  release(id: number): void {
    this.holders.delete(id);
  }

  get used(): number {
    return this.holders.size;
  }
}
