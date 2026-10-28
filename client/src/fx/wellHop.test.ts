import { describe, expect, it } from 'vitest';
import fx from '../../data/fx.json';
import { jumpAt, popAt, wellDepth, wellHole } from './wellHop';

const W = fx.wellHop;

describe('우물 뛰어들기·튀어나오기 (island.md 6장)', () => {
  const from = { x: 300, y: 240 }, hole = wellHole();

  it('구멍은 우물 그림보다 뒤 (앞 테두리가 가라앉는 몸을 가림)', () => {
    expect(hole.y).toBeLessThan(wellDepth());
  });

  it('뛰어들기: 제자리에서 시작 → 공중은 우물 앞 → 구멍 위에서 가라앉고 끝', () => {
    expect(jumpAt(from, 0)).toMatchObject({ x: from.x, y: from.y, z: 0, done: false });
    const mid = jumpAt(from, W.jumpSec * W.sinkAt / 2);
    expect(mid.z).toBe(W.jumpPeak);
    expect(mid.front).toBe(true);
    const sink = jumpAt(from, W.jumpSec * (W.sinkAt + 1) / 2);
    expect([sink.x, sink.y, sink.front]).toEqual([hole.x, hole.y, false]);
    expect(sink.z).toBeLessThan(0);
    expect(jumpAt(from, W.jumpSec)).toMatchObject({ x: hole.x, y: hole.y, z: -W.sinkPx, done: true });
  });

  it('튀어나오기: 구멍 속(우물 뒤)에서 솟아 → 공중은 우물 앞 → 착지 자리에서 끝', () => {
    const to = { x: 330, y: 250 };
    expect(popAt(to, 0)).toMatchObject({ x: hole.x, y: hole.y, z: -W.sinkPx, front: false });
    const mid = popAt(to, W.popSec * (1 - W.sinkAt / 2));
    expect(mid.z).toBe(W.popPeak);
    expect(mid.front).toBe(true);
    expect(popAt(to, W.popSec)).toMatchObject({ x: to.x, y: to.y, z: 0, done: true });
  });
});
