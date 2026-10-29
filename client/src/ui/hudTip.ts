// 아래 띠 버튼 마우스 올림 이름표 (hud.md 8장, 승인 데모 island_hud_help.html tip): 버튼 바로 위 작은 도트 상자, 첫 줄 밝게·다음 줄 흐리게
import type Phaser from 'phaser';
import { dot } from '../fx/layer';
import { colorInt } from '../palette';
import { koText, koWidth, type KoText } from './koText';

const LINE_H = 12, PAD = 4, MARGIN = 2;
/** 안쪽 판 진하기 (데모 rgba(29,24,48,.92)) */
const FILL_ALPHA = 0.92;

export class HudTip {
  private g: Phaser.GameObjects.Graphics;
  private texts: KoText[] = [];
  private sig = '';

  constructor(private scene: Phaser.Scene, private depth: number) {
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(depth);
  }

  /** lines가 비면 숨김. (cx, bottom) = 가운데 x·상자 아래 끝, 화면 밖으로 나가지 않게 좌우를 당김 */
  show(lines: string[], cx: number, bottom: number, screenW: number): void {
    const sig = JSON.stringify([lines, cx, bottom, screenW]);
    if (sig === this.sig) return;
    this.sig = sig;
    this.clear();
    if (!lines.length) return;
    const w = Math.max(...lines.map((l) => koWidth(l))) + PAD * 2, h = lines.length * LINE_H + 4;
    const x = Math.max(MARGIN, Math.min(screenW - w - MARGIN, Math.round(cx - w / 2))), y = bottom - h;
    dot(this.g, x, y, colorInt('global.ui.panelBorder'), w, h);
    dot(this.g, x + 1, y + 1, colorInt('global.ui.panel'), w - 2, h - 2, FILL_ALPHA);
    lines.forEach((l, i) => {
      const color = i === 0 ? 'global.ui.steelLight' : 'global.ui.textDim';
      this.texts.push(koText(this.scene, x + PAD, y + 2 + i * LINE_H, l, { color }).setScrollFactor(0).setDepth(this.depth + 1));
    });
  }

  private clear(): void {
    this.g.clear();
    this.texts.forEach((t) => t.destroy());
    this.texts = [];
  }

  destroy(): void {
    this.clear();
    this.g.destroy();
  }
}
