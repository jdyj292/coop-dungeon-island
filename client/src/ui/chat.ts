// 채팅 표시 (hud.md 4장): 왼쪽 아래 대화 기록 최근 N줄(이름은 플레이어 색, 새 글 뒤 6초 지나면 흐려짐, 입력창을 열면 선명),
// 말한 사람 머리 위 말풍선 3초 (최대 2줄, 넘치면 말줄임). 글은 모두 갈무리 비트맵 텍스트 (HTML로 해석하지 않음)
import type Phaser from 'phaser';
import { dot } from '../fx/layer';
import { colorInt } from '../palette';
import { koText, koWidth, wrapKo, type KoText } from './koText';

const FADE_SEC = 6, FADED_ALPHA = 0.35, BUBBLE_SEC = 3, BUBBLE_W = 88, LINE = 11;

export interface ChatLine {
  name: string;
  color: number;
  text: string;
}

export class ChatLog {
  private lines: ChatLine[] = [];
  private shown: KoText[] = [];
  private lastAt = -Infinity;
  private dirty = false;

  /** max = 보이는 줄 수 (섬 5, 던전 3), dimmed = 던전처럼 늘 반투명 */
  constructor(private scene: Phaser.Scene, private depth: number, private max = 5, private dimmed = false) {}

  push(l: ChatLine, nowSec: number): void {
    this.lines = [...this.lines, l].slice(-this.max);
    this.lastAt = nowSec;
    this.dirty = true;
  }

  /** bottom = 기록 맨 아래 줄 위치 (아래 띠 위쪽), open = 입력창이 열림 */
  draw(nowSec: number, bottom: number, open: boolean): void {
    if (this.dirty) {
      this.shown.forEach((t) => t.destroy());
      this.shown = this.lines.flatMap((l, i) => {
        const y = bottom - (this.lines.length - i) * LINE;
        const name = koText(this.scene, 4, y, `${l.name}:`, { font: 'koSmall', color: colorInt(`global.playerColors.${l.color}`), outline: 'four' });
        const text = koText(this.scene, 4 + name.textWidth + 4, y, l.text, { font: 'koSmall', color: 'global.fx.flash', outline: 'four' });
        return [name, text].map((t) => t.setScrollFactor(0).setDepth(this.depth));
      });
      this.dirty = false;
    }
    const fresh = open || nowSec - this.lastAt < FADE_SEC;
    const a = this.dimmed ? (open ? 1 : FADED_ALPHA) : fresh ? 1 : FADED_ALPHA;
    this.shown.forEach((t) => t.setAlpha(a));
  }

  destroy(): void {
    this.shown.forEach((t) => t.destroy());
  }
}

interface Bubble { lines: KoText[]; g: Phaser.GameObjects.Graphics; until: number; w: number; h: number }

/** 머리 위 말풍선 (월드 좌표): 흰 바탕 + 외곽선 + 아래 꼬리 */
export class SpeechBubbles {
  private bubbles = new Map<string, Bubble>();

  constructor(private scene: Phaser.Scene, private depth: number) {}

  say(who: string, text: string, nowSec: number): void {
    this.remove(who);
    const rows = wrapKo(text, BUBBLE_W, 2, 'koSmall');
    const w = Math.max(...rows.map((r) => koWidth(r, 'koSmall'))) + 6, h = rows.length * LINE + 3;
    const g = this.scene.add.graphics().setDepth(this.depth);
    const lines = rows.map((r) => koText(this.scene, 0, 0, r, { font: 'koSmall', color: 'global.outline' }).setDepth(this.depth + 1));
    this.bubbles.set(who, { lines, g, until: nowSec + BUBBLE_SEC, w, h });
  }

  /** 프레임마다: 말한 사람 머리 위 (sx, top = 머리 위 화면 y) */
  draw(who: string, sx: number, top: number, nowSec: number): void {
    const b = this.bubbles.get(who);
    if (!b) return;
    if (nowSec > b.until) return this.remove(who);
    const x = Math.round(sx - b.w / 2), y = Math.round(top - b.h - 3);
    const g = b.g;
    g.clear();
    dot(g, x - 1, y - 1, colorInt('global.outline'), b.w + 2, b.h + 2);
    dot(g, x, y, colorInt('island.paper'), b.w, b.h);
    dot(g, sx - 1, y + b.h, colorInt('island.paper'), 3, 1);
    dot(g, sx, y + b.h + 1, colorInt('global.outline'), 1, 1);
    b.lines.forEach((t, i) => t.moveTo(x + 3, y + 1 + i * LINE));
  }

  /** 섬을 떠난 사람 등 */
  remove(who: string): void {
    const b = this.bubbles.get(who);
    if (!b) return;
    b.lines.forEach((t) => t.destroy());
    b.g.destroy();
    this.bubbles.delete(who);
  }

  destroy(): void {
    for (const k of [...this.bubbles.keys()]) this.remove(k);
  }
}
