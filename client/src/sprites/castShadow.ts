// 섬 사물 땅 그림자 (docs/art.md 6장 섬). 값 fx.json islandShadow
// 빛은 왼쪽 위 → 그림자는 사물 오른쪽 뒤 바닥으로 비스듬히 눕는다. 그림의 각 픽셀을 맨 아래 줄에서 잰 높이 h만큼
// 오른쪽(h × shear)·뒤(화면 위, h × lift)로 옮겨 찍은 실루엣 + 맨 아래 줄 바로 밑 접지 줄. 안쪽은 채우고 경계만 바둑판
import type { RenderedSprite } from './render';

export interface ShadowShape {
  width: number;
  height: number;
  /** 칠할 칸 (경계 바둑판까지 반영) */
  cells: boolean[];
  /** 사물 그림과 같은 발밑 → 같은 자리 공식(발밑 − foot)으로 놓으면 겹친다 */
  foot: [number, number];
}

export function castShadow(sp: RenderedSprite, shear: number, lift: number): ShadowShape {
  const at = (x: number, y: number) => sp.pixels[y * sp.width + x] != null;
  let base = -1;
  for (let k = 0; k < sp.pixels.length; k++) if (sp.pixels[k] != null) base = Math.floor(k / sp.width);
  if (base < 0) return { width: 1, height: 1, cells: [false], foot: [sp.foot[0], sp.foot[1]] };
  let maxH = 0;
  for (let k = 0; k < sp.pixels.length; k++) if (sp.pixels[k] != null) maxH = Math.max(maxH, base - Math.floor(k / sp.width));
  const top = base - Math.round(maxH * lift), width = sp.width + Math.ceil(maxH * shear), height = base - top + 2;
  const fill = Array<boolean>(width * height).fill(false);
  for (let y = 0; y <= base; y++) {
    for (let x = 0; x < sp.width; x++) {
      if (!at(x, y)) continue;
      const h = base - y;
      fill[(base - Math.round(h * lift) - top) * width + x + Math.round(h * shear)] = true;
    }
  }
  for (let x = 0; x < sp.width; x++) if (at(x, base)) fill[(base + 1 - top) * width + x] = true;   // 접지 줄
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && fill[y * width + x]!;
  const cells = fill.map((v, k) => {
    const x = k % width, y = Math.floor(k / width);
    const edge = !on(x - 1, y) || !on(x + 1, y) || !on(x, y - 1) || !on(x, y + 1);
    return v && (!edge || (x + y) % 2 === 0);
  });
  return { width, height, cells, foot: [sp.foot[0], sp.foot[1] - top] };
}
