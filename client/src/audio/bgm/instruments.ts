// BGM 악기 (docs/audio.md 5장): tools/bgm-preview/engine.js의 악기 코드를 그대로 옮김 (승인 원본 reference.html과 같은 호출)
// 원본은 전역 하나로 한 곡만 돌렸지만, 크로스페이드를 위해 곡마다 버스(Rig)를 따로 만든다. 노드·값·연결 순서는 원본과 같다

type Ctx = BaseAudioContext;

/** 음 이름 → Hz ("A4" = 440) */
const NI: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export function nf(n: string): number {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(n)!;
  const st = NI[m[1]!]! + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return 440 * Math.pow(2, ((+m[3]! + 1) * 12 + st - 69) / 12);
}

interface RouteOpts {
  pan?: number;
  duck?: number;
  rev?: number;
  del?: number;
}

/** 곡 하나의 버스: dry / duck(사이드체인) / 잔향 3.2초 / 딜레이 + 공용 잡음 버퍼 */
export class Rig {
  readonly master: GainNode;
  readonly delay: DelayNode;
  private dry: GainNode;
  private duck: GainNode;
  private rev: ConvolverNode;
  private delIn: GainNode;
  private noiseBuf: AudioBuffer;
  /** 리드(flute·mono)의 직전 음 (미끄러짐) */
  prevF: number | null = null;

  /** out = 이 곡이 나가는 곳 (원본은 ctx.destination) */
  constructor(readonly ctx: Ctx, out: AudioNode) {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master = ctx.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(comp).connect(out);
    this.dry = ctx.createGain();
    this.dry.connect(this.master);
    this.duck = ctx.createGain();
    this.duck.connect(this.master);
    this.rev = ctx.createConvolver();
    const len = ctx.sampleRate * 3.2, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
    }
    this.rev.buffer = ir;
    const rg = ctx.createGain();
    rg.gain.value = 0.55;
    this.rev.connect(rg).connect(this.master);
    this.delIn = ctx.createGain();
    this.delay = ctx.createDelay(2);
    const fb = ctx.createGain();
    fb.gain.value = 0.36;
    const dl = ctx.createBiquadFilter();
    dl.type = 'lowpass';
    dl.frequency.value = 2600;
    this.delIn.connect(this.delay);
    this.delay.connect(dl).connect(fb).connect(this.delay);
    const dg = ctx.createGain();
    dg.gain.value = 0.5;
    dl.connect(dg).connect(this.master);
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const nd = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  }

  route(n: AudioNode, o: RouteOpts = {}): void {
    let src = n;
    if (o.pan && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = o.pan;
      n.connect(p);
      src = p;
    }
    src.connect(o.duck ? this.duck : this.dry);
    if (o.rev) {
      const s = this.ctx.createGain();
      s.gain.value = o.rev;
      src.connect(s).connect(this.rev);
    }
    if (o.del) {
      const s = this.ctx.createGain();
      s.gain.value = o.del;
      src.connect(s).connect(this.delIn);
    }
  }

  osc(type: OscillatorType, f: number, t: number, d: number, det?: number): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (det) o.detune.value = det;
    o.start(t);
    o.stop(t + d + 0.5);
    return o;
  }

  gn(t: number, a: number, v: number, d: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    return g;
  }

  sus(t: number, a: number, v: number, d: number, r: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + a);
    g.gain.setValueAtTime(v, t + Math.max(a, d - r));
    g.gain.linearRampToValueAtTime(0, t + d);
    return g;
  }

  noise(t: number, d: number): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.start(t);
    s.stop(t + d + 0.05);
    return s;
  }

  filt(type: BiquadFilterType, f: number, q?: number): BiquadFilterNode {
    const b = this.ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    if (q) b.Q.value = q;
    return b;
  }

  vib(o: OscillatorNode, t: number, d: number, rate: number, depth: number, dl?: number): void {
    const lf = this.osc('sine', rate, t, d), lg = this.ctx.createGain();
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(depth, t + (dl || 0.4));
    lf.connect(lg).connect(o.frequency);
  }

  /** 사이드체인: duck 버스를 depth까지 눌렀다가 복귀 */
  pump(t: number, sd: number, depth?: number): void {
    this.duck.gain.cancelScheduledValues(t);
    this.duck.gain.setValueAtTime(depth || 0.3, t);
    this.duck.gain.linearRampToValueAtTime(1, t + sd * 3);
  }
}
