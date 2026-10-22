// 도트 글꼴 파일(.bin) 읽기·그리기 (docs/hud.md 7장). 갈무리 BDF 원본을 tools/font-gen이 변환한 것
// 브라우저 글꼴 렌더링은 가장자리를 반투명하게 섞어 도트가 깨지므로, 캔버스 글자는 비트맵 픽셀을 그대로 찍는다
//
// 형식 (little-endian): 'GLF1' · u8 ascent · u8 descent · u16 0 · u32 개수
//   글자표 개수 × 7바이트: u16 코드포인트(오름차순) · u8 진행 폭 · u8 w · u8 h · i8 xoff · i8 yoff (BDF BBX, yoff = 기준선 위로)
//   비트맵: 글자표 순서대로 ceil(w*h/8)바이트씩, 한 줄씩 이어 붙인 비트 (앞 비트 = 왼쪽 위)

export interface Glyph {
  dw: number;
  w: number;
  h: number;
  xoff: number;
  yoff: number;
  bits: Uint8Array;
}

export interface GlyphFont {
  ascent: number;
  descent: number;
  /** 한 줄 높이 = ascent + descent */
  lineHeight: number;
  glyphs: Map<number, Glyph>;
}

export const GLF_MAGIC = 'GLF1';
export const GLF_ENTRY = 7;

export function decodeGlyphFont(buf: ArrayBuffer): GlyphFont {
  const v = new DataView(buf);
  const magic = String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3));
  if (magic !== GLF_MAGIC) throw new Error(`glyphFont: 형식이 아님 (${magic})`);
  const ascent = v.getUint8(4), descent = v.getUint8(5), n = v.getUint32(8, true);
  const glyphs = new Map<number, Glyph>();
  let table = 12, data = 12 + n * GLF_ENTRY;
  for (let i = 0; i < n; i++, table += GLF_ENTRY) {
    const w = v.getUint8(table + 3), h = v.getUint8(table + 4), len = Math.ceil((w * h) / 8);
    glyphs.set(v.getUint16(table, true), {
      dw: v.getUint8(table + 2), w, h, xoff: v.getInt8(table + 5), yoff: v.getInt8(table + 6),
      bits: new Uint8Array(buf, data, len),
    });
    data += len;
  }
  return { ascent, descent, lineHeight: ascent + descent, glyphs };
}

/** 없는 글자는 '?'로 */
const glyphOf = (f: GlyphFont, ch: string): Glyph | undefined => f.glyphs.get(ch.codePointAt(0)!) ?? f.glyphs.get(0x3f);

/** 한 줄 폭 (px, 배율 1) */
export function measureText(f: GlyphFont, text: string): number {
  let w = 0;
  for (const ch of text) w += glyphOf(f, ch)?.dw ?? 0;
  return w;
}

/** 켜진 픽셀마다 plot(x, y). 원점 = 줄 상자 왼쪽 위 (기준선 y = ascent) */
export function paintText(f: GlyphFont, text: string, plot: (x: number, y: number) => void): void {
  let pen = 0;
  for (const ch of text) {
    const g = glyphOf(f, ch);
    if (!g) continue;
    const top = f.ascent - (g.yoff + g.h);
    for (let y = 0; y < g.h; y++) {
      for (let x = 0; x < g.w; x++) {
        const i = y * g.w + x;
        if (g.bits[i >> 3]! & (0x80 >> (i & 7))) plot(pen + g.xoff + x, top + y);
      }
    }
    pen += g.dw;
  }
}
