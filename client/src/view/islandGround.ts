// 섬 바닥 (docs/art.md 6장 섬): 잔디 평지 → 모래사장 → 흙 절벽 단면 → 바다. 승인 데모의 바닥 그리기(GT)를 일반화
// 데모와 같은 값(폭 288, 잔디 110, 씨앗 3, 데모 길)을 넣으면 데모와 픽셀 단위로 같다 (islandGround.test.ts)
// 돌길(장식)은 데모 길 무늬를 칸 단위로 깐다: 이웃 돌길과 무늬가 이어지도록 월드 좌표로 계산
import { color } from '../palette';
import { ramp } from '../sprites/shade';

export interface GroundSpec {
  width: number;
  /** 잔디 높이 (px). 그 아래로 모래 8, 절벽 10, 물 12 */
  grassH: number;
  /** 흩뿌림 난수 씨앗 */
  seed: number;
  /** (x, y)가 길(돌길)인지 */
  path: (x: number, y: number) => boolean;
}

/** 모래·절벽·물 높이 (데모) */
export const SHORE = { sand: 8, cliff: 10, water: 12 } as const;
export const groundHeight = (grassH: number) => grassH + SHORE.sand + SHORE.cliff + SHORE.water;

/** 데모 기준 밀도: 288×108에 점 420개, 288×100에 풀 포기 55개 */
const DOTS = 420 / (288 * 108), TUFTS = 55 / (288 * 100);

/** 데모의 파크-밀러 난수 (같은 씨앗 → 같은 흩뿌림) */
function lcg(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

/**
 * 바닥을 plot(x, y, hex)로 찍는다. frame = 물 반짝임 프레임 (0·1, art.md 6장 "물 2프레임 반짝임 + 해안선 거품")
 * frame 0이 승인 데모와 같은 그림, 1은 반짝임·거품 위치만 옮긴 것
 */
export function paintGround(spec: GroundSpec, plot: (x: number, y: number, hex: string) => void, frame = 0): void {
  const r = (p: string) => ramp(color(`island.${p}`));
  const RG = r('grass'), RG2 = r('grassAlt'), RS = r('sand'), RPA = r('path'), RWA = r('water'), RFO = r('foliage'), RDIRT = r('dirt'), RST = r('stone');
  const W = spec.width, GH = spec.grassH, rnd = lcg(spec.seed);
  // 잔디: 16×10 두 색을 아주 옅게 번갈아
  for (let y = 0; y < GH; y++) for (let x = 0; x < W; x++) plot(x, y, (Math.floor(x / 16) + Math.floor(y / 10)) % 2 ? RG[1] : RG2[1]);
  // 밝은·어두운 점
  const dotsH = GH - 2, dots = Math.round(W * dotsH * DOTS);
  for (let k = 0; k < dots; k++) {
    const x = Math.floor(rnd() * W), y = Math.floor(rnd() * dotsH);
    plot(x, y, rnd() > 0.5 ? RG[0] : RG[2]);
  }
  // 풀 포기
  const tuftH = GH - 10, tufts = Math.round(W * tuftH * TUFTS);
  for (let k = 0; k < tufts; k++) {
    const x = Math.floor(rnd() * W), y = 4 + Math.floor(rnd() * tuftH);
    for (const [a, c] of [[0, 0], [0, -1], [2, 0], [2, -1], [2, -2], [4, 0]] as const) plot(x + a, y + c, c < -1 ? RG[0] : RFO[0]);
  }
  // 길: 흙길 색에 자갈 점
  for (let y = 0; y < GH; y++) {
    for (let x = 0; x < W; x++) {
      if (spec.path(x, y)) plot(x, y, (x * 3 + y * 7) % 11 === 0 ? RPA[2] : (x + y * 5) % 13 === 0 ? RPA[0] : RPA[1]);
    }
  }
  // 모래: 위 가장자리 한 줄 밝게
  const y0 = GH, y1 = y0 + SHORE.sand, y2 = y1 + SHORE.cliff, y3 = y2 + SHORE.water;
  for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) plot(x, y, y === y0 ? RS[0] : (x * 5 + y * 3) % 9 === 0 ? RS[2] : RS[1]);
  // 흙 절벽 단면: 위에서 아래로 어두워짐, 박힌 돌
  for (let y = y1; y < y2; y++) {
    for (let x = 0; x < W; x++) {
      const d = y - y1;
      let c = d < 3 ? RDIRT[1] : d < 7 ? RDIRT[2] : RDIRT[3];
      if (d === 0) c = RDIRT[0];
      if (x % 9 === 0 && d > 2) c = RST[2];
      plot(x, y, c);
    }
  }
  // 물: 반짝임 점 + 해안선 거품 (frame마다 위치를 옮김)
  const shift = frame % 2 ? 8 : 0;
  const sparkle = color('island.waterLight'), foam = color('island.foam');
  for (let y = y2; y < y3; y++) {
    for (let x = 0; x < W; x++) {
      let c = y - y2 < 3 ? RWA[0] : RWA[1];
      if ((x + y * 3 + shift) % 17 === 0) c = sparkle;
      if (y === y2 && (x + (frame % 2 ? 3 : 0)) % 7 < 3) c = foam;
      plot(x, y, c);
    }
  }
}
