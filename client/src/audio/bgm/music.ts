// BGM 재생 규칙 (docs/audio.md 5장): 곡 전환 1초 크로스페이드, 정산 화면은 0.5초에 걸쳐 줄이고 정지,
// 같은 곡이면 이어서 (방을 옮겨도 끊지 않음). 볼륨은 효과음 플레이어의 음악 버스 (전체 × 음악, 기본 70%). 첫 입력 전에는 기다림
import bgmData from '../../../data/bgm.json';
import { sfx, type SfxPlayer } from '../player';
import { BgmTrack, type BgmData } from './engine';

const CROSSFADE_SEC = 1;
const FADE_OUT_SEC = 0.5;

interface Playing {
  id: string;
  track: BgmTrack;
  fade: GainNode;
}

export class MusicPlayer {
  private cur: Playing | null = null;
  /** 오디오 시작 전에 요청된 곡 */
  private wanted: string | null = null;

  constructor(private player: SfxPlayer, private data = bgmData as unknown as BgmData) {
    player.whenStarted(() => { if (this.wanted) this.play(this.wanted); });
  }

  /** 지금 재생 중인 곡 id (없으면 null) */
  get playing(): string | null {
    return this.cur?.id ?? null;
  }

  /** id 곡으로 (같은 곡이면 그대로, 다르면 1초 크로스페이드, 첫 마디부터) */
  play(id: string): void {
    this.wanted = id;
    const m = this.player.music;
    if (!m || this.cur?.id === id) return;
    this.fadeOut(CROSSFADE_SEC);
    const fade = m.ctx.createGain(), t = m.ctx.currentTime;
    fade.gain.setValueAtTime(0, t);
    fade.gain.linearRampToValueAtTime(1, t + CROSSFADE_SEC);
    fade.connect(m.out);
    const track = new BgmTrack(m.ctx, fade, this.data, id);
    track.start();
    this.cur = { id, track, fade };
  }

  /** 줄이고 정지 (정산 화면 0.5초) */
  stop(sec = FADE_OUT_SEC): void {
    this.wanted = null;
    this.fadeOut(sec);
  }

  private fadeOut(sec: number): void {
    const c = this.cur, m = this.player.music;
    if (!c || !m) return;
    this.cur = null;
    const t = m.ctx.currentTime;
    c.fade.gain.cancelScheduledValues(t);
    c.fade.gain.setValueAtTime(c.fade.gain.value, t);
    c.fade.gain.linearRampToValueAtTime(0, t + sec);
    // 예약을 멈추고, 이미 예약된 소리가 다 줄어든 뒤 연결을 끊는다
    c.track.stop();
    setTimeout(() => c.fade.disconnect(), (sec + 0.5) * 1000);
  }
}

/** 게임 전체가 쓰는 하나 */
export const music = new MusicPlayer(sfx);
