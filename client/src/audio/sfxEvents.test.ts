import { describe, expect, it } from 'vitest';
import { RoomSim, skillDef, TICK, weaponDef, type PlayerInput } from '@game/shared';
import { busOf } from './player';
import { soundsFor } from './sfxEvents';

const none: PlayerInput = { x: 0, y: 0, attack: false, skill: null, backstep: false };

/** AI 없이 행동을 넣고 들린 소리 목록 */
function heard(script: [Partial<PlayerInput>, number][], spawn = true): string[] {
  const sim = new RoomSim(weaponDef('greatsword'), { minX: 0, maxX: 1000, minY: 0, maxY: 100 }, { x: 100, y: 50 }, { ai: false });
  if (spawn) sim.spawn([{ kind: 'mushroom', x: 114, y: 50 }]);
  const out: string[] = [];
  for (const [input, ticks] of script) {
    for (let i = 0; i < ticks; i++) {
      for (const e of sim.tick(TICK, { ...none, ...(i === 0 ? input : {}) }).events) out.push(...soundsFor(e));
    }
  }
  return out;
}

describe('전투 이벤트 → 효과음 (audio.md 3장)', () => {
  it('3연타: swing·hitLight ×2, swingHeavy·hitHeavy', () => {
    const s = heard([[{ attack: true }, 18], [{ attack: true }, 23], [{ attack: true }, 60]]);
    expect(s).toEqual(['swing', 'hitLight', 'swing', 'hitLight', 'swingHeavy', 'hitHeavy']);
  });
  it('올려베기: launch·hitLight → 바운드·다운', () => {
    expect(heard([[{ skill: skillDef('gs_launch') }, 150]])).toEqual(['launch', 'hitLight', 'bounce', 'down']);
  });
  it('대지가르기·백스텝·물약', () => {
    expect(heard([[{ skill: skillDef('gs_earthsplit') }, 60]])).toEqual(['skill_slash', 'hitHeavy']);
    expect(heard([[{ backstep: true }, 5], [{ potion: 'hp' }, 2]], false)).toEqual(['backstep', 'potion']);
  });
  it('연결된 소리는 모두 sfx.json에 있다', () => {
    for (const n of ['swing', 'hitLight', 'swingHeavy', 'hitHeavy', 'launch', 'bounce', 'down', 'skill_slash', 'backstep', 'potion',
      'dash', 'mon_mushroom_windup', 'mon_boar_charge', 'mon_spore_shot', 'mon_bear_roar', 'bearYawn', 'roomClear']) {
      expect(busOf(n), n).not.toBeNull();
    }
  });
});
