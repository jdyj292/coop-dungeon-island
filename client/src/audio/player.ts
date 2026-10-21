// 효과음 재생 규칙 (docs/audio.md 4장): 음높이 무작위 ±4%(음악적 소리 제외), 같은 소리 동시 4개·50ms 안 합침,
// 볼륨 설정(전체·효과음·음악, 로컬 저장), 첫 입력에서 오디오 시작
import sfxData from '../../data/sfx.json';
import { createBus, type Bus, type BusName } from './buses';
import { soundLength, Synth, type Layer } from './synth';

const JITTER = 0.04;
const MAX_SAME = 4;
const MERGE_SEC = 0.05;
const STORAGE_KEY = 'coop.audio.volume';

export interface Volumes {
  master: number;
  sfx: number;
  music: number;
}
const DEFAULT_VOLUMES: Volumes = { master: 100, sfx: 100, music: 70 };

type Recipes = Record<BusName, Record<string, Layer[]>>;
const recipes = { action: sfxData.action, clear: sfxData.clear } as unknown as Recipes;

/** 소리 이름 → 버스 (이름은 두 버스에서 겹치지 않는다) */
export function busOf(name: string): BusName | null {
  if (name in recipes.action) return 'action';
  if (name in recipes.clear) return 'clear';
  return null;
}

export const soundNames = (): string[] => [...Object.keys(recipes.action), ...Object.keys(recipes.clear)];

export function loadVolumes(): Volumes {
  try {
    return { ...DEFAULT_VOLUMES, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') };
  } catch {
    return { ...DEFAULT_VOLUMES };
  }
}

export class SfxPlayer {
  private ctx: BaseAudioContext | null = null;
  private synths: Partial<Record<BusName, Synth>> = {};
  private master: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  /** 음악 버스 (전체 × 음악 볼륨, BGM이 여기로) */
  private musicGain: GainNode | null = null;
  /** 오디오가 시작되면 (BGM이 기다리던 곡을 튼다) */
  private started: (() => void)[] = [];
  private recent = new Map<string, number[]>();
  volumes: Volumes = loadVolumes();
  /** false면 음높이 무작위 끔 (원본 비교용) */
  jitter = true;

  /** makeCtx: 테스트·비교에서는 가짜 AudioContext */
  constructor(private makeCtx: () => BaseAudioContext = () => new AudioContext(), private rand = Math.random) {}

  /** 버스를 만든다. 이미 있으면 그대로. 브라우저에서는 첫 키·클릭 안에서 불러야 소리가 난다 */
  start(): BaseAudioContext {
    if (!this.ctx) {
      const c = (this.ctx = this.makeCtx());
      this.master = c.createGain();
      this.sfxGain = c.createGain();
      this.sfxGain.connect(this.master);
      this.musicGain = c.createGain();
      this.musicGain.connect(this.master);
      this.master.connect(c.destination);
      this.applyVolumes();
      for (const name of ['action', 'clear'] as const) this.synths[name] = new Synth(c, createBus(c, name, this.sfxGain));
      this.started.forEach((fn) => fn());
    }
    if ('resume' in this.ctx && (this.ctx as AudioContext).state === 'suspended') void (this.ctx as AudioContext).resume();
    return this.ctx;
  }

  /** 첫 키·포인터 입력에서 start (브라우저 자동 재생 정책) */
  unlockOnFirstInput(target: Window = window): void {
    const go = () => {
      this.start();
      target.removeEventListener('keydown', go);
      target.removeEventListener('pointerdown', go);
    };
    target.addEventListener('keydown', go);
    target.addEventListener('pointerdown', go);
  }

  /** 오디오가 시작되면 한 번 (이미 시작했으면 바로) */
  whenStarted(fn: () => void): void {
    if (this.ctx) fn();
    else this.started.push(fn);
  }

  /** 음악 출력 (시작 전이면 null) */
  get music(): { ctx: BaseAudioContext; out: GainNode } | null {
    return this.ctx && this.musicGain ? { ctx: this.ctx, out: this.musicGain } : null;
  }

  bus(name: BusName): Bus | undefined {
    return this.synths[name]?.bus;
  }

  setVolumes(v: Partial<Volumes>): void {
    this.volumes = { ...this.volumes, ...v };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.volumes));
    } catch {
      // 저장 못 하는 환경(사생활 모드 등)이면 이번 실행에만 적용
    }
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (this.master) this.master.gain.value = this.volumes.master / 100;
    if (this.sfxGain) this.sfxGain.gain.value = this.volumes.sfx / 100;
    if (this.musicGain) this.musicGain.gain.value = this.volumes.music / 100;
  }

  /** 미리 듣기 (sfx-preview): 규칙·무작위 없이 delay초 뒤에 재생. 조합(sfx.json combos)을 데모와 같은 타이밍으로 */
  preview(name: string, delay = 0): void {
    const bus = busOf(name);
    if (!bus) return;
    this.start();
    this.synths[bus]!.play(recipes[bus][name]!.map((l) => ({ ...l, at: l.at + delay })), 1);
  }

  /** 소리 재생. 시작 전이거나 규칙에 걸리면 false */
  play(name: string, layers?: Layer[]): boolean {
    const bus = busOf(name);
    if (!this.ctx || !bus) return false;
    const now = this.ctx.currentTime;
    const list = (this.recent.get(name) ?? []).filter((end) => end > now);
    const last = this.recent.get(`${name}@start`)?.[0] ?? -Infinity;
    if (now - last < MERGE_SEC || list.length >= MAX_SAME) return false;
    const recipe = layers ?? recipes[bus][name]!;
    const pitch = this.jitter && !sfxData.noJitter.includes(name) ? 1 + (this.rand() * 2 - 1) * JITTER : 1;
    this.synths[bus]!.play(recipe, pitch);
    list.push(now + soundLength(recipe));
    this.recent.set(name, list);
    this.recent.set(`${name}@start`, [now]);
    return true;
  }
}

/** 게임 전체가 쓰는 하나 */
export const sfx = new SfxPlayer();
