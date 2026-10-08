// 자동 음영·외곽선 (docs/art.md 5장). 승인 데모(docs/refs/demos)의 ramp·shadeMask와 픽셀 단위로 같아야 한다
import { hexToInt } from '@game/shared';

/** 밝음 / 기본 / 그림자 / 가장 어두움 */
export type Ramp = [string, string, string, string];

function toHsl01(hex: string): [number, number, number] {
  const n = hexToInt(hex);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}

function fromHsl01(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const a = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return '#' + a.map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
}

/** 색상 h를 target 쪽으로 최대 deg만큼 돌림 */
const toward = (h: number, target: number, deg: number) => {
  const diff = ((target - h + 540) % 360) - 180;
  return h + Math.sign(diff) * Math.min(Math.abs(diff), deg);
};

export function ramp(hex: string): Ramp {
  const [h, s, l] = toHsl01(hex);
  return [
    fromHsl01(toward(h, 55, 10), s * 1.06, l + 0.11),
    hex,
    fromHsl01(toward(h, 255, 14), s * 0.95, l - 0.12),
    fromHsl01(toward(h, 265, 24), s * 0.9, l - 0.25),
  ];
}

export interface ShadeInput {
  rows: string[];
  /** 음영 재질 글자 → 램프 */
  shaded: Record<string, Ramp>;
  /** 고정색 글자 → 색 */
  fixed: Record<string, string>;
  /** 공통 외곽선색 (palette global.outline) */
  outline: string;
  /** 외곽선 전체를 이 색으로 (슈퍼아머 등) */
  outlineOverride?: string;
  /** 그림자 경계 디더링 (큰 스프라이트만) */
  dither?: boolean;
}

export interface Shaded {
  /** rows보다 사방 1px 큼 (외곽선) */
  width: number;
  height: number;
  /** 행 우선, 빈칸은 null */
  pixels: (string | null)[];
}

export function shade(input: ShadeInput): Shaded {
  const { rows, shaded: M, fixed: FX, outline: OL } = input;
  const h = rows.length;
  const w = Math.max(0, ...rows.map((r) => r.length));
  const width = w + 2, height = h + 2;
  const pixels: (string | null)[] = Array(width * height).fill(null);
  const get = (i: number, j: number) => rows[j]?.[i] ?? '.';
  const E = (ch: string) => ch === '.';
  const px = (i: number, j: number, col: string) => { pixels[(j + 1) * width + (i + 1)] = col; };

  for (const ch of new Set(rows.join(''))) {
    if (!E(ch) && !M[ch] && !FX[ch]) throw new Error(`색이 없는 재질 '${ch}'`);
  }

  // 세로로 이어진 같은 재질 안에서의 위치 (0 = 위, 1 = 아래)
  const pos: number[][] = Array.from({ length: h }, () => []);
  for (let i = 0; i < w; i++) {
    let j = 0;
    while (j < h) {
      const ch = get(i, j);
      if (E(ch)) { j++; continue; }
      let k = j;
      while (k < h && get(i, k) === ch) k++;
      for (let q = j; q < k; q++) pos[q]![i] = (q - j + 0.5) / (k - j);
      j = k;
    }
  }

  // 외곽선: 위·왼쪽은 재질의 가장 어두움, 아래·오른쪽은 공통 외곽선색
  const pick = (ch: string) => (FX[ch] ? OL : M[ch]![3]);
  for (let j = -1; j <= h; j++) {
    for (let i = -1; i <= w; i++) {
      if (!E(get(i, j))) continue;
      const dn = get(i, j + 1), rt = get(i + 1, j), up = get(i, j - 1), lf = get(i - 1, j);
      let col: string | null = null;
      if (!E(dn)) col = pick(dn);
      else if (!E(rt)) col = pick(rt);
      else if (!E(up)) col = OL;
      else if (!E(lf)) col = OL;
      if (col) px(i, j, input.outlineOverride ?? col);
    }
  }

  // 채우기: 0 밝음, 1 기본, 2 그림자
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const ch = get(i, j);
      if (E(ch)) continue;
      const fixed = FX[ch];
      if (fixed) { px(i, j, fixed); continue; }
      const r = M[ch]!;
      const up = get(i, j - 1), lf = get(i - 1, j), dn = get(i, j + 1), rt = get(i + 1, j);
      const p = pos[j]![i]!;
      let t = 1;
      if (p > 0.72) t = 2;
      else if (input.dither && p > 0.58 && (i + j) % 2) t = 2;
      if (!E(up) && up !== ch && M[up]) t = 2;
      if (E(up) || (E(lf) && p < 0.45)) t = 0;
      if (E(dn) || (E(rt) && p > 0.35)) t = Math.max(t, 2);
      if (E(up) && E(dn)) t = 1;
      px(i, j, r[t]!);
    }
  }
  return { width, height, pixels };
}
