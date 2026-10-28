// 공격 토큰: 동시에 공격 동작(windup~active)에 들어갈 수 있는 일반 몬스터 수 (docs/dungeon.md 3장, 수 combat.json tokens)
// 토큰을 하나 내준 뒤 tokenGap초 동안은 다른 몬스터가 새로 받지 못한다 (공격이 겹쳐 오지 않게, 인원별 combat.json tokenGap)
import { COMBAT } from '../data/load';

const byParty = (t: readonly number[], partySize: number): number => t[Math.min(t.length, Math.max(1, partySize)) - 1]!;

export class AttackTokens {
  private holders = new Set<number>();
  readonly count: number;
  readonly gap: number;
  /** 다음 토큰을 내줄 수 있을 때까지 남은 초 */
  private gapLeft = 0;

  /** partySize = 던전 인원 (1~4) */
  constructor(partySize = 1) {
    this.count = byParty(COMBAT.tokens, partySize);
    this.gap = byParty(COMBAT.tokenGap, partySize);
  }

  step(dt: number): void {
    this.gapLeft = Math.max(0, this.gapLeft - dt);
  }

  /** 이 몬스터가 지금 토큰을 가질 수 있나 */
  available(id: number): boolean {
    return this.holders.has(id) || (this.holders.size < this.count && this.gapLeft === 0);
  }

  tryTake(id: number): boolean {
    if (this.holders.has(id)) return true;
    if (!this.available(id)) return false;
    this.holders.add(id);
    this.gapLeft = this.gap;
    return true;
  }

  release(id: number): void {
    this.holders.delete(id);
  }

  get used(): number {
    return this.holders.size;
  }
}
