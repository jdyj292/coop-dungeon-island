import { describe, expect, it } from 'vitest';
import { fighterPhase, PLAYER, RoomSim, SOLO_PID, TICK, weaponDef, type C2SMessage } from '@game/shared';
import { InputQueue } from './inputs';

const gs = weaponDef('greatsword');
const dodgeMsg = (seq: number) => ({ seq, t: 0, kind: 'backstep', x: 0, y: 0, facing: 1 }) as C2SMessage<'action'>;

/** 평타가 버섯에 맞아 서버 캐릭터가 역경직으로 멈춘 직후 (아직 판정 구간) */
function hitStopped() {
  const sim = new RoomSim(gs, { minX: 0, maxX: 1000, minY: 0, maxY: 100 }, { x: 100, y: 50 }, { ai: false, hitstop: 'entity' });
  const [m] = sim.spawn([{ kind: 'mushroom', x: 114, y: 50 }]);
  m!.hp = m!.maxHp = 9999;
  const q = new InputQueue();
  q.onInput({ seq: 1, t: 0, mx: 0, my: 1, run: false });
  q.onAction({ seq: 2, t: 0, kind: 'basic', x: 100, y: 50, facing: 1 }, sim.player, gs);
  const step = () => {
    const { input, seq } = q.take();
    sim.step(TICK, new Map([[SOLO_PID, input]]));
    return { seq, dropped: q.settleDodge(sim.player, TICK) };
  };
  for (let i = 0; i < 30 && !sim.players.get(SOLO_PID)!.stop; i++) step();
  return { sim, q, step };
}

describe('회피 보관 (network.md 4장)', () => {
  it('히트스톱으로 서버가 아직 후딜레이 전이면 거절하지 않고, 후딜레이에 들어가는 틱에 그 방향으로 회피', () => {
    const { sim, q, step } = hitStopped();
    expect(fighterPhase(sim.player.fighter)).toBe('active');
    expect(q.onAction(dodgeMsg(3), sim.player, gs)).toBeNull();
    // 회피가 시작될 때까지 처리 seq는 회피 앞까지만 (클라이언트가 예측한 회피를 지우지 않게)
    let last = step();
    for (let i = 0; i < 30 && !sim.player.backstep; i++) {
      expect(last).toEqual({ seq: 2, dropped: null });
      last = step();
    }
    expect(sim.player.backstep?.dy).toBe(1);
    expect(step()).toEqual({ seq: 3, dropped: null });
  });
  it('보관 중 맞으면 거절, 두 번째 회피·지구력 부족도 거절', () => {
    const { sim, q, step } = hitStopped();
    expect(q.onAction(dodgeMsg(3), sim.player, gs)).toBeNull();
    expect(q.onAction(dodgeMsg(4), sim.player, gs)).toBe('state');
    sim.player.hurt = { kind: 'stun', left: 0.3 } as never;
    expect(step().dropped).toBe(3);
    expect(step().seq).toBe(4);
    sim.player.hurt = null;
    sim.player.stamina = PLAYER.stamina.dodge - 1;
    expect(q.onAction(dodgeMsg(5), sim.player, gs)).toBe('stamina');
  });
});

describe('대검 충전 키 누름 (charge.ts)', () => {
  const act = (seq: number, kind: 'skill' | 'chargeRelease') =>
    ({ seq, t: 0, kind, ...(kind === 'skill' ? { skillId: 'gs_launch' } : {}), x: 0, y: 0, facing: 1 }) as C2SMessage<'action'>;
  it('스킬을 받으면 chargeRelease까지 누르고 있음, 맞은 상태에서도 뗌은 받는다', () => {
    const sim = new RoomSim(gs, { minX: 0, maxX: 1000, minY: 0, maxY: 100 }, { x: 100, y: 50 }, { ai: false });
    const q = new InputQueue(), p = sim.player;
    expect(q.take().input.hold).toBe(false);
    expect(q.onAction(act(1, 'skill'), p, gs)).toBeNull();
    expect(q.take().input.hold).toBe(true);
    expect(q.take().input.hold).toBe(true);
    p.hurt = { kind: 'stun', left: 0.2 };
    expect(q.onAction(act(2, 'chargeRelease'), p, gs)).toBeNull();
    expect(q.take()).toMatchObject({ input: { hold: false }, seq: 2 });
  });
});
