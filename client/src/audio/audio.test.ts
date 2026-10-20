import { describe, expect, it } from 'vitest';
import refAction from '../../../tools/sfx-preview/reference-action.html?raw';
import refClear from '../../../tools/sfx-preview/reference-clear.html?raw';
import { compareBus } from './compareRef';
import { busOf, SfxPlayer, soundNames } from './player';
import { FakeAudioContext } from './recorder';

describe('승인 원본과 같은 소리 그래프', () => {
  for (const [bus, html] of [['action', refAction], ['clear', refClear]] as const) {
    for (const r of compareBus(bus, html)) {
      it(`${bus}.${r.name} = 원본 ${r.reference}`, () => {
        expect(r.diff).toBe('');
      });
    }
  }
});

describe('재생 규칙 (audio.md 4장)', () => {
  const make = (rand = () => 0.5) => {
    const ctx = new FakeAudioContext();
    const p = new SfxPlayer(() => ctx as unknown as BaseAudioContext, rand);
    p.start();
    return { ctx, p };
  };
  it('시작 전에는 소리를 내지 않음', () => {
    const p = new SfxPlayer(() => new FakeAudioContext() as unknown as BaseAudioContext);
    expect(p.play('swing')).toBe(false);
  });
  it('같은 소리는 50ms 안이면 하나로, 동시에 최대 4개', () => {
    const { ctx, p } = make();
    expect(p.play('hitHeavy')).toBe(true);
    ctx.currentTime = 0.02;
    expect(p.play('hitHeavy')).toBe(false);
    for (let i = 1; i <= 3; i++) {
      ctx.currentTime = i * 0.06;
      expect(p.play('hitHeavy')).toBe(true);
    }
    ctx.currentTime = 0.3;
    expect(p.play('hitHeavy')).toBe(false);
    ctx.currentTime = 2;
    expect(p.play('hitHeavy')).toBe(true);
  });
  it('음높이 ±4% (레벨업·방 클리어는 그대로)', () => {
    /** 무작위 최대(+4%)로 재생했을 때 주파수 기록 / 무작위 끄고 재생했을 때 */
    const freqs = (name: string, jitter: boolean) => {
      const { ctx, p } = make(() => 1);
      p.jitter = jitter;
      ctx.rec.mark();
      p.play(name);
      return ctx.rec.log.filter((e) => e[1] === 'frequency.set' || e[1] === 'frequency=').map((e) => e[2] as number);
    };
    // launch의 tone 레이어 160Hz → 166.4Hz (click의 고정 주파수는 그대로)
    expect(freqs('launch', false)).toContain(160);
    expect(freqs('launch', true)).toContain(166.4);
    expect(freqs('levelup', true)).toEqual(freqs('levelup', false));
    expect(freqs('roomClear', true)).toEqual(freqs('roomClear', false));
  });
  it('이름은 두 버스에서 겹치지 않음', () => {
    const names = soundNames();
    expect(new Set(names).size).toBe(names.length);
    expect(busOf('coin')).toBe('clear');
    expect(busOf('swing')).toBe('action');
  });
});
