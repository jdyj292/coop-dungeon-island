// 던전 방 배경 (docs/art.md 6장 "땅 밑 숲"): 먼 숲·나무줄기·덤불·풀밭, 위쪽은 잎 덮개. 우물 방은 입장 지점 위 덮개에 구멍과 빛줄기
import { entryPos, TILE, type RoomDef } from '@game/shared';
import { color, paletteNumber } from '../palette';
import { ramp } from '../sprites/shade';
import { FIELD_BOTTOM, FLOOR_TOP, project, WALL_TOP } from './layout';

const TILE_H = 10;

function rng(seed: number): () => number {
  let s = seed % 2147483647 || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

/** 격자 해시 → 0~1 */
function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** 부드러운 값 잡음 0~1 */
function noise(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** 첫 방 우물 구멍 자리 = 혼자일 때 입장 지점 (월드 x, 화면 y) */
function wellHole(room: RoomDef): { x: number; sy: number } {
  const start = entryPos(room, 0);
  return { x: Math.round(start.x), sy: project(start.x, start.y).sy };
}

/** floor: 1층. room?.wellDrop이면 입장 지점 위 잎 덮개에 구멍·빛줄기 */
export function drawRoomBg(floor: number, roomW: number, depthTiles: number, height: number, room?: RoomDef): HTMLCanvasElement {
  const hole = room?.wellDrop ? wellHole(room) : undefined;
  const c = (k: string) => color(`floors.${floor}.${k}`);
  const RF = ramp(c('bg.floor')), RA = ramp(c('bg.floorAlt')), RD = ramp(c('bg.wallDark'));
  const RP = ramp(c('bg.prop')), RMS = ramp(c('env.moss')), RL = ramp(c('env.leaf')), RT = ramp(c('env.trunk')), RG = ramp(c('env.grass'));
  const voidC = c('env.void');

  const canvas = document.createElement('canvas');
  canvas.width = roomW;
  canvas.height = height;
  const b = canvas.getContext('2d')!;
  const P = (x: number, y: number, col: string) => { b.fillStyle = col; b.fillRect(x, y, 1, 1); };
  b.fillStyle = voidC;
  b.fillRect(0, 0, roomW, height);
  const holeL = hole ? hole.x - 8 : -99, holeR = hole ? hole.x + 8 : -99;
  const inHole = (x: number, pad = 0) => x >= holeL - pad && x <= holeR + pad;

  // 1. 먼 숲: 어두운 잎 덩어리와 가는 줄기 (깊이감)
  for (let y = 0; y < FLOOR_TOP; y++)
    for (let x = 0; x < roomW; x++) {
      const n = noise(x / 9, y / 7);
      if (n > 0.55) P(x, y, (x + y) % 2 ? RD[3] : RD[2]);
      else if (n > 0.42 && (x + y) % 2 === 0) P(x, y, RD[3]);
    }
  const far = rng(5);
  for (let x = 6; x < roomW; x += 12 + Math.floor(far() * 14)) {
    const w = 2 + Math.floor(far() * 2);
    for (let y = 0; y < FLOOR_TOP; y++) for (let i = 0; i < w; i++) P(x + i, y, i === 0 ? RD[2] : RD[3]);
  }

  // 2. 가까운 나무줄기: 두께 제각각, 나무껍질 줄, 밑동이 벌어진 뿌리
  const near = rng(17);
  for (let x0 = 4 + Math.floor(near() * 10); x0 < roomW; x0 += 26 + Math.floor(near() * 30)) {
    if (inHole(x0, 6)) continue;
    const w = 5 + Math.floor(near() * 5), seed = Math.floor(near() * 1000);
    for (let y = 0; y < FLOOR_TOP + 2; y++) {
      const flare = Math.max(0, y - (FLOOR_TOP - 7)), l = x0 - Math.ceil(flare * 0.8), r = x0 + w + Math.ceil(flare * 0.8);
      for (let x = l; x < r; x++) {
        const f = (x - l) / (r - l);
        let col = f < 0.25 ? RT[0] : f > 0.72 ? RT[2] : RT[1];
        if (hash(x * 3 + seed, Math.floor(y / 5)) > 0.8 && f > 0.15 && f < 0.85) col = RT[2];
        if (x === r - 1) col = RT[3];
        P(x, y, col);
      }
    }
    // 줄기에 붙은 이끼 한 덩이
    const my = WALL_TOP + Math.floor(near() * 18);
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3 - j; i++) P(x0 + i, my + j, j ? RMS[1] : RMS[0]);
  }

  // 3. 잎 덮개 (천장): 둥근 잎 뭉치가 겹친 아래 가장자리, 잎결 무늬
  const leaf = rng(23);
  const lobes: [cx: number, cy: number, r: number][] = [];
  for (let x = -6; x < roomW + 8; x += 6 + Math.floor(leaf() * 6)) lobes.push([x, 4 + Math.floor(leaf() * 5), 3 + Math.floor(leaf() * 4)]);
  const heights = new Array<number>(roomW).fill(5);
  for (const [cx, cy, r] of lobes)
    for (let x = cx - r; x <= cx + r; x++) if (x >= 0 && x < roomW) heights[x] = Math.max(heights[x]!, cy + Math.round(Math.sqrt(r * r - (x - cx) ** 2)));
  const canopy = (x: number) => heights[Math.min(roomW - 1, Math.max(0, x))]!;
  for (let x = 0; x < roomW; x++) {
    if (inHole(x)) continue;
    const h = canopy(x);
    for (let y = 0; y < h; y++) {
      let col = noise(x / 5, y / 3) > 0.5 ? RP[1] : RP[2];
      if ((x * 3 + y * 5) % 11 === 0) col = RL[0];
      if (y < 2) col = RP[3];
      if (y === h - 2 || y === h - 3) col = (x + y) % 3 ? RP[0] : RL[0];
      if (y === h - 1) col = RP[2];
      P(x, y, col);
    }
  }
  // 구멍 테두리: 잎이 안쪽으로 살짝 늘어짐
  if (hole) for (const side of [-1, 1]) for (let y = 0; y < 9; y++) P(hole.x + side * (8 - (y > 5 ? 1 : 0)), y, y % 3 ? RP[2] : RL[0]);

  // 4. 늘어진 넝쿨: 드문드문, 곧게 내려오며 작은 잎이 양쪽으로 번갈아
  const vine = rng(29);
  for (let x = 20 + Math.floor(vine() * 20); x < roomW; x += 38 + Math.floor(vine() * 40)) {
    if (inHole(x, 4)) continue;
    const top = canopy(x) - 1, len = 6 + Math.floor(vine() * 12);
    for (let y = top; y < top + len; y++) {
      P(x, y, RMS[1]);
      if ((y - top) % 4 === 2) P(x + ((y - top) % 8 < 4 ? 1 : -1), y, RL[0]);
    }
    P(x, top + len, RL[0]);
  }

  // 5. 벽 자리 덤불: 둥근 덤불 뭉치(왼쪽 위 밝음·아래 그늘)가 겹쳐 바닥 위로 살짝 걸침
  const bush = rng(53);
  const clumps: [cx: number, cy: number, r: number][] = [];
  for (let x = -4; x < roomW + 8; x += 7 + Math.floor(bush() * 7)) clumps.push([x, FLOOR_TOP - 3 - Math.floor(bush() * 6), 5 + Math.floor(bush() * 5)]);
  // 뒤 줄(어둡게) → 앞 줄(밝게)
  for (const back of [true, false])
    for (const [cx, cy0, r0] of clumps) {
      const cx2 = back ? cx + 4 : cx, cy = back ? cy0 - 3 : cy0, r = back ? r0 + 1 : r0;
      for (let y = cy - r; y < FLOOR_TOP + 2; y++)
        for (let x = cx2 - r; x <= cx2 + r; x++) {
          const dx = x - cx2, dy = y - cy;
          if (dx * dx + dy * dy * 1.3 > r * r && y < cy) continue;
          if (Math.abs(dx) > r) continue;
          const lit = -dx - dy * 1.4;
          let col = back ? (lit > r * 0.6 ? RP[1] : RP[2]) : lit > r * 0.9 ? RMS[0] : lit > -r * 0.2 ? RMS[1] : RP[1];
          if (!back && (x * 3 + y * 7) % 13 === 0) col = RL[0];
          if (y >= FLOOR_TOP) col = RP[2];
          P(x, y, col);
        }
      if (!back && bush() > 0.5) { P(cx - 1, cy - r - 1, RG[0]); P(cx - 2, cy - r - 2, RG[0]); P(cx + 1, cy - r - 1, RMS[0]); }
    }

  // 6. 풀밭 바닥: 격자 없이 큰 얼룩(경계만 디더링), 흙 자리, 나뭇잎 사이 햇빛, 풀 포기·작은 꽃·돌멩이
  const edge = FLOOR_TOP + depthTiles * TILE_H;
  const bayer = (x: number, y: number) => ([0, 2, 3, 1][(x % 2) + (y % 2) * 2]! - 1.5) * 0.035;
  for (let y = FLOOR_TOP; y < edge; y++)
    for (let x = 0; x < roomW; x++) {
      const n = noise(x / 26, y / 10) * 0.75 + noise(x / 7, y / 4) * 0.25 + bayer(x, y);
      const dirt = noise(x / 34 + 40, y / 13 + 40) + bayer(x, y);
      let col = n > 0.62 ? RA[0] : n > 0.45 ? RA[1] : n > 0.3 ? RF[1] : RF[2];
      if (n <= 0.3 && hash(x, y) > 0.35) col = RF[1];
      if (dirt > 0.76) col = dirt > 0.8 ? RT[1] : RT[2];
      if (dirt > 0.8 && hash(x, y) > 0.93) col = RT[0];
      P(x, y, col);
    }
  // 햇빛 얼룩: 잎 사이로 내려온 둥근 빛 (바둑판 디더링, 옅게)
  const sun = rng(61);
  b.globalAlpha = 0.18;
  for (let k = 0; k < roomW / 70; k++) {
    const sx = Math.floor(sun() * roomW), sy = FLOOR_TOP + 8 + Math.floor(sun() * Math.max(1, edge - FLOOR_TOP - 14)), rx = 7 + Math.floor(sun() * 6), ry = 3 + Math.floor(sun() * 2);
    for (let y = sy - ry; y <= sy + ry; y++)
      for (let x = sx - rx; x <= sx + rx; x++)
        if (((x - sx) / rx) ** 2 + ((y - sy) / ry) ** 2 < 1 && (x + y) % 2 === 0 && y < edge) P(x, y, c('env.glow'));
  }
  b.globalAlpha = 1;
  const deco = rng(41);
  const tufts = Math.floor((roomW * (edge - FLOOR_TOP)) / 120);
  for (let k = 0; k < tufts; k++) {
    const gx = Math.floor(deco() * roomW), gy = FLOOR_TOP + 3 + Math.floor(deco() * (edge - FLOOR_TOP - 4)), kind = deco();
    if (kind < 0.7) {
      for (const [a, dy] of [[0, 0], [0, -1], [2, 0], [2, -1], [2, -2], [4, 0]] as const) P(gx + a, gy + dy, dy < -1 ? RG[0] : dy < 0 ? RG[1] : RMS[1]);
    } else if (kind < 0.85) {
      // 클로버
      for (const [a, dy] of [[0, 0], [1, -1], [2, 0], [1, 0]] as const) P(gx + a, gy + dy, a === 1 && dy === 0 ? RL[1] : RG[0]);
    } else if (kind < 0.93) {
      // 작은 꽃
      for (const [a, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]] as const) P(gx + a, gy + dy, c('monster.cream'));
      P(gx, gy, c('env.glow'));
    } else {
      // 돌멩이
      P(gx, gy, RD[0]); P(gx + 1, gy, RD[1]); P(gx, gy + 1, RD[2]); P(gx + 1, gy + 1, RD[3]);
    }
  }

  // 덤불 앞 바닥의 얕은 디더링 그늘
  b.globalAlpha = paletteNumber(`floors.${floor}.env.shadeAlpha`);
  for (let y = FLOOR_TOP; y < FLOOR_TOP + TILE_H; y++)
    for (let x = 0; x < roomW; x++) {
      const d = (y - FLOOR_TOP) / TILE_H;
      if (((x + y) % 2 === 0 && d < 0.5) || (x % 2 === 0 && y % 2 === 0)) P(x, y, c('env.shade'));
    }
  b.globalAlpha = 1;

  // 방 깊이가 얕으면 남는 아래쪽은 어두운 흙 가장자리, 뿌리 끝이 살짝
  for (let y = edge; y < height; y++)
    for (let x = 0; x < roomW; x++) {
      const d = (y - edge) / Math.max(1, FIELD_BOTTOM - edge);
      let col = y === edge ? RMS[2] : y < edge + 3 ? RT[3] : c('env.cliff');
      if (d > 0.4 && (x + y) % 2 === 0) col = voidC;
      P(x, y, col);
    }
  for (let x = 0; x < roomW; x += TILE) if (hash(x, 3) > 0.5) P(x + 5, edge + 3, RG[2]);

  // 우물 구멍 빛줄기 (밧줄은 없음)
  if (hole) {
    b.globalAlpha = 0.35;
    for (let y = 0; y < hole.sy; y++) {
      const half = 5 + Math.floor((y / hole.sy) * 6);
      for (let x = hole.x - half; x <= hole.x + half; x++) if ((x + y) % 2 === 0) P(x, y, c('env.glow'));
    }
    b.globalAlpha = 1;
  }
  return canvas;
}
