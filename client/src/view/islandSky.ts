// 섬 구름 그림자 (docs/art.md 6장 섬 분위기). 값 fx.json islandSky
// 그림은 처음에 한 번 캔버스로 만들고, 프레임마다 위치만 바꾼다 (넓은 섬에서 점을 매번 찍지 않게)
// 가장자리 바둑판 디더링이 바닥과 어긋나 떨리지 않도록 짝수 px 단위로만 움직인다
import type Phaser from 'phaser';
import fx from '../../data/fx.json';
import { color } from '../palette';
import { lcg, valueNoise } from './islandGround';

const SKY = fx.islandSky;
/** 깊이: 바닥(−1000)·바닥 사물(−999) 위, 캐릭터·사물 아래 */
const DEPTH = -998;

const between = (r: () => number, [a = 0, b = a]: readonly number[] = []) => a + r() * (b - a);

/**
 * 구름 그림자 한 덩어리 (가로 w, 세로 h — 바닥 투영이라 납작). 가운데 타원 몸통 + 둘레에 크기가 제각각인 둥근 혹(lobes)을
 * 빙 둘러 합치고, 옅은 값 노이즈로 혹 모양만 살짝 흐트린다 → 뭉게구름처럼 둥글게 부푼 가장자리. 안쪽은 꽉 채우고 경계 띠만 바둑판
 */
function cloudCanvas(r: () => number): HTMLCanvasElement {
  const w = Math.round(between(r, SKY.clouds.w) / 2) * 2, h = Math.round(between(r, SKY.clouds.h) / 2) * 2;
  const seed = Math.floor(r() * 1e6), { noise, cut, edge, lobeR } = SKY.clouds;
  const count = Math.round(between(r, SKY.clouds.lobes));
  // 혹: 몸통 둘레(0.62배 타원) 위에 고르게 + 조금씩 어긋나게. 반지름은 가로의 lobeR 비율 (캔버스 밖으로 안 나가는 범위)
  const lobes = Array.from({ length: count }, (_, i) => {
    const a = ((i + (r() - 0.5) * 0.6) / count) * Math.PI * 2, rx = w * between(r, lobeR);
    return { cx: w / 2 + Math.cos(a) * w * 0.31, cy: h / 2 + Math.sin(a) * h * 0.31, rx, ry: (rx * h) / w };
  });
  const shape = (x: number, y: number) => {
    const body = 1 - ((x - w / 2) / (0.36 * w)) ** 2 - ((y - h / 2) / (0.36 * h)) ** 2;
    const lobe = Math.max(...lobes.map((l) => 1 - ((x - l.cx) / l.rx) ** 2 - ((y - l.cy) / l.ry) ** 2));
    return Math.max(body, lobe) + (valueNoise(x, y, w / 10, h / 6, seed) - 0.5) * noise;
  };
  const inside = (x: number, y: number) => x >= 2 && y >= 2 && x < w - 2 && y < h - 2;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = color('global.outline');
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = shape(x, y);
      if (inside(x, y) && (v > cut + edge || (v > cut && (x + y) % 2 === 0))) g.fillRect(x, y, 1, 1);
    }
  return c;
}

interface Cloud { img: Phaser.GameObjects.Image; phase: number; seed: number }

export class IslandSky {
  private clouds: Cloud[] = [];

  constructor(scene: Phaser.Scene, private w: number, private h: number) {
    const r = lcg(17);
    for (let i = 0; i < SKY.clouds.count; i++) {
      const key = `islandCloud${i}`;
      if (!scene.textures.exists(key)) scene.textures.addCanvas(key, cloudCanvas(r));
      const img = scene.add.image(0, 0, key).setOrigin(0, 0).setDepth(DEPTH).setAlpha(SKY.clouds.alpha);
      this.clouds.push({ img, phase: i / SKY.clouds.count + r() * 0.2, seed: Math.floor(r() * 1e6) });
    }
  }

  /** 프레임마다: 구름은 가로로만 흘러(위아래 움직임 없음) 반대편에서 다시 들어온다. 다시 들어올 때(화면 밖)만 새 깊이를 고른다 */
  update(timeMs: number): void {
    const s = timeMs / 1000;
    for (const c of this.clouds) {
      const span = this.w + c.img.width * 2, travel = s * SKY.clouds.speed + c.phase * span;
      const lap = Math.floor(travel / span), x = travel - lap * span - c.img.width;
      // 바퀴마다 새 깊이: 씨앗이 가까우면 첫 값도 거의 같아서 두 번째 값을 쓴다
      const pick = lcg(c.seed + lap * 9973);
      pick();
      const y = pick() * (this.h + c.img.height / 2) - c.img.height / 2;
      c.img.setPosition(Math.floor(x / 2) * 2, Math.floor(y / 2) * 2);
    }
  }
}
