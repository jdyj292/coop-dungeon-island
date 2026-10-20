// 레이어 재생 (docs/audio.md 2장). 계산·노드를 만드는 순서는 승인 원본의 tone/noise/metal/click/boom(action),
// tone/bell/marimba/noise/thump(clear)와 같다. 버스마다 기본값이 다른 곳(tone 시작 0.002/0.005초, noise 시작)도 원본 그대로
import type { Bus } from './buses';

export interface Layer {
  k: 'tone' | 'noise' | 'click' | 'boom' | 'metal' | 'bell' | 'marimba' | 'thump';
  at: number;
  v: number;
  f?: number | [number, number];
  dur?: number;
  wave?: OscillatorType;
  atk?: number;
  lp?: number;
  bend?: number;
  wet?: number;
  dist?: boolean;
  filter?: BiquadFilterType;
  q?: number;
  swell?: boolean;
  ratio?: number;
  idx?: number;
}

interface Out {
  wet?: number;
  dist?: boolean;
}

export class Synth {
  private noiseBuf: AudioBuffer | null = null;
  private pitch = 1;

  constructor(private ctx: BaseAudioContext, readonly bus: Bus) {}

  /** pitch = 음높이 배율 (무작위 ±4%는 player가 정함) */
  play(layers: Layer[], pitch = 1): void {
    this.pitch = pitch;
    for (const l of layers) this.layer(l);
  }

  private f2(l: Layer): [number, number] {
    const [a, b] = typeof l.f === 'number' ? [l.f, l.f] : l.f!;
    return [a * this.pitch, b * this.pitch];
  }

  private f1(l: Layer): number {
    return (typeof l.f === 'number' ? l.f : l.f![0]) * this.pitch;
  }

  private layer(l: Layer): void {
    const action = this.bus.name === 'action';
    switch (l.k) {
      case 'tone': {
        const [f0, f1] = this.f2(l);
        return this.tone(l.wave ?? 'sine', f0, f1, l.dur!, l.v, l.at, { atk: l.atk, lp: l.lp, bend: l.bend, wet: l.wet, dist: l.dist });
      }
      case 'noise': {
        const [f0, f1] = this.f2(l);
        return action
          ? this.noiseAction(l.dur!, l.v, f0, f1, l.filter, l.at, l.q, { swell: l.swell, wet: l.wet, dist: l.dist })
          : this.noiseClear(l.dur!, l.v, f0, f1, l.filter, l.at, l.q, l.wet);
      }
      case 'click': return this.noiseAction(0.012, l.v, 6000, 3000, 'highpass', l.at, 0.7);
      case 'boom': {
        const f = this.f1(l);
        this.tone('sine', f, f * 0.3, l.dur!, l.v, l.at, { bend: 0.45, dist: true });
        return this.tone('sine', f * 0.5, f * 0.25, l.dur! * 1.3, l.v * 0.8, l.at, { bend: 0.6, lp: 200 });
      }
      case 'metal': {
        const f = this.f1(l);
        [1, 2.76, 5.4, 8.93].forEach((r, i) =>
          this.tone('sine', f * r, f * r * 0.995, l.dur! / (1 + i * 0.6), l.v / (1 + i * 0.8), l.at, { wet: l.wet ?? 0.35 }));
        return;
      }
      case 'bell': return this.bell(this.f1(l), l.dur!, l.v, l.at, l.ratio, l.idx, l.wet);
      case 'marimba': {
        const f = this.f1(l), wet = l.wet ?? 0.35;
        this.tone('sine', f, f, l.dur!, l.v, l.at, { wet });
        this.tone('sine', f * 4, f * 4, l.dur! * 0.25, l.v * 0.35, l.at, { wet });
        return this.tone('triangle', f * 2, f * 2, l.dur! * 0.4, l.v * 0.15, l.at, {});
      }
      case 'thump': {
        const [f0, f1] = this.f2(l);
        this.tone('sine', f0, f1, l.dur!, l.v, l.at, { bend: 0.5 });
        return this.tone('triangle', f0 * 2, f1 * 2, l.dur! * 0.5, l.v * 0.3, l.at, { bend: 0.5 });
      }
    }
  }

  private out(n: AudioNode, o: Out): void {
    if (o.dist && this.bus.dist) n.connect(this.bus.dist);
    else n.connect(this.bus.input);
    if (o.wet) {
      const g = this.ctx.createGain();
      g.gain.value = o.wet;
      n.connect(g);
      g.connect(this.bus.reverb);
    }
  }

  /** 0.0001 → v (a초) → 0.0001 (d초) */
  private env(p: AudioParam, t: number, a: number, d: number, v: number): void {
    p.setValueAtTime(0.0001, t);
    p.exponentialRampToValueAtTime(v, t + a);
    p.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, v: number, at: number,
    o: Out & { atk?: number; lp?: number; bend?: number }): void {
    const c = this.ctx, t = c.currentTime + at, osc = c.createOscillator(), g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur * (o.bend || 1));
    this.env(g.gain, t, o.atk || (this.bus.name === 'action' ? 0.002 : 0.005), dur, v);
    let n: AudioNode = osc;
    if (o.lp) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.lp;
      osc.connect(f);
      n = f;
    }
    n.connect(g);
    this.out(g, this.bus.name === 'action' ? o : { wet: o.wet });
    osc.start(t);
    osc.stop(t + dur + 0.1);
  }

  private noise(): AudioBuffer {
    if (!this.noiseBuf) {
      const c = this.ctx;
      this.noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return this.noiseBuf;
  }

  private noiseAction(dur: number, v: number, f0: number, f1: number, type: BiquadFilterType | undefined, at: number,
    q?: number, o: Out & { swell?: boolean } = {}): void {
    const c = this.ctx, t = c.currentTime + at, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise();
    s.loop = true;
    s.playbackRate.value = 1;
    f.type = type || 'bandpass';
    f.Q.value = q || 1;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    if (o.swell) {
      // 휘두르기: 커졌다 끊김
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + dur * 0.55);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    } else this.env(g.gain, t, 0.001, dur, v);
    s.connect(f);
    f.connect(g);
    this.out(g, o);
    s.start(t);
    s.stop(t + dur + 0.1);
  }

  private noiseClear(dur: number, v: number, f0: number, f1: number, type: BiquadFilterType | undefined, at: number,
    q?: number, wet?: number): void {
    const c = this.ctx, t = c.currentTime + at, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise();
    s.loop = true;
    f.type = type || 'bandpass';
    f.Q.value = q || 1;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    this.env(g.gain, t, dur > 0.15 ? 0.03 : 0.004, dur, v);
    s.connect(f);
    f.connect(g);
    this.out(g, { wet });
    s.start(t);
    s.stop(t + dur + 0.1);
  }

  /** FM 벨 (clear) */
  private bell(f: number, dur: number, v: number, at: number, ratio?: number, idx?: number, wet?: number): void {
    const ctx = this.ctx, t = ctx.currentTime + at;
    const c = ctx.createOscillator(), m = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
    c.type = 'sine';
    m.type = 'sine';
    c.frequency.value = f;
    m.frequency.value = f * (ratio || 3.5);
    mg.gain.setValueAtTime(f * (idx || 2.2), t);
    mg.gain.exponentialRampToValueAtTime(f * 0.05, t + dur * 0.6);
    m.connect(mg);
    mg.connect(c.frequency);
    this.env(g.gain, t, 0.003, dur, v);
    c.connect(g);
    this.out(g, { wet: wet ?? 0.5 });
    c.start(t);
    m.start(t);
    c.stop(t + dur + 0.1);
    m.stop(t + dur + 0.1);
  }
}

/** 소리 길이 (마지막 레이어 끝 + 0.1초) */
export function soundLength(layers: Layer[]): number {
  return Math.max(...layers.map((l) => l.at + (l.dur ?? 0.012) * (l.k === 'boom' ? 1.3 : 1))) + 0.1;
}
