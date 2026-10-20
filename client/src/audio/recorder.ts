// 기록용 가짜 AudioContext: 소리를 내지 않고 "어떤 노드를 만들어 어떤 값을 언제 넣고 어디에 연결했는지"를 남긴다.
// 승인 원본(tools/sfx-preview/reference-*.html)과 우리 엔진이 같은 그래프를 만드는지 비교하는 데 쓴다 (테스트·sfx-preview)

export type RecEntry = (string | number)[];

export class Recorder {
  log: RecEntry[] = [];
  private ids = 0;
  /** 기록을 시작한 뒤 만든 노드에 붙는 번호 (그 전 노드는 label로 부른다) */
  private base = 0;

  /** 지금까지를 "준비"로 보고 이후 기록만 남긴다 */
  mark(): void {
    this.log = [];
    this.base = this.ids;
  }

  nextId(): number {
    return this.ids++;
  }

  name(node: FakeNode): string {
    return node.label ?? `#${node.id - this.base}`;
  }
}

const round = (v: number) => Number(v.toPrecision(6));

class FakeParam {
  private v: number;
  constructor(private rec: Recorder, readonly owner: FakeNode, readonly key: string, init = 0) {
    this.v = init;
  }
  get value(): number {
    return this.v;
  }
  set value(v: number) {
    this.v = v;
    this.rec.log.push([this.rec.name(this.owner), `${this.key}=`, round(v)]);
  }
  private ev(kind: string, v: number, t: number): this {
    this.rec.log.push([this.rec.name(this.owner), `${this.key}.${kind}`, round(v), round(t)]);
    return this;
  }
  setValueAtTime(v: number, t: number) { return this.ev('set', v, t); }
  linearRampToValueAtTime(v: number, t: number) { return this.ev('lin', v, t); }
  exponentialRampToValueAtTime(v: number, t: number) { return this.ev('exp', v, t); }
  cancelScheduledValues(t: number) { return this.ev('cancel', 0, t); }
}

export class FakeNode {
  readonly id: number;
  label?: string;
  [key: string]: unknown;

  constructor(protected rec: Recorder, readonly kind: string, params: Record<string, number> = {}) {
    this.id = rec.nextId();
    rec.log.push([`new ${kind}`, rec.name(this)]);
    for (const [k, v] of Object.entries(params)) this[k] = new FakeParam(rec, this, k, v);
  }

  connect(dst: FakeNode | FakeParam): FakeNode | FakeParam {
    // 노드 또는 다른 노드의 파라미터(FM 벨의 주파수)에 연결
    const target = dst instanceof FakeNode ? this.rec.name(dst) : `${this.rec.name(dst.owner)}.${dst.key}`;
    this.rec.log.push([this.rec.name(this), '->', target]);
    return dst;
  }
  disconnect(): void {}
  start(t = 0): void { this.rec.log.push([this.rec.name(this), 'start', round(t)]); }
  stop(t = 0): void { this.rec.log.push([this.rec.name(this), 'stop', round(t)]); }
}

/** 문자열 속성(type·oversample)도 기록 */
function recordProps(node: FakeNode, rec: Recorder, keys: string[]): void {
  for (const k of keys) {
    let v: unknown;
    Object.defineProperty(node, k, {
      get: () => v,
      set: (x: unknown) => {
        v = x;
        const shown = typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean' ? x : x && typeof x === 'object' && 'length' in x ? `len${(x as { length: number }).length}` : '?';
        rec.log.push([rec.name(node), `${k}=`, shown as string | number]);
      },
    });
  }
}

/** Web Audio의 필요한 부분만 흉내 낸다. 시각은 0에 멈춰 있다 */
export class FakeAudioContext {
  readonly rec = new Recorder();
  readonly sampleRate = 48000;
  /** 테스트에서 시간을 옮길 수 있게 */
  currentTime = 0;
  state = 'running';
  readonly destination: FakeNode;

  constructor() {
    this.destination = new FakeNode(this.rec, 'destination');
    this.destination.label = 'OUT';
  }

  resume(): Promise<void> { return Promise.resolve(); }

  private make(kind: string, params: Record<string, number>, props: string[] = []): FakeNode {
    const n = new FakeNode(this.rec, kind, params);
    recordProps(n, this.rec, props);
    return n;
  }
  createGain() { return this.make('gain', { gain: 1 }); }
  createOscillator() { return this.make('osc', { frequency: 440, detune: 0 }, ['type']); }
  createBiquadFilter() { return this.make('filter', { frequency: 350, Q: 1, gain: 0 }, ['type']); }
  createBufferSource() { return this.make('source', { playbackRate: 1 }, ['buffer', 'loop']); }
  createDynamicsCompressor() { return this.make('comp', { threshold: -24, ratio: 12, attack: 0.003, release: 0.25, knee: 30 }); }
  createConvolver() { return this.make('conv', {}, ['buffer']); }
  createWaveShaper() { return this.make('shaper', {}, ['curve', 'oversample']); }
  createDelay() { return this.make('delay', { delayTime: 0 }); }
  createStereoPanner() { return this.make('pan', { pan: 0 }); }
  /** 잡음·잔향 버퍼: 내용(무작위)은 기록하지 않는다 */
  createBuffer(channels: number, length: number, rate: number) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { numberOfChannels: channels, length, sampleRate: rate, getChannelData: (c: number) => data[c]! };
  }
}
