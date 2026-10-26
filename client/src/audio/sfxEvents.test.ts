import { describe, expect, it } from 'vitest';
import { RoomSim, skillDef, TICK, weaponDef, type PlayerInput } from '@game/shared';
import { busOf } from './player';
import { soundsFor } from './sfxEvents';

const none: PlayerInput = { x: 0, y: 0, attack: false, skill: null, backstep: false };

/** AI 없이 행동을 넣고 들린 소리 목록 */
function heard(script: [Partial<PlayerInput>, number][], spawn = true, weapon = 'greatsword', at = 114): string[] {
  const sim = new RoomSim(weaponDef(weapon), { minX: 0, maxX: 1000, minY: 0, maxY: 100 }, { x: 100, y: 50 }, { ai: false });
  if (spawn) sim.spawn([{ kind: 'mushroom', x: at, y: 50 }]);
  const out: string[] = [];
  for (const [input, ticks] of script) {
    for (let i = 0; i < ticks; i++) {
      for (const e of sim.tick(TICK, { ...none, ...(i === 0 ? input : {}) }).events) out.push(...soundsFor(e, { teleport: weapon === 'staff' }));
    }
  }
  return out;
}

describe('전투 이벤트 → 효과음 (audio.md 3장)', () => {
  it('3연타: swing·hitLight ×2, swingHeavy·hitHeavy', () => {
    // 다음 타는 앞 타의 active~recovery 중에 선입력 (구간 길이는 데이터에서)
    const [b1, b2] = weaponDef('greatsword').basic.map((b) => b.phases);
    const ticks = (sec: number) => Math.ceil(sec / TICK);
    const t2 = ticks(b1!.windup + b1!.active) + 1;
    const t3 = ticks(b1!.windup + b1!.active + b1!.recovery) + ticks(b2!.windup) + 1;
    const s = heard([[{ attack: true }, t2], [{ attack: true }, t3 - t2], [{ attack: true }, 80]]);
    expect(s).toEqual(['swing', 'hitLight', 'swing', 'hitLight', 'swingHeavy', 'hitHeavy']);
  });
  it('올려베기: launch·hitLight → 바운드·다운', () => {
    expect(heard([[{ skill: skillDef('gs_launch') }, 150]])).toEqual(['launch', 'hitLight', 'bounce', 'down']);
  });
  it('대지가르기·백스텝·물약', () => {
    expect(heard([[{ skill: skillDef('gs_earthsplit') }, 60]])).toEqual(['skill_slash', 'hitHeavy']);
    expect(heard([[{ backstep: true }, 5], [{ potion: 'hp' }, 2]], false)).toEqual(['backstep', 'potion']);
  });
  it('스태프: 마법탄 bolt_cast·bolt_hit, 화염 폭발(준비 때), 얼음 장판, 순간이동 (MVP 보충 ST-2b)', () => {
    expect(heard([[{ attack: true }, 40]], true, 'staff', 150)).toEqual(['bolt_cast', 'bolt_hit']);
    expect(heard([[{ skill: skillDef('st_fireburst') }, 150]], true, 'staff', 164)).toEqual(['skill_fireburst', 'bounce', 'down']);
    expect(heard([[{ skill: skillDef('st_icefield') }, 40]], true, 'staff', 148)).toEqual(['skill_icefield', 'hitLight']);
    expect(heard([[{ backstep: true }, 5]], false, 'staff')).toEqual(['teleport']);
  });
  it('연결된 소리는 모두 sfx.json에 있다', () => {
    for (const n of ['swing', 'hitLight', 'swingHeavy', 'hitHeavy', 'launch', 'bounce', 'down', 'skill_slash', 'backstep', 'potion',
      'dash', 'bolt_cast', 'bolt_hit', 'teleport', 'skill_fireburst', 'skill_icefield', 'mon_mushroom_windup', 'mon_boar_charge', 'mon_spore_shot', 'mon_bear_roar', 'bearYawn', 'roomClear']) {
      expect(busOf(n), n).not.toBeNull();
    }
  });
});
