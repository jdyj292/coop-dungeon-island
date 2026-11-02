// 카드팩 열기 단계 (island.md 5장 팩 열기 연출): 떨어짐 → 열기 → 뒷면 → 모두 뒤집기 → 끝 → 확인(갈릴 카드가 있으면 갈린 뒤 closed), 결과가 늦게 오면 열기를 기다림, 곡 단계
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
  it('떨어짐 → Enter → 뒷면 → 모두 뒤집기 → 끝 → 확인하면 갈린 뒤 closed', () => {
    const fx = new ShopFx(), o = new PackOpening(1, 'gift', 'global.ui.card.pack1', 0, { a: { count: 0, enhanced: true }, b: { count: 1, enhanced: false } });
    o.setResult([
      { id: 'a', tier: 1, isNew: false, merged: false, ground: 5 }, { id: 'b', tier: 1, isNew: false, merged: false, ground: 0 },
      { id: 'b', tier: 2, isNew: false, merged: true, ground: 0 }, { id: 'c', tier: 3, isNew: true, merged: false, ground: 0 },
    ]);
    let t = run(o, fx, 0, 0.6);
    expect(o.stage).toBe('ready');
    o.onKey('Enter', t);
    t = run(o, fx, t, 1.7);
    expect(o.stage).toBe('backs');
    expect(o.onKey('KeyA', t)).toBe(true);
    t = run(o, fx, t, 4);
    expect(o.music).toBe(0);
    expect(o.stage).toBe('done');
    o.confirm('again', t);
    expect(o.stage).toBe('grind');
    run(o, fx, t, 1.2);
    expect(o.stage).toBe('closed');
    expect(o.after).toBe('again');
  });

  it('갈릴 카드가 없으면 확인하자마자 closed', () => {
    const fx = new ShopFx(), o = new PackOpening(1, 'gift', 'global.ui.card.pack1', 0, {});
    o.setResult([1, 2, 3, 4].map((i) => ({ id: `x${i}`, tier: 1, isNew: true, merged: false, ground: 0 })));
    let t = run(o, fx, 0, 0.6);
    o.onKey('Enter', t);
    t = run(o, fx, t, 1.7);
    o.onKey('KeyA', t);
    t = run(o, fx, t, 3);
    o.confirm('ok', t);
    expect(o.stage).toBe('closed');
  });

  it('서버 결과가 오기 전에 열면 기다렸다가 흔듦', () => {
    const fx = new ShopFx(), o = new PackOpening(1, 'coin', 'global.ui.card.pack1', 0, {});
    let t = run(o, fx, 0, 0.6);
    o.onKey('Enter', t);
    t = run(o, fx, t, 0.5);
    expect(o.stage).toBe('ready');
    o.setResult([1, 2, 3, 4].map((i) => ({ id: `x${i}`, tier: 1, isNew: false, merged: false, ground: 0 })));
    run(o, fx, t, 0.1);
    expect(o.stage).toBe('shake');
  });
});
