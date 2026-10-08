// 미리보기 무대: 배경 + 그림자 + 스프라이트를 1배로 그린 뒤 정수 배율로 확대
import { color, paletteNumber } from '../../../client/src/palette';
import type { RenderedSprite } from '../../../client/src/sprites/render';
import { ramp } from '../../../client/src/sprites/shade';
import { paintCanvas } from '../../../client/src/sprites/textures';

export type Background = 'dungeon' | 'island' | 'checker';

export interface Item {
  sprite: RenderedSprite;
  /** 발밑이 놓일 무대 좌표 */
  x: number;
  y: number;
  flip?: boolean;
  /** 시계 방향 90° 회전 횟수 (spin) */
  rot?: number;
}

export interface Stage {
  width: number;
  height: number;
  scale: number;
  bg: Background;
  shadow: boolean;
  showFoot: boolean;
}

/** 바닥 타일 16×10 (승인 데모의 바닥 그림과 같은 음영) */
function tiles(g: CanvasRenderingContext2D, w: number, h: number, a: string, b: string): void {
  const RA = ramp(color(a)), RB = ramp(color(b));
  for (let ty = 0; ty * 10 < h; ty++) {
    for (let tx = 0; tx * 16 < w; tx++) {
      const R = (tx + ty) % 2 ? RA : RB;
      for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 16; x++) {
          let c = R[1];
          if (y === 0) c = R[0];
          if (y === 9 || x === 15) c = R[2];
          if (x === 0 && y > 0) c = R[0];
          g.fillStyle = c;
          g.fillRect(tx * 16 + x, ty * 10 + y, 1, 1);
        }
      }
    }
  }
}

function background(g: CanvasRenderingContext2D, s: Stage): void {
  if (s.bg === 'dungeon') return tiles(g, s.width, s.height, 'floors.1.bg.floor', 'floors.1.bg.floorAlt');
  if (s.bg === 'island') return tiles(g, s.width, s.height, 'island.grass', 'island.grassAlt');
  for (let y = 0; y < s.height; y += 8)
    for (let x = 0; x < s.width; x += 8) {
      g.fillStyle = color((x + y) % 16 ? 'global.ui.panel' : 'global.ui.panelInner');
      g.fillRect(x, y, 8, 8);
    }
}

/** 발밑 그림자 (승인 데모의 타원 모양) */
function shadow(g: CanvasRenderingContext2D, cx: number, y: number, spriteWidth: number): void {
  const rx = Math.max(5, Math.floor((spriteWidth - 2) * 0.36));
  g.globalAlpha = paletteNumber('global.blobShadow.opacity');
  g.fillStyle = color('global.blobShadow.color');
  for (let dy = -2; dy <= 1; dy++) {
    const hw = Math.round(rx * Math.sqrt(1 - (dy / 2.3) ** 2));
    g.fillRect(cx - hw, y + dy, hw * 2 + 1, 1);
  }
  g.globalAlpha = 1;
}

/** 시계 방향 90° × k. 발밑은 가운데 아래로 다시 잡는다 */
function rotate(s: RenderedSprite, k: number): RenderedSprite {
  let cur = s;
  for (let n = 0; n < ((k % 4) + 4) % 4; n++) {
    const { width: w, height: h } = cur;
    const pixels = Array<string | null>(w * h).fill(null);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) pixels[x * h + (h - 1 - y)] = cur.pixels[y * w + x]!;
    cur = { width: h, height: w, pixels, foot: [Math.floor(h / 2), w - 2] };
  }
  return cur;
}

export function drawStage(target: HTMLCanvasElement, items: Item[], s: Stage): void {
  const off = document.createElement('canvas');
  off.width = s.width;
  off.height = s.height;
  const g = off.getContext('2d')!;
  background(g, s);
  if (s.shadow) for (const it of items) shadow(g, it.x, it.y, it.sprite.width);
  for (const it of items) {
    const sp = it.rot ? rotate(it.sprite, it.rot) : it.sprite;
    const img = paintCanvas(sp);
    const [fx, fy] = sp.foot;
    if (it.flip) {
      g.save();
      g.scale(-1, 1);
      // 발밑 픽셀을 축으로 좌우 반전: 열 c → it.x + fx − c
      g.drawImage(img, -(it.x + fx) - 1, it.y - fy);
      g.restore();
    } else g.drawImage(img, it.x - fx, it.y - fy);
    if (s.showFoot) {
      g.fillStyle = color('global.semantic.danger');
      g.fillRect(it.x, it.y, 1, 1);
    }
  }
  target.width = s.width * s.scale;
  target.height = s.height * s.scale;
  const t = target.getContext('2d')!;
  t.imageSmoothingEnabled = false;
  t.drawImage(off, 0, 0, target.width, target.height);
}
