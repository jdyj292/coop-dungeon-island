import { hexToInt, isHex, resolvePath } from '@game/shared';
import paletteData from '../data/palette.json';

/** palette.json 경로 → hex. 없거나 형식이 틀리면 바로 오류 */
export function color(path: string): string {
  const value = resolvePath(paletteData, path);
  if (!isHex(value)) throw new Error(`palette: '${path}'는 hex 색이 아님 (${String(value)})`);
  return value;
}

/** palette.json 경로 → Phaser용 정수 색 */
export function colorInt(path: string): number {
  return hexToInt(color(path));
}

/** 색이 아닌 값(불투명도 등) */
export function paletteNumber(path: string): number {
  const value = resolvePath(paletteData, path);
  if (typeof value !== 'number') throw new Error(`palette: '${path}'는 숫자가 아님`);
  return value;
}
