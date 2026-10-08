// 던전 방 배경 (docs/art.md 6장 "바닥과 벽"). 승인 데모 floor1_room_hud_mockup.html의 그리기를 월드 좌표로 옮김
import { TILE } from '@game/shared';
import { color, paletteNumber } from '../palette';
import { ramp } from '../sprites/shade';
import { FIELD_BOTTOM, FLOOR_TOP, WALL_TOP } from './layout';

const WALL_H = FLOOR_TOP - WALL_TOP;
const TILE_H = 10;
/** 기둥은 벽돌 5칸마다 */
const PILLAR_EVERY = 5;
/** 나무 배치 한 묶음 (데모 화면 폭 기준 x, 크기 단계) — 이 폭마다 반복 */
const TREES: [x: number, k: number][] = [[10, 0], [70, 1], [140, 0], [205, 1], [262, 0]];
const TREE_REPEAT = 288;

/** 데모와 같은 난수 (Park–Miller) */
function rng(seed: number): () => number {
  let s = seed % 2147483647 || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

/** floor: 1층 */
export function drawRoomBg(floor: number, roomW: number, depthTiles: number, height: number): HTMLCanvasElement {
  const c = (k: string) => color(`floors.${floor}.${k}`);
  const RF = ramp(c('bg.floor')), RA = ramp(c('bg.floorAlt')), RW = ramp(c('bg.wall')), RD = ramp(c('bg.wallDark'));
  const RP = ramp(c('bg.prop')), RMS = ramp(c('env.moss')), RL = ramp(c('env.leaf'));
  const voidC = c('env.void');

  const canvas = document.createElement('canvas');
  canvas.width = roomW;
  canvas.height = height;
  const b = canvas.getContext('2d')!;
  const P = (x: number, y: number, col: string) => { b.fillStyle = col; b.fillRect(x, y, 1, 1); };
  b.fillStyle = voidC;
  b.fillRect(0, 0, roomW, height);

  // 벽 위로 보이는 나무
  for (let base = 0; base < roomW + TREE_REPEAT; base += TREE_REPEAT) {
    for (const [tx, k] of TREES) {
      const x = base + tx, r = 9 + k;
      for (let j = -r * 1.5; j < r * 1.5; j++) {
        for (let i = -r * 1.3; i < r * 1.3; i++) {
          const inside = (i * i) / (r * r) + (j * j) / (r * r * 0.8) < 1
            || ((i + 6) ** 2) / (r * r * 0.6) + ((j - 4) ** 2) / (r * r * 0.5) < 1
            || ((i - 7) ** 2) / (r * r * 0.6) + ((j - 3) ** 2) / (r * r * 0.5) < 1;
          const yy = WALL_TOP - 6 + j, xx = x + i;
          if (!inside || yy < 0 || yy >= WALL_TOP + 4) continue;
          let col = RP[1];
          if (j < -r * 0.5 || i < -r * 0.6) col = RP[0];
          if (j > r * 0.3) col = RP[2];
          if ((xx * 7 + yy * 3) % 17 === 0) col = RL[0];
          P(xx, yy, col);
        }
      }
      for (let y = WALL_TOP - 2; y < WALL_TOP + 2; y++)
        for (let i = -1; i <= 1; i++) P(x + i, y, c(i < 0 ? 'env.trunk' : 'env.trunkDark'));
    }
  }

  // 뒤쪽 벽: 벽돌 16×7, 줄마다 반 칸 어긋남, 기둥, 위 이끼, 아래 3줄 디더링
  for (let tx = 0; tx * TILE < roomW; tx++) {
    const X = tx * TILE, pill = tx % PILLAR_EVERY === 1, h = WALL_H + (pill ? 3 : 0), R = pill ? RD : RW;
    for (let y = FLOOR_TOP - h; y < FLOOR_TOP; y++) {
      for (let x = X; x < X + TILE; x++) {
        const ly = y - (FLOOR_TOP - h), row = Math.floor(ly / 7), off = row % 2 ? 8 : 0, bx = (x - X + off) % 16, by = ly % 7;
        let col = R[1];
        if (pill) {
          col = x - X < 3 ? R[0] : x - X > 12 ? R[2] : R[1];
          if (by === 6 && x - X > 1 && x - X < 14) col = R[3];
        } else if (by === 6 || bx === 0 || bx === 8) col = R[3];
        else if (by === 0) col = R[0];
        else if (by === 5 || bx === 7 || bx === 15) col = R[2];
        if (ly > h - 4) col = (x + y) % 2 ? R[3] : R[2];
        P(x, y, col);
      }
    }
    for (let x = X; x < X + TILE; x++) { P(x, FLOOR_TOP - h, R[3]); P(x, FLOOR_TOP - h + 1, R[0]); }
    const rnd = rng(tx * 97 + 7);
    let mx = X + Math.floor(rnd() * 5);
    for (let k = 0; k < 2; k++) {
      const mw = 5 + Math.floor(rnd() * 4);
      for (let x = mx; x < mx + mw && x < X + TILE; x++) {
        const d = Math.round(Math.sin(((x - mx) / mw) * Math.PI) * 2);
        for (let y = -2; y <= d; y++) P(x, FLOOR_TOP - h + y, y < -1 ? RMS[0] : y < d ? RMS[1] : RMS[2]);
      }
      mx += mw + 3;
    }
  }

  // 바닥 타일 16×10: 윗줄 밝음, 아랫줄·오른쪽 그림자, 점 무늬, 가끔 풀 포기
  for (let tz = 0; tz < depthTiles; tz++) {
    for (let tx = 0; tx * TILE < roomW; tx++) {
      const X = tx * TILE, Y = FLOOR_TOP + tz * TILE_H, R = (tx + tz) % 2 ? RF : RA, rnd = rng(tx * 31 + tz * 7 + 1);
      for (let y = 0; y < TILE_H; y++) {
        for (let x = 0; x < TILE; x++) {
          let col = R[1];
          if (y === 0) col = R[0];
          if (y === TILE_H - 1 || x === TILE - 1) col = R[2];
          if (x === 0 && y > 0) col = R[0];
          P(X + x, Y + y, col);
        }
      }
      for (let k = 0; k < 4; k++) P(X + 1 + Math.floor(rnd() * 14), Y + 1 + Math.floor(rnd() * 7), R[0]);
      for (let k = 0; k < 3; k++) P(X + 1 + Math.floor(rnd() * 14), Y + 1 + Math.floor(rnd() * 7), R[2]);
      if (rnd() > 0.6) {
        const gx = X + 2 + Math.floor(rnd() * 11), gy = Y + 4 + Math.floor(rnd() * 4);
        for (const [a, dy] of [[0, 0], [0, -1], [2, 0], [2, -1], [2, -2], [4, 0]] as const)
          P(gx + a, gy + dy, dy < -1 ? RMS[0] : c('env.grass'));
      }
    }
  }

  // 벽 앞 바닥의 얕은 디더링 그늘
  b.globalAlpha = paletteNumber(`floors.${floor}.env.shadeAlpha`);
  for (let y = FLOOR_TOP; y < FLOOR_TOP + TILE_H; y++)
    for (let x = 0; x < roomW; x++) {
      const d = (y - FLOOR_TOP) / TILE_H;
      if (((x + y) % 2 === 0 && d < 0.5) || (x % 2 === 0 && y % 2 === 0)) P(x, y, c('env.shade'));
    }
  b.globalAlpha = 1;

  // 방 깊이가 얕으면 남는 아래쪽은 어두운 절벽 가장자리
  const edge = FLOOR_TOP + depthTiles * TILE_H;
  for (let y = edge; y < height; y++)
    for (let x = 0; x < roomW; x++) {
      const d = (y - edge) / Math.max(1, FIELD_BOTTOM - edge);
      let col = y === edge ? RD[0] : y < edge + 3 ? RD[2] : c('env.cliff');
      if (d > 0.4 && (x + y) % 2 === 0) col = voidC;
      P(x, y, col);
    }
  return canvas;
}
