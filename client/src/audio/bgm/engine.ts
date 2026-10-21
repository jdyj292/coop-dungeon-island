// BGM 엔진 (docs/audio.md 5장): bgm.json 해석 + 25ms 스케줄러 (0.2초 앞까지 예약). engine.js를 그대로 옮기되 곡마다 인스턴스
import { nf, Rig } from './instruments';
import * as V from './voices';

type Num = number | number[] | { mod: number; eq: number; then: number; else: number } | { seq: number[]; from: number } | { base: number; add: number; start: number };

export interface Part {
  inst: string;
  bars?: [number, number];
  barList?: number[];
  barMod?: [number, number];
  steps?: number[];
  every?: [number, number];
  note?: 'bass' | 'chord' | 'arp' | 'pick';
  arp?: string;
  arpDiv?: number;
  pool?: string;
  mul?: Num;
  len?: number;
  hz?: Num;
  v?: Num;
  pan?: Num;
  chance?: number;
  jitter?: boolean;
  args?: Record<string, number>;
}

export interface Track {
  name: string;
  bpm: number;
  swing: number;
  stepsPerBar: number;
  delaySteps: number;
  chords: [string, string][];
  melody: string[];
  lead: { inst: string; v: number; bars?: [number, number]; args?: Record<string, number> }[];
  parts: Part[];
}

export interface BgmData {
  pools: Record<string, string[]>;
  arps: Record<string, number[]>;
  tracks: Record<string, Track>;
}

interface Ev {
  s: number;
  sd: number;
  args: Record<string, number>;
  v?: number;
  pan?: number;
  hz?: number;
  d: number;
  f?: number;
  names?: string[];
  notes?: number[];
}

/** 악기 이름 → 호출 (engine.js CALL과 같음) */
const CALL: Record<string, (r: Rig, t: number, e: Ev) => void> = {
  rhodes: (r, t, e) => e.notes!.forEach((f, i) => V.rhodes(r, t + i * (e.args.strum || 0), f, e.d, e.v!)),
  sub: (r, t, e) => V.sub(r, t, e.f!, e.d, e.v!, e.args.duck ? 1 : 0),
  kick: (r, t, e) => V.kick(r, t, e.v!, e.args.soft ? 1 : 0),
  pump: (r, t, e) => r.pump(t, e.sd, e.args.depth),
  snare: (r, t, e) => V.snare(r, t, e.v!),
  bigSnare: (r, t, e) => V.bigSnare(r, t, e.v!),
  hat: (r, t, e) => V.hat(r, t, e.v!, e.args.cut, e.pan),
  shaker: (r, t, e) => V.shaker(r, t, e.v!),
  rim: (r, t, e) => V.rim(r, t, e.v!),
  tom: (r, t, e) => V.tom(r, t, e.hz!, e.v!),
  impact: (r, t, e) => V.impact(r, t, e.v!),
  riser: (r, t, e) => V.riser(r, t, e.d, e.v!, e.args.top),
  wind: (r, t, e) => V.wind(r, t, e.d, e.v!),
  crackle: (r, t) => V.crackle(r, t),
  glock: (r, t, e) => V.glock(r, t, e.f!, e.v!),
  marimba: (r, t, e) => V.marimba(r, t, e.f!, e.v!, e.pan),
  pad: (r, t, e) => V.pad(r, t, e.names!, e.d, e.v!, e.args.c1, e.args.c2),
  pulse: (r, t, e) => V.pulse(r, t, e.f!, e.v!, e.args.cut! + (e.args.cutStep || 0) * e.s, e.pan),
  softLead: (r, t, e) => V.softLead(r, t, e.f!, e.d, e.v!),
  flute: (r, t, e) => V.flute(r, t, e.f!, e.d, e.v!, e.args.noGlide ? 1 : 0),
  mono: (r, t, e) => V.mono(r, t, e.f!, e.d, e.v!),
};

function val(x: Num | undefined, s: number): number | undefined {
  if (x == null || typeof x === 'number') return x;
  if (Array.isArray(x)) return x[s];
  if ('mod' in x) return s % x.mod === x.eq ? x.then : x.else;
  if ('seq' in x) return x.seq[s - x.from];
  return x.base + (s - x.start) * x.add;
}

function inBars(p: Part, b: number): boolean {
  if (p.bars && (b < p.bars[0] || b > p.bars[1])) return false;
  if (p.barList && !p.barList.includes(b)) return false;
  if (p.barMod && b % p.barMod[0] !== p.barMod[1]) return false;
  return true;
}

const onStep = (p: Part, s: number) => (p.steps ? p.steps.includes(s) : p.every ? s % p.every[0] === p.every[1] : false);

export interface Compiled {
  tr: Track;
  ch: { b: string; n: string[] }[];
  mel: { f: number; s: number; l: number }[][];
  arps: Record<string, number[]>;
  pools: Record<string, number[]>;
}

export function compile(data: BgmData, id: string): Compiled {
  const tr = data.tracks[id];
  if (!tr) throw new Error(`BGM '${id}' 없음`);
  return {
    tr,
    ch: tr.chords.map(([b, n]) => ({ b, n: n.split(' ') })),
    mel: tr.melody.map((bar) => (bar ? bar.split(' ').map((x) => { const [n, s, l] = x.split(':'); return { f: nf(n!), s: +s!, l: +l! }; }) : [])),
    arps: data.arps,
    pools: Object.fromEntries(Object.entries(data.pools).map(([k, a]) => [k, a.map(nf)])),
  };
}

/** 마디 b·칸 s의 소리를 시각 t에 예약 */
export function runStep(C: Compiled, b: number, s: number, t: number, sd: number, call: (inst: string, t: number, e: Ev) => void): void {
  const ch = C.ch[b]!;
  for (const p of C.tr.parts) {
    if (!inBars(p, b) || !onStep(p, s)) continue;
    if (p.chance != null && Math.random() >= p.chance) continue;
    const mul = val(p.mul, s) ?? 1;
    const e: Ev = { s, sd, args: p.args || {}, v: val(p.v, s), pan: val(p.pan, s), hz: val(p.hz, s), d: (p.len || 0) * sd };
    if (p.note === 'bass') e.f = nf(ch.b) * mul;
    else if (p.note === 'chord') {
      e.names = ch.n;
      e.notes = ch.n.map((n) => nf(n) * mul);
    } else if (p.note === 'arp') {
      const a = C.arps[p.arp!]!, i = a[(p.arpDiv ? Math.floor(s / p.arpDiv) : s) % a.length]!;
      e.f = nf(ch.n[i % ch.n.length]!) * mul;
    } else if (p.note === 'pick') {
      const pl = C.pools[p.pool!]!;
      e.f = pl[Math.floor(Math.random() * pl.length)]! * mul;
    }
    call(p.inst, p.jitter ? t + Math.random() * sd : t, e);
  }
  for (const n of C.mel[b]!) {
    if (n.s !== s) continue;
    for (const L of C.tr.lead) {
      if (L.bars && (b < L.bars[0] || b > L.bars[1])) continue;
      call(L.inst, t, { s, sd, f: n.f, d: n.l * sd, v: L.v, args: L.args || {} });
    }
  }
}

/** 예약 간격·앞서 예약할 시간 (engine.js와 같음) */
const TICK_MS = 25;
const AHEAD = 0.2;

/** 곡 하나 재생 (자기 버스). out = 크로스페이드·볼륨용 게인 */
export class BgmTrack {
  readonly rig: Rig;
  private C: Compiled;
  private step = 0;
  private nextT: number;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(ctx: BaseAudioContext, out: AudioNode, data: BgmData, readonly id: string,
    private schedule: (fn: () => void, ms: number) => ReturnType<typeof setInterval> = (fn, ms) => setInterval(fn, ms)) {
    this.rig = new Rig(ctx, out);
    this.C = compile(data, id);
    this.rig.delay.delayTime.value = (60 / this.C.tr.bpm / 4) * this.C.tr.delaySteps;
    this.nextT = ctx.currentTime + 0.1;
  }

  start(): void {
    this.timer = this.schedule(() => this.tick(), TICK_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** 지금부터 AHEAD초 안의 칸을 예약 (첫 마디부터 반복) */
  tick(): void {
    const tr = this.C.tr, sd = 60 / tr.bpm / 4, spb = tr.stepsPerBar, tot = spb * this.C.ch.length;
    while (this.nextT < this.rig.ctx.currentTime + AHEAD) {
      const b = Math.floor(this.step / spb), s = this.step % spb, t = this.nextT + (s % 2 === 1 ? sd * tr.swing : 0);
      runStep(this.C, b, s, t, sd, (name, tt, e) => CALL[name]!(this.rig, tt, e));
      this.nextT += sd;
      this.step = (this.step + 1) % tot;
    }
  }
}
