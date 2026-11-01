// 카드팩 열기 단계 (island.md 5장 팩 열기 연출): 떨어짐 → 열기 → 뒷면 → 모두 뒤집기 → 끝 (합치기 없음, 강화는 카드 창에서), 결과가 늦게 오면 열기를 기다림, 곡 단계
import { describe, expect, it } from 'vitest';
import type { CardInfo } from '../ui/cardTypes';
import { ShopFx } from '../ui/shopFx';
import { PackOpening } from './cardShopOpen';

const info = (id: string) => ({ id, tierColor: 'global.ui.card.tier1', name: id, active: true, enhanced: false, count: 0 }) as unknown as CardInfo;
/** t초 동안 1/60초씩 */
function run(o: PackOpening, fx: ShopFx, from: number, sec: number): number {
  let t = from;
  for (let i = 0; i < sec * 60; i++) { t += 1 / 60; o.update(t, 1 / 60, fx, info); }
  return t;
}

describe('팩 열기 단계', () => {
  it('떨어짐 → Enter → 뒷면 → 모두 뒤집기 → 끝 (3장이 모여도 합치기 없음)', () => {
    const fx = new ShopFx(), o = new PackOpening(1, 'gift', 'global.ui.card.pack1', 0, { a: { count: 2, enhanced: false } });
    o.setResult([{ id: 'a', tier: 1, isNew: false }, { id: 'b', tier: 1, isNew: true }, { id: 'b', tier: 2, isNew: false }, { id: 'c', tier: 3, isNew: true }]);
    let t = run(o, fx, 0, 0.6);
    expect(o.stage).toBe('ready');
    o.onKey('Enter', t);
    t = run(o, fx, t, 1.7);
    expect(o.stage).toBe('backs');
    expect(o.onKey('KeyA', t)).toBe(true);
    run(o, fx, t, 4);
    expect(o.music).toBe(0);
    expect(o.stage).toBe('done');
  });

  it('서버 결과가 오기 전에 열면 기다렸다가 흔듦', () => {
    const fx = new ShopFx(), o = new PackOpening(1, 'coin', 'global.ui.card.pack1', 0, {});
    let t = run(o, fx, 0, 0.6);
    o.onKey('Enter', t);
    t = run(o, fx, t, 0.5);
    expect(o.stage).toBe('ready');
    o.setResult([1, 2, 3, 4].map((i) => ({ id: `x${i}`, tier: 1, isNew: false })));
    run(o, fx, t, 0.1);
    expect(o.stage).toBe('shake');
  });
});
