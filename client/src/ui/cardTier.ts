// 카드 티어 띠 (hud.md 8장, 승인 데모 docs/refs/demos/card_tall.html): 카드 몸통 아래를 가로지르는 띠, 띠 색 = 티어 색 (cards.json tiers color → palette.json global.ui.card),
// 가운데 3×5 도트 숫자 = 티어, 강화면 숫자 뒤 "+". 아이콘 칸과 자리가 나뉘어 겹치지 않는다. 없는 카드는 그림자 줄 하나. 붓(Paint)만 받아 카드 창·카드 상점이 같이 쓴다
import type { Paint } from './cardFrame';
import { mix } from './shopPix';

const OUT = 'global.outline', FLASH = 'global.fx.flash', SHADE = 'global.ui.skillShade';

/** 작은 카드 띠 두께 (큰 카드는 13) */
export const BAND = 9;

/** 도트 숫자 3×5 (줄 단위 15칸) */
const DIGITS: Record<string, string> = {
  '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111', '4': '101101111001001',
  '5': '111100111001111', '6': '111100111101111', '7': '111001001010010', '8': '111101111101111', '9': '111101111001111',
  '+': '000010111010000',
};

/** 티어 띠 (x, y) w×h. col = 티어 색(palette 경로), sc = 숫자 배율 (큰 카드 2) */
export function tierBand(R: Paint, x: number, y: number, w: number, h: number, tier: number, col: string, own: boolean, enhanced: boolean, sc = 1): void {
  if (!own) { R(x, y, w, 1, SHADE); return; }
  R(x, y, w, h, mix(col, OUT, 0.55)); R(x, y + 1, w, h - 2, col); R(x, y + 1, w, 1, mix(col, FLASH, 0.5));
  const s = `${tier}${enhanced ? '+' : ''}`, tx = x + Math.round((w - (s.length * 4 - 1) * sc) / 2), ty = y + Math.round((h - 5 * sc) / 2);
  [...s].forEach((ch, i) => {
    const bits = DIGITS[ch]!;
    for (let k = 0; k < 15; k++) if (bits[k] === '1') R(tx + (i * 4 + (k % 3)) * sc, ty + Math.floor(k / 3) * sc, sc, sc, OUT);
  });
}
