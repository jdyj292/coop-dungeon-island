// 캔버스 한글 글자 (docs/hud.md 7장): 갈무리 비트맵을 자기 캔버스 텍스처에 픽셀로 찍는 이미지
// 사용자 입력(이름·채팅·메모)도 이것으로 그린다 — 글자를 HTML로 해석하지 않음 (security.md 4장)
import Phaser from 'phaser';
import { colorInt } from '../palette';
import { glyphFont, type FontKey } from './fonts';
import { measureText, paintText } from './glyphFont';
import type { Outline } from './pixelFont';

const OUTLINE: Record<Outline, [number, number][]> = {
  four: [[1, 0], [-1, 0], [0, 1], [0, -1]],
  five: [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1]],
  none: [],
};

export interface KoStyle {
  /** palette 경로 또는 색 정수 */
  color: string | number;
  font?: FontKey;
  /** 정수 배율 (1 = 글꼴 고유 크기) */
  size?: number;
  outline?: Outline;
  align?: 'left' | 'center' | 'right';
}

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
let serial = 0;

/** (x, y) = 글자 줄 상자의 왼쪽 위 (align에 따라 가운데·오른쪽). 위치는 항상 정수 픽셀 */
export class KoText extends Phaser.GameObjects.Image {
  private tex: Phaser.Textures.CanvasTexture;
  private anchor: { x: number; y: number };
  private text = '';

  constructor(scene: Phaser.Scene, x: number, y: number, text: string, private st: KoStyle) {
    const key = `koText${serial++}`;
    const tex = scene.textures.createCanvas(key, 1, 1)!;
    super(scene, x, y, key);
    this.tex = tex;
    this.anchor = { x, y };
    this.setOrigin(0, 0);
    const textures = scene.textures;
    this.once(Phaser.GameObjects.Events.DESTROY, () => textures.remove(tex));
    this.setText(text);
  }

  setText(text: string): this {
    if (text === this.text && this.width > 1) return this;
    this.text = text;
    const f = glyphFont(this.st.font ?? 'ko'), s = this.st.size ?? 1;
    const offs = OUTLINE[this.st.outline ?? 'none'], pad = offs.length ? 1 : 0;
    const w = f ? measureText(f, text) : 0, h = f?.lineHeight ?? 1;
    this.tex.setSize(Math.max(1, (w + pad * 2) * s), (h + pad * 2) * s);
    const ctx = this.tex.context;
    ctx.clearRect(0, 0, this.tex.width, this.tex.height);
    if (f) {
      const paint = (c: number, ox: number, oy: number) => {
        ctx.fillStyle = hex(c);
        paintText(f, text, (px, py) => ctx.fillRect((px + pad + ox) * s, (py + pad + oy) * s, s, s));
      };
      const ol = colorInt('global.outline');
      for (const [ox, oy] of offs) paint(ol, ox, oy);
      paint(typeof this.st.color === 'number' ? this.st.color : colorInt(this.st.color), 0, 0);
    }
    this.tex.refresh();
    this.setTexture(this.tex.key);
    this.place();
    return this;
  }

  /** 기준점 옮기기 */
  moveTo(x: number, y: number): this {
    this.anchor = { x, y };
    return this.place();
  }

  /** 글자 폭 (외곽선 제외, 배율 적용) */
  get textWidth(): number {
    const pad = this.st.outline && this.st.outline !== 'none' ? 1 : 0;
    return this.width - pad * 2 * (this.st.size ?? 1);
  }

  private place(): this {
    const s = this.st.size ?? 1, pad = this.st.outline && this.st.outline !== 'none' ? s : 0, w = this.textWidth;
    const left = this.st.align === 'center' ? this.anchor.x - Math.floor(w / 2) : this.st.align === 'right' ? this.anchor.x - w : this.anchor.x;
    this.setPosition(Math.round(left) - pad, Math.round(this.anchor.y) - pad);
    return this;
  }
}

export function koText(scene: Phaser.Scene, x: number, y: number, text: string, st: KoStyle): KoText {
  return scene.add.existing(new KoText(scene, x, y, text, st));
}

/** 글자 폭 (배율 1, 글꼴을 아직 못 받았으면 0) */
export function koWidth(text: string, font: FontKey = 'ko'): number {
  const f = glyphFont(font);
  return f ? measureText(f, text) : 0;
}

/** maxW 안에 들어가게 줄 나누기 (띄어쓰기 우선, 안 되면 글자 단위). maxLines를 넘으면 마지막 줄 끝을 '…'로 */
export function wrapKo(text: string, maxW: number, maxLines: number, font: FontKey = 'ko'): string[] {
  const lines: string[] = [];
  let cur = '';
  const push = () => { lines.push(cur); cur = ''; };
  for (const word of text.split(' ')) {
    const cand = cur ? `${cur} ${word}` : word;
    if (koWidth(cand, font) <= maxW) { cur = cand; continue; }
    if (cur) push();
    // 한 단어가 너무 길면 글자 단위로
    for (const ch of word) {
      if (koWidth(cur + ch, font) > maxW && cur) push();
      cur += ch;
    }
  }
  if (cur) push();
  if (lines.length > maxLines) {
    const keep = lines.slice(0, maxLines);
    let last = keep[maxLines - 1]!;
    while (last && koWidth(`${last}…`, font) > maxW) last = [...last].slice(0, -1).join('');
    keep[maxLines - 1] = `${last}…`;
    return keep;
  }
  return lines;
}
