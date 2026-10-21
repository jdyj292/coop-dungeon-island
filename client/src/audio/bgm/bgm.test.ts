import { afterEach, describe, expect, it, vi } from 'vitest';
import engineSrc from '../../../../tools/bgm-preview/engine.js?raw';
import bgmData from '../../../data/bgm.json';
import { SfxPlayer } from '../player';
import { FakeAudioContext } from '../recorder';
import { BgmTrack, type BgmData } from './engine';
import { MusicPlayer } from './music';

const data = bgmData as unknown as BgmData;
const realRandom = Math.random;

/** 같은 난수열 (원본과 이식본을 같은 조건으로) */
function seed(n: number): void {
  let s = n >>> 0;
  Math.random = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
afterEach(() => { Math.random = realRandom; });

/** sec초 동안 0.2초씩 시계를 옮기며 예약 함수를 부른다 */
function drive(ctx: FakeAudioContext, tick: () => void, sec: number): void {
  for (let t = 0; t < sec; t += 0.2) {
    ctx.currentTime = t;
    tick();
  }
}

/** 승인 엔진 engine.js (reference.html과 호출이 같다고 검증된 것)를 가짜 AudioContext로 */
function original(id: string, sec: number): unknown[] {
  seed(7);
  const ctx = new FakeAudioContext();
  let tick: () => void = () => {};
  const module = { exports: {} as { play: (d: unknown, id: string) => void; stop: () => void } };
  const win = { AudioContext: function () { return ctx; } };
  new Function('module', 'window', 'setInterval', 'clearInterval', 'setTimeout', engineSrc)(
    module, win, (fn: () => void) => { tick = fn; return 1; }, () => {}, () => 0,
  );
  module.exports.play(data, id);
  drive(ctx, tick, sec);
  return ctx.rec.log;
}

function ported(id: string, sec: number): unknown[] {
  seed(7);
  const ctx = new FakeAudioContext();
  let tick: () => void = () => {};
  const tr = new BgmTrack(ctx as unknown as BaseAudioContext, ctx.destination as unknown as AudioNode, data, id, (fn) => { tick = fn; return 0 as never; });
  tr.start();
  drive(ctx, tick, sec);
  return ctx.rec.log;
}

describe('BGM 엔진 이식 (audio.md 5장): engine.js와 노드·값·연결 기록이 같음', () => {
  // 섬·1층은 처음 2마디, 보스는 연주가 바뀌는 4·8마디를 지나도록 9마디
  const cases: [string, number][] = [['island', 2], ['floor1', 2], ['boss1', 9]];
  for (const [id, bars] of cases) {
    it(`${id} ${bars}마디`, () => {
      const tr = data.tracks[id]!, sec = (60 / tr.bpm / 4) * tr.stepsPerBar * bars;
      const a = original(id, sec), b = ported(id, sec);
      expect(a.length).toBeGreaterThan(1000);
      expect(b.length).toBe(a.length);
      const first = a.findIndex((x, i) => JSON.stringify(x) !== JSON.stringify(b[i]));
      expect(first, first >= 0 ? `${first}: 원본 ${JSON.stringify(a[first])} / 이식 ${JSON.stringify(b[first])}` : '').toBe(-1);
    });
  }
});

describe('BGM 재생 규칙 (audio.md 5장)', () => {
  it('시작 전 요청은 기다렸다가, 같은 곡은 이어서, 다른 곡은 새로, stop이면 없음', () => {
    vi.useFakeTimers();
    const p = new SfxPlayer(() => new FakeAudioContext() as unknown as BaseAudioContext);
    const m = new MusicPlayer(p, data);
    m.play('floor1');
    expect(m.playing).toBeNull();
    p.start();
    expect(m.playing).toBe('floor1');
    m.play('floor1');
    expect(m.playing).toBe('floor1');
    m.play('boss1');
    expect(m.playing).toBe('boss1');
    m.stop();
    expect(m.playing).toBeNull();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });
});
