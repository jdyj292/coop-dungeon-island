// 효과음 버스 (docs/audio.md 1·2장, 설정 client/data/sfx.json buses)
// 만드는 순서·값은 승인 원본(tools/sfx-preview/reference-*.html)의 ctx()와 같다
import sfxData from '../../data/sfx.json';

export type BusName = 'action' | 'clear';

export interface Bus {
  name: BusName;
  /** 레이어가 바로 연결되는 곳 (원본의 M) */
  input: GainNode;
  /** 잔향 보내기 (원본의 RV) */
  reverb: GainNode;
  /** 일그러짐 통과 (원본의 DS, action만) */
  dist: WaveShaperNode | null;
}

interface BusConfig {
  gain: number;
  compressor: { threshold: number; ratio: number; attack?: number; release?: number };
  reverb: { length: number; decay: number; send: number };
  distortion?: { amount: number; gain: number };
}

/** 원본의 curve(k): 부드러운 클리핑 */
function curve(k: number): Float32Array<ArrayBuffer> {
  const n = 1024, c = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    c[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return c;
}

export function createBus(ctx: BaseAudioContext, name: BusName, out: AudioNode): Bus {
  const cfg = (sfxData.buses as Record<BusName, BusConfig>)[name];
  const c = ctx.createDynamicsCompressor();
  c.threshold.value = cfg.compressor.threshold;
  c.ratio.value = cfg.compressor.ratio;
  if (cfg.compressor.attack !== undefined) c.attack.value = cfg.compressor.attack;
  if (cfg.compressor.release !== undefined) c.release.value = cfg.compressor.release;
  const input = ctx.createGain();
  input.gain.value = cfg.gain;
  input.connect(c);
  c.connect(out);
  // 잔향: 지수로 줄어드는 잡음 임펄스
  const len = Math.floor(ctx.sampleRate * cfg.reverb.length), ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, cfg.reverb.decay);
  }
  const cv = ctx.createConvolver();
  cv.buffer = ir;
  const reverb = ctx.createGain();
  reverb.gain.value = cfg.reverb.send;
  reverb.connect(cv);
  cv.connect(input);
  let dist: WaveShaperNode | null = null;
  if (cfg.distortion) {
    dist = ctx.createWaveShaper();
    dist.curve = curve(cfg.distortion.amount);
    dist.oversample = '4x';
    const dg = ctx.createGain();
    dg.gain.value = cfg.distortion.gain;
    dist.connect(dg);
    dg.connect(input);
  }
  return { name, input, reverb, dist };
}
