// 색 변환 (hex ↔ HSL). 색 값 자체는 client/data/palette.json에만 둔다.

export interface Hsl {
  /** 0~360 */
  h: number;
  /** 0~100 */
  s: number;
  /** 0~100 */
  l: number;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

export function isHex(value: unknown): value is string {
  return typeof value === 'string' && HEX.test(value);
}

export function hexToInt(hex: string): number {
  if (!isHex(hex)) throw new Error(`잘못된 hex 색: ${hex}`);
  return parseInt(hex.slice(1), 16);
}

export function hexToHsl(hex: string): Hsl {
  const n = hexToInt(hex);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s: s * 100, l: l * 100 };
}
