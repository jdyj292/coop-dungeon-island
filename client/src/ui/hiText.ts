// 고해상도 글자 (docs/hud.md 7장, 카드 창만): 게임 캔버스는 논리 해상도(384×216 등)를 CSS로 키우므로 그 안에서는 선명한 글자를 못 그린다.
// 그래서 게임 캔버스 바로 위에 화면 실제 해상도 캔버스를 겹쳐 시스템 한글 글꼴로 그린다 (외부 글꼴 파일 없음). 좌표·크기는 논리 px.
// 글자는 fillText로만 (HTML로 해석하지 않음, security.md 4장). 마우스는 통과 (pointer-events none)
import type Phaser from 'phaser';
import { hexToInt } from '@game/shared';
import { colorInt } from '../palette';
import { wrapBy } from './koText';

export const HI_FAMILY = '"Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
/** 글자 크기 (논리 px): body = 본문, small = 이름표·도움말, title = 제목 (굵게) */
export const HI_SIZE = { body: 9, small: 8, title: 10 } as const;
export type HiSize = keyof typeof HI_SIZE;
/** 한 줄 상자 높이 (논리 px, 글자는 상자 가운데) */
export const HI_LINE = 10;

const font = (size: HiSize, k: number) => `${size === 'title' ? 'bold ' : ''}${HI_SIZE[size] * k}px ${HI_FAMILY}`;
const css = (color: string) => `#${(color.startsWith('#') ? hexToInt(color) : colorInt(color)).toString(16).padStart(6, '0')}`;

/** 재는 데 쓰는 캔버스 (크게 재서 나눔: 소수 폭까지) */
let measureCtx: CanvasRenderingContext2D | null = null;
const M = 8;
/** 글자 폭 (논리 px, 올림) */
export function hiWidth(s: string, size: HiSize = 'body'): number {
  measureCtx ??= document.createElement('canvas').getContext('2d')!;
  measureCtx.font = font(size, M);
  return Math.ceil(measureCtx.measureText(s).width / M);
}

/** maxW 안에 안 들어가면 끝을 '…'로 */
export function fitHi(s: string, maxW: number, size: HiSize = 'body'): string {
  if (hiWidth(s, size) <= maxW) return s;
  while (s.length > 1 && hiWidth(`${s}…`, size) > maxW) s = s.slice(0, -1);
  return `${s}…`;
}

/** maxW 안에 들어가게 줄 나누기 (koText.ts wrapKo와 같은 규칙) */
export const wrapHi = (text: string, maxW: number, maxLines: number, size: HiSize = 'body'): string[] => wrapBy(text, maxW, maxLines, (t) => hiWidth(t, size));

/** 게임 캔버스 위에 겹친 고해상도 글자 층 */
export class HiTextLayer {
  private canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d')!;
  /** 논리 px → 캔버스 px */
  private k = 1;

  constructor(private scene: Phaser.Scene) {
    const game = scene.game.canvas, parent = game.parentElement!;
    if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
    Object.assign(this.canvas.style, { position: 'absolute', pointerEvents: 'none', left: '0', top: '0' });
    parent.insertBefore(this.canvas, game.nextSibling);
  }

  /** 지우고 게임 캔버스 크기·위치에 맞춤 (그리기 전에 한 번) */
  begin(): void {
    const game = this.scene.game.canvas, r = game.getBoundingClientRect(), pr = game.parentElement!.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    Object.assign(this.canvas.style, { left: `${r.left - pr.left}px`, top: `${r.top - pr.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    this.k = (r.width / this.scene.scale.width) * dpr;
    this.ctx.clearRect(0, 0, w, h);
  }

  /** (x, y) = 한 줄 상자(높이 HI_LINE)의 왼쪽 위, 논리 px */
  text(x: number, y: number, s: string, color: string, size: HiSize = 'body', alpha = 1): void {
    const c = this.ctx, k = this.k;
    c.globalAlpha = alpha;
    c.font = font(size, k);
    c.textBaseline = 'middle';
    c.fillStyle = css(color);
    c.fillText(s, Math.round(x * k), Math.round((y + HI_LINE / 2) * k));
    c.globalAlpha = 1;
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  destroy(): void {
    this.canvas.remove();
  }
}
