import { describe, expect, it } from 'vitest';
import { decodeGlyphFont, measureText, paintText } from '../../client/src/ui/glyphFont';
import { encodeGlyphFont, parseBdf } from './bdf';

// 3×3 'A'(가운데 비트 + 테두리)와 폭 10짜리 2줄 '가' (BDF 줄은 바이트 단위로 채움)
const BDF = `STARTFONT 2.1
FONT_ASCENT 4
FONT_DESCENT 1
CHARS 2
STARTCHAR U+0041
ENCODING 65
DWIDTH 4 0
BBX 3 3 0 1
BITMAP
E0
A0
E0
ENDCHAR
STARTCHAR U+AC00
ENCODING 44032
DWIDTH 11 0
BBX 10 2 1 -1
BITMAP
8040
FFC0
ENDCHAR
ENDFONT
`;

describe('font-gen', () => {
  it('BDF → .bin → 읽기가 원래 픽셀과 같다', () => {
    const bin = encodeGlyphFont(parseBdf(BDF), () => true);
    const f = decodeGlyphFont(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer);
    expect(f.lineHeight).toBe(5);
    expect(measureText(f, 'A가')).toBe(15);
    const grid = Array.from({ length: 5 }, () => Array<string>(15).fill('.'));
    paintText(f, 'A가', (x, y) => { grid[y]![x] = '#'; });
    // A: 위쪽 = ascent 4 - (yoff 1 + h 3) = 0. 가: 펜 4 + xoff 1 = 5에서, 위쪽 = 4 - (-1 + 2) = 3
    expect(grid.map((r) => r.join(''))).toEqual([
      '###............',
      '#.#............',
      '###............',
      '.....#........#',
      '.....##########',
    ]);
  });

  it('없는 글자는 ? 로, 없으면 건너뜀', () => {
    const bin = encodeGlyphFont(parseBdf(BDF), () => true);
    const f = decodeGlyphFont(bin.buffer as ArrayBuffer);
    expect(measureText(f, 'Z')).toBe(0);
  });
});
