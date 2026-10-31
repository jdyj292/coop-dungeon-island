import { describe, expect, it } from 'vitest';
import { newPlayerState, weaponDef, type SimPlayer } from '@game/shared';
import { PlayerState } from '../schema/DungeonState';
import { syncPlayer } from './sync';

describe('syncPlayer', () => {
  it('행동 시작 시각은 히트스톱으로 멈춘 만큼 바로 밀린다 (본인 예측 재계산 기준, network.md 5장)', () => {
    const gs = weaponDef('greatsword');
    const p = newPlayerState({ x: 100, y: 50 });
    p.fighter.run = { def: gs.dash, kind: 'dash', step: 0, t: 0.15 } as never;
    const sp = { state: p, away: false } as unknown as SimPlayer;
    const s = new PlayerState();
    syncPlayer(s, sp, 0, 1000);
    expect(s.actionStart).toBeCloseTo(850);
    // 멈춘 동안 t는 그대로, 시각만 5ms 흐름
    syncPlayer(s, sp, 0, 1005);
    expect(s.actionStart).toBeCloseTo(855);
  });

  it('가속(가속장)은 끝나는 시각·배율을 본인에게 보낸다', () => {
    const p = newPlayerState({ x: 100, y: 50 });
    p.haste = { left: 2, mul: 1.2 };
    const sp = { state: p, away: false } as unknown as SimPlayer;
    const s = new PlayerState();
    syncPlayer(s, sp, 0, 1000);
    expect([s.priv.hasteEnd, s.priv.hasteMul]).toEqual([3000, expect.closeTo(1.2)]);
    delete p.haste;
    syncPlayer(s, sp, 0, 1100);
    expect(s.priv.hasteEnd).toBe(0);
  });
});
