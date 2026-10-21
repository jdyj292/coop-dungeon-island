// BGM 악기 소리 (engine.js의 rhodes … mono를 그대로 옮김). r = 곡의 버스 (instruments.ts Rig)
import { nf, type Rig } from './instruments';

export function rhodes(r: Rig, t: number, f: number, d: number, v: number): void {
  const c = r.osc('sine', f, t, d), m = r.osc('sine', f, t, d), mg = r.ctx.createGain();
  mg.gain.setValueAtTime(f * 1.1, t);
  mg.gain.exponentialRampToValueAtTime(f * 0.04, t + 0.5);
  m.connect(mg).connect(c.frequency);
  const g = r.gn(t, 0.006, v, d);
  const tr = r.osc('sine', 4.5, t, d), tg = r.ctx.createGain();
  tg.gain.value = v * 0.25;
  tr.connect(tg).connect(g.gain);
  c.connect(g);
  r.route(g, { rev: 0.4 });
}

export function sub(r: Rig, t: number, f: number, d: number, v: number, dk: number): void {
  const o = r.osc('sine', f, t, d), g = r.sus(t, 0.02, v, d, 0.2);
  o.connect(g);
  r.route(g, { duck: dk });
}

export function kick(r: Rig, t: number, v: number, soft: number): void {
  const o = r.ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(soft ? 110 : 140, t);
  o.frequency.exponentialRampToValueAtTime(soft ? 42 : 40, t + 0.14);
  o.start(t);
  o.stop(t + 0.6);
  const g = r.gn(t, 0.002, v, soft ? 0.4 : 0.45);
  o.connect(g);
  r.route(g);
}

export function snare(r: Rig, t: number, v: number): void {
  const n = r.noise(t, 0.2), b = r.filt('bandpass', 1300, 0.7), g = r.gn(t, 0.002, v, 0.12);
  n.connect(b).connect(g);
  r.route(g, { rev: 0.35 });
  const o = r.osc('triangle', 170, t, 0.1), g2 = r.gn(t, 0.002, v * 0.8, 0.07);
  o.connect(g2);
  r.route(g2);
}

export function bigSnare(r: Rig, t: number, v: number): void {
  const n = r.noise(t, 0.5), b = r.filt('bandpass', 1100, 0.6), g = r.gn(t, 0.003, v, 0.32);
  n.connect(b).connect(g);
  r.route(g, { rev: 0.8 });
  const o = r.osc('triangle', 150, t, 0.2), g2 = r.gn(t, 0.002, v * 0.9, 0.12);
  o.connect(g2);
  r.route(g2, { rev: 0.4 });
}

export function hat(r: Rig, t: number, v: number, cut: number | undefined, pan: number | undefined): void {
  const n = r.noise(t, 0.2), b = r.filt(cut ? 'bandpass' : 'highpass', cut || 7500, cut ? 1.5 : 0), g = r.gn(t, 0.001, v, 0.035);
  n.connect(b).connect(g);
  r.route(g, { pan });
}

export function shaker(r: Rig, t: number, v: number): void {
  const n = r.noise(t, 0.08), b = r.filt('bandpass', 6500, 1.2), g = r.gn(t, 0.008, v, 0.05);
  n.connect(b).connect(g);
  r.route(g, { rev: 0.2 });
}

export function rim(r: Rig, t: number, v: number): void {
  const o = r.osc('triangle', 820, t, 0.05), g = r.gn(t, 0.001, v, 0.035);
  o.connect(g);
  r.route(g, { rev: 0.4, del: 0.15 });
}

export function tom(r: Rig, t: number, f: number, v: number): void {
  const o = r.ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(f, t);
  o.frequency.exponentialRampToValueAtTime(f * 0.55, t + 0.28);
  o.start(t);
  o.stop(t + 0.6);
  const g = r.gn(t, 0.002, v, 0.38);
  o.connect(g);
  const n = r.noise(t, 0.05), b = r.filt('lowpass', 800), g2 = r.gn(t, 0.001, v * 0.35, 0.03);
  n.connect(b).connect(g2);
  r.route(g, { rev: 0.55 });
  r.route(g2, { rev: 0.3 });
}

export function impact(r: Rig, t: number, v: number): void {
  const o = r.ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(90, t);
  o.frequency.exponentialRampToValueAtTime(32, t + 1.2);
  o.start(t);
  o.stop(t + 2);
  const g = r.gn(t, 0.003, v, 1.8);
  o.connect(g);
  r.route(g, { rev: 0.5 });
  const n = r.noise(t, 1.5), b = r.filt('lowpass', 700), g2 = r.gn(t, 0.003, v * 0.5, 1.2);
  n.connect(b).connect(g2);
  r.route(g2, { rev: 0.7 });
}

export function riser(r: Rig, t: number, d: number, v: number, top: number | undefined): void {
  const n = r.noise(t, d), b = r.ctx.createBiquadFilter();
  b.type = 'bandpass';
  b.Q.value = 3;
  b.frequency.setValueAtTime(250, t);
  b.frequency.exponentialRampToValueAtTime(top || 6000, t + d);
  const g = r.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + d);
  g.gain.linearRampToValueAtTime(0, t + d + 0.02);
  n.connect(b).connect(g);
  r.route(g, { rev: 0.6 });
}

export function wind(r: Rig, t: number, d: number, v: number): void {
  const n = r.noise(t, d), b = r.ctx.createBiquadFilter();
  b.type = 'bandpass';
  b.Q.value = 0.8;
  b.frequency.setValueAtTime(400, t);
  b.frequency.linearRampToValueAtTime(1300, t + d * 0.5);
  b.frequency.linearRampToValueAtTime(450, t + d);
  const g = r.sus(t, d * 0.4, v, d, d * 0.4);
  n.connect(b).connect(g);
  r.route(g, { rev: 0.5 });
}

export function crackle(r: Rig, t: number): void {
  const n = r.noise(t, 0.01), b = r.filt('highpass', 3000), g = r.gn(t, 0.0005, 0.03 + Math.random() * 0.03, 0.004);
  n.connect(b).connect(g);
  r.route(g);
}

export function glock(r: Rig, t: number, f: number, v: number): void {
  const o = r.osc('sine', f, t, 1.3), g = r.gn(t, 0.002, v, 1.2);
  o.connect(g);
  const o2 = r.osc('sine', f * 2.76, t, 0.4), g2 = r.gn(t, 0.002, v * 0.3, 0.3);
  o2.connect(g2);
  r.route(g, { rev: 0.7, del: 0.3 });
  r.route(g2, { rev: 0.5 });
}

export function marimba(r: Rig, t: number, f: number, v: number, pan: number | undefined): void {
  const o = r.osc('sine', f, t, 0.6), g = r.gn(t, 0.002, v, 0.45);
  o.connect(g);
  const o2 = r.osc('sine', f * 4, t, 0.1), g2 = r.gn(t, 0.001, v * 0.35, 0.05);
  o2.connect(g2);
  r.route(g, { rev: 0.35, del: 0.3, pan });
  r.route(g2, { rev: 0.2, pan });
}

export function softLead(r: Rig, t: number, f: number, d: number, v: number): void {
  const o = r.osc('triangle', f, t, d + 0.5);
  r.vib(o, t, d + 0.5, 5, f * 0.005, 0.01);
  const lp = r.filt('lowpass', 2600), g = r.ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(v, t + 0.04);
  g.gain.setValueAtTime(v * 0.75, t + d);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.4);
  o.connect(lp).connect(g);
  r.route(g, { rev: 0.45, del: 0.18 });
}

export function flute(r: Rig, t: number, f: number, d: number, v: number, noGlide: number): void {
  const from = noGlide ? f : (r.prevF || f);
  r.prevF = f;
  const o = r.ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(from, t);
  o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
  o.start(t);
  o.stop(t + d + 0.5);
  const o2 = r.ctx.createOscillator();
  o2.type = 'triangle';
  o2.frequency.setValueAtTime(from * 2, t);
  o2.frequency.exponentialRampToValueAtTime(f * 2, t + 0.05);
  o2.start(t);
  o2.stop(t + d + 0.5);
  const g2 = r.ctx.createGain();
  g2.gain.value = 0.12;
  r.vib(o, t, d + 0.5, 5.2, f * 0.008, Math.min(d, 0.6));
  const g = r.ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(v, t + 0.07);
  g.gain.setValueAtTime(v * 0.8, t + d);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.35);
  o.connect(g);
  o2.connect(g2).connect(g);
  const n = r.noise(t, d + 0.3), nb = r.filt('bandpass', f * 2, 4), ng = r.gn(t, 0.03, v * 0.5, 0.25);
  n.connect(nb).connect(ng);
  r.route(ng, { rev: 0.5 });
  r.route(g, { rev: 0.6, del: 0.25 });
}

export function pad(r: Rig, t: number, ns: string[], d: number, v: number, c1: number | undefined, c2: number | undefined): void {
  ns.forEach((n, i) => {
    const f = nf(n);
    [-14, 0, 14].forEach((dt) => {
      const o = r.osc('sawtooth', f, t, d, dt), lp = r.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(c1 || 1300, t);
      lp.frequency.linearRampToValueAtTime(c2 || c1 || 1300, t + d);
      const g = r.sus(t, d * 0.3, v, d, d * 0.2);
      o.connect(lp).connect(g);
      r.route(g, { duck: 1, rev: 0.45, pan: i % 2 ? 0.3 : -0.3 });
    });
  });
}

export function pulse(r: Rig, t: number, f: number, v: number, cut: number, pan: number | undefined): void {
  const o = r.osc('sawtooth', f, t, 0.25), o2 = r.osc('square', f, t, 0.25, 8), lp = r.ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 4;
  lp.frequency.setValueAtTime(cut * 1.6, t);
  lp.frequency.exponentialRampToValueAtTime(cut * 0.5, t + 0.12);
  const g = r.gn(t, 0.002, v, 0.14);
  const m = r.ctx.createGain();
  m.gain.value = 0.5;
  o.connect(lp);
  o2.connect(m).connect(lp);
  lp.connect(g);
  r.route(g, { duck: 1, del: 0.12, pan });
}

const MONO_LAYERS = [['sawtooth', -5, 0.45], ['sawtooth', 5, 0.45], ['triangle', -1200, 0.5]] as const;

export function mono(r: Rig, t: number, f: number, d: number, v: number): void {
  const from = r.prevF || f;
  r.prevF = f;
  const g = r.ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(v, t + 0.03);
  g.gain.setValueAtTime(v * 0.85, t + d);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.35);
  const lp = r.ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 2;
  lp.frequency.setValueAtTime(2400, t);
  lp.frequency.exponentialRampToValueAtTime(1300, t + 0.4);
  lp.connect(g);
  for (const [ty, dt, gg] of MONO_LAYERS) {
    const o = r.ctx.createOscillator();
    o.type = ty;
    o.detune.value = dt;
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
    o.start(t);
    o.stop(t + d + 0.5);
    r.vib(o, t, d + 0.5, 5, f * 0.006, Math.min(d, 0.5));
    const og = r.ctx.createGain();
    og.gain.value = gg;
    o.connect(og).connect(lp);
  }
  r.route(g, { rev: 0.4, del: 0.22 });
}
