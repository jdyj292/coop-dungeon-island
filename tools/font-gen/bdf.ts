// BDF 비트맵 글꼴 → 게임 도트 글꼴(.bin, 형식은 client/src/ui/glyphFont.ts)
import { GLF_ENTRY, GLF_MAGIC } from '../../client/src/ui/glyphFont';

export interface BdfGlyph { cp: number; dw: number; w: number; h: number; xoff: number; yoff: number; rows: string[] }
export interface Bdf { ascent: number; descent: number; glyphs: BdfGlyph[] }

export function parseBdf(text: string): Bdf {
  const lines = text.split(/\r?\n/);
  let ascent = 0, descent = 0;
  const glyphs: BdfGlyph[] = [];
  let cur: Partial<BdfGlyph> & { rows?: string[] } | null = null, inBitmap = false;
  for (const line of lines) {
    const [key, ...rest] = line.trim().split(/\s+/);
    const nums = rest.map(Number);
    if (inBitmap) {
      if (key === 'ENDCHAR') {
        glyphs.push(cur as BdfGlyph);
        cur = null;
        inBitmap = false;
      } else cur!.rows!.push(key!);
      continue;
    }
    if (key === 'FONT_ASCENT') ascent = nums[0]!;
    else if (key === 'FONT_DESCENT') descent = nums[0]!;
    else if (key === 'STARTCHAR') cur = { rows: [] };
    else if (cur && key === 'ENCODING') cur.cp = nums[0]!;
    else if (cur && key === 'DWIDTH') cur.dw = nums[0]!;
    else if (cur && key === 'BBX') [cur.w, cur.h, cur.xoff, cur.yoff] = nums as [number, number, number, number];
    else if (cur && key === 'BITMAP') inBitmap = true;
  }
  return { ascent, descent, glyphs };
}

/** 넣을 글자 범위 (게임에서 쓰는 것만: 영문·숫자·기호, 한글 자모·음절, 문장 부호) */
export const RANGES: [number, number][] = [
  [0x20, 0x7e], [0xa0, 0xff], [0x2010, 0x2027], [0x2030, 0x203b], [0x2190, 0x2193], [0x2460, 0x2473],
  [0x25a0, 0x25ff], [0x2600, 0x266f], [0x3000, 0x3011], [0x3131, 0x318e], [0xac00, 0xd7a3], [0xff01, 0xff5e],
];
const inRanges = (cp: number) => RANGES.some(([a, b]) => cp >= a && cp <= b);

export function encodeGlyphFont(bdf: Bdf, keep: (cp: number) => boolean = inRanges): Uint8Array {
  const gs = bdf.glyphs.filter((g) => g.cp >= 0 && g.cp <= 0xffff && keep(g.cp)).sort((a, b) => a.cp - b.cp);
  const bitmaps = gs.map((g) => {
    const out = new Uint8Array(Math.ceil((g.w * g.h) / 8));
    for (let y = 0; y < g.h; y++) {
      const row = parseInt(g.rows[y] ?? '0', 16), rowBits = (g.rows[y]?.length ?? 0) * 4;
      for (let x = 0; x < g.w; x++) {
        if ((row >> (rowBits - 1 - x)) & 1) {
          const i = y * g.w + x;
          out[i >> 3]! |= 0x80 >> (i & 7);
        }
      }
    }
    return out;
  });
  const size = 12 + gs.length * GLF_ENTRY + bitmaps.reduce((s, b) => s + b.length, 0);
  const buf = new Uint8Array(size), v = new DataView(buf.buffer);
  for (let i = 0; i < 4; i++) buf[i] = GLF_MAGIC.charCodeAt(i);
  v.setUint8(4, bdf.ascent);
  v.setUint8(5, bdf.descent);
  v.setUint32(8, gs.length, true);
  let t = 12, d = 12 + gs.length * GLF_ENTRY;
  gs.forEach((g, i) => {
    v.setUint16(t, g.cp, true);
    v.setUint8(t + 2, g.dw);
    v.setUint8(t + 3, g.w);
    v.setUint8(t + 4, g.h);
    v.setInt8(t + 5, g.xoff);
    v.setInt8(t + 6, g.yoff);
    t += GLF_ENTRY;
    buf.set(bitmaps[i]!, d);
    d += bitmaps[i]!.length;
  });
  return buf;
}
