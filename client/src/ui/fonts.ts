// 한글 도트 글꼴 갈무리 (docs/hud.md 7장): 시작할 때 한 번 불러온다
// - 캔버스 글자: 갈무리 BDF를 변환한 비트맵(.bin, tools/font-gen)을 픽셀 그대로 찍음 (koText.ts)
// - DOM 폼: 같은 글꼴의 woff2 (입력창은 브라우저 글꼴 렌더링이 필요). 크기는 고유 크기 × 정수 배율
import { decodeGlyphFont, type GlyphFont } from './glyphFont';

export const FONTS = {
  /** 큰 표시만 (티어 3 카드 이름 띠, 고유 크기 12px: 위 11 + 아래 1). DOM 입력창도 이 글꼴 */
  ko: { family: 'Galmuri9', bin: 'Galmuri9.bin', px: 12 },
  /** 화면 글자 기본: 패널·알림·이름표·도움말·카드 창 (고유 크기 10px: 위 9 + 아래 1, 현대 한글 11,172자 모두, 옛 자모·일부 기호 없음 → '?') */
  koSmall: { family: 'Galmuri7', bin: 'Galmuri7.bin', px: 10 },
} as const;
export type FontKey = keyof typeof FONTS;
/** 글꼴을 따로 고르지 않은 캔버스 글자 */
export const DEFAULT_FONT: FontKey = 'koSmall';

/** DOM용 woff2 (Galmuri9만) */
const DOM_FONT = { family: FONTS.ko.family, file: 'Galmuri9.woff2' };

const loaded = new Map<FontKey, GlyphFont>();
let loading: Promise<void> | null = null;
const url = (file: string) => `${import.meta.env.BASE_URL}fonts/${file}`;

/** 글꼴 모두 받기 (Boot에서 기다림). 실패하면 경고만: 캔버스 글자는 빈칸, DOM은 기본 글꼴 */
export function loadFonts(): Promise<void> {
  loading ??= Promise.all([
    ...(Object.keys(FONTS) as FontKey[]).map(async (k) => {
      const res = await fetch(url(FONTS[k].bin));
      if (!res.ok) throw new Error(`${FONTS[k].bin} ${res.status}`);
      loaded.set(k, decodeGlyphFont(await res.arrayBuffer()));
    }),
    (async () => {
      const face = new FontFace(DOM_FONT.family, `url(${url(DOM_FONT.file)}) format('woff2')`);
      // FontFaceSet.add는 lib.dom.iterable에만 선언됨
      (document.fonts as unknown as Set<FontFace>).add(await face.load());
    })(),
  ]).then(() => undefined, (e) => console.warn('[fonts] 갈무리 글꼴을 불러오지 못함', e));
  return loading;
}

/** 불러온 비트맵 글꼴 (loadFonts 전이면 null) */
export const glyphFont = (key: FontKey): GlyphFont | null => loaded.get(key) ?? null;
