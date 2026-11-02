// 카드 티어 판 (hud.md 8장, 초안 데모 docs/drafts/card_tier.html B안): 카드 아래 가운데 작은 판에 3×5 도트 숫자 = 티어, 판 색 = 티어 색 (cards.json tiers color → palette.json global.ui.card).
// 티어 수가 늘어도 읽히도록 별 개수 대신 숫자. 강화(모서리 별)·꼬리표와 자리가 겹치지 않는다. 붓(Paint)만 받아 카드 창·카드 상점이 같이 쓴다
import type { Paint } from './cardFrame';
import { mix } from './shopPix';

const OUT = 'global.outline', FLASH = 'global.fx.flash', DARK = 'global.ui.skillTitle';

/** 도트 숫자 3×5 (줄 단위 15칸) */
const DIGITS: Record<string, string> = {
  '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111', '4': '101101111001001',
  '5': '111100111001111', '6': '111100111101111', '7': '111001001010010', '8': '111101111101111', '9': '111101111001111',
};

/** 티어 판: 카드 (x, y) 24×h 안 아래 가운데. col = 티어 색(palette 경로). 없는 카드는 그림자 판 */
export function tierPlate(R: Paint, x: number, y: number, h: number, tier: number, col: string, own: boolean): void {
  const s = String(tier), tw = s.length * 4 - 1, pw = Math.max(11, tw + 4), ph = 8;
  const px = x + Math.round((24 - pw) / 2), py = y + h - ph - 3;
  if (!own) { R(px, py, pw, ph, DARK); return; }
  const dk = mix(col, OUT, 0.55), lt = mix(col, FLASH, 0.5);
  R(px - 1, py - 1, pw + 2, ph + 2, OUT); R(px, py, pw, ph, dk); R(px + 1, py + 1, pw - 2, ph - 2, col); R(px + 1, py + 1, pw - 2, 1, lt);
  const tx = px + Math.round((pw - tw) / 2);
  [...s].forEach((ch, i) => {
    const bits = DIGITS[ch]!;
    for (let k = 0; k < 15; k++) if (bits[k] === '1') R(tx + i * 4 + (k % 3), py + 2 + Math.floor(k / 3), 1, 1, OUT);
  });
}
