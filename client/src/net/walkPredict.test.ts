import { islandBounds, newWalker, spawnPos, stepWalker, TICK } from '@game/shared';
import { describe, expect, it } from 'vitest';
import { WalkPredictor } from './walkPredict';

describe('섬 걷기 예측', () => {
  const b = islandBounds();
  const right = { mx: 1, my: 0, run: false };

  it('서버가 같은 입력을 같은 틱만큼 적용하면 보정 없음', () => {
    const p = new WalkPredictor(b, spawnPos(0));
    const server = newWalker(spawnPos(0));
    for (let i = 1; i <= 10; i++) {
      p.tick(right, TICK, i);
      if (i <= 6) stepWalker(server, right, TICK, b);
    }
    expect(p.reconcile(server.pos, 6, TICK)).toBe('none');
    expect(p.display.x).toBeCloseTo(p.state.pos.x);
  });

  it('조금 다르면 부드럽게, 많이 다르면 즉시', () => {
    const p = new WalkPredictor(b, spawnPos(0));
    for (let i = 1; i <= 5; i++) p.tick(right, TICK, i);
    const at = p.state.pos;
    expect(p.reconcile({ x: at.x - 10, y: at.y }, 5, TICK)).toBe('smooth');
    expect(p.display.x).toBeCloseTo(at.x);
    for (let i = 0; i < 20; i++) p.tick({ mx: 0, my: 0, run: false }, TICK, 5);
    expect(p.display.x).toBeCloseTo(at.x - 10, 0);
    expect(p.reconcile({ x: at.x + 100, y: at.y }, 5, TICK)).toBe('snap');
    expect(p.display.x).toBe(at.x + 100);
  });
});
