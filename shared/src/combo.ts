// 개인 콤보 (솔로, docs/dungeon.md 3장): 적중이 windowSec 안에 이어지면 카운터 유지. 팀 콤보는 M2 (combat.md 7장)
// 30 / 60 / 90 단계 코인 보너스는 보상이 생기는 M3에서
import { COMBAT } from './data/load';

export interface Combo {
  count: number;
  /** 다음 적중까지 남은 시간 (0이면 끊김) */
  left: number;
  /** 이번 판 최고 */
  best: number;
}

export const newCombo = (): Combo => ({ count: 0, left: 0, best: 0 });

/** 적중 hits번 (한 틱에 여러 마리를 맞히면 그 수만큼) */
export function comboHit(c: Combo, hits = 1): void {
  if (hits <= 0) return;
  c.count += hits;
  c.left = COMBAT.combo.windowSec;
  c.best = Math.max(c.best, c.count);
}

export function stepCombo(c: Combo, dt: number): void {
  if (c.left <= 0) return;
  c.left = Math.max(0, c.left - dt);
  if (c.left === 0) c.count = 0;
}
