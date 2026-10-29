// 얼음 장판 연출 (MVP 보충 ST-2a, art.md 7장): 가운데서 번지는 얼음, 마름모 결정, 차례로 켜지는 반짝임. 값 fx.json spell.iceField
// 동토(감속) 장판은 slowField: 얼음보다 옅고 오래 남는 서리 (값 spell.slowField)
import { DEPTH_RATIO } from '@game/shared';
import fx from '../../data/fx.json';
import { dot, type Effect } from './layer';
import { clamp01, col, easeOut, hash, life, px, star4 } from './spellDraw';

const S = fx.spell.iceField;
const SL = fx.spell.slowField;

/** 동토 장판 (w·d = 논리 px): 점선 하늘 테두리·모서리 흰 점, 안쪽 성긴 서리점, 눈송이가 천천히 내려앉으며 차례로 반짝임 */
export function slowField(x: number, y: number, w: number, d: number): Effect {
  const { sky, white, deep } = col(), hw = Math.round(w / 2), hd = Math.max(1, Math.round((d / 2) * DEPTH_RATIO));
  const flakes: [number, number][] = [];
  const gap = SL.flakeGap;
  for (let cy = -hd + 3, row = 0; cy <= hd - 1; cy += Math.max(3, Math.round(gap * DEPTH_RATIO)), row++) {
    for (let cx = -hw + 4 + (row % 2) * Math.round(gap / 2); cx <= hw - 4; cx += gap) {
      flakes.push([cx + Math.round((hash(cx * 3 + cy * 11) - 0.5) * 4), cy]);
    }
  }
  return {
    ...life(SL.sec),
    draw(g, k) {
      const e = (1 - k) * SL.sec, spread = easeOut(clamp01(e / SL.spreadSec)), a = Math.min(1, (k * SL.sec) / SL.fadeLast);
      const sw = Math.round(hw * spread), sd = Math.max(1, Math.round(hd * spread));
      for (let py = -sd; py <= sd; py++) for (let qx = -sw; qx <= sw; qx++) {
        const X = x + qx, Y = y + py, corner = Math.abs(py) === sd && Math.abs(qx) === sw;
        if (corner) px(g, X, Y, white, a);
        else if (Math.abs(py) === sd) { if ((qx & 3) < 2) px(g, X, Y, sky, a); }
        else if (Math.abs(qx) === sw) { if ((py & 1) === 0) px(g, X, Y, sky, a); }
        else if (((qx + 2 * py) & 7) === 0) dot(g, X, Y, deep, 1, 1, a * 0.45);
      }
      const twinkle = Math.floor(e / SL.twinkleSec) % Math.max(1, flakes.length);
      flakes.forEach(([cx, cy], i) => {
        // 눈송이: 위에서 fall px 내려앉음 (하나씩 시차)
        const fall = Math.round(SL.fall * (1 - clamp01(e / SL.sec + hash(i) * 0.5 - 0.25)));
        if (Math.abs(cx) > sw - 2 || Math.abs(cy) > sd) return;
        const X = x + cx, Y = y + cy - fall;
        if (i === twinkle && spread >= 1) star4(g, X, Y, 2, white, sky, a);
        else { px(g, X, Y, white, a); px(g, X - 1, Y, sky, a * 0.7); px(g, X + 1, Y, sky, a * 0.7); }
      });
    },
  };
}

/** 얼음 장판: 판정 사각형 (w·d = 논리 px). 테두리 하늘·안쪽 줄 진한 하늘, 옅은 체크무늬, 결정, 끝에 바둑판으로 사라짐 */
export function iceField(x: number, y: number, w: number, d: number): Effect {
  const { sky, white, deep } = col(), hw = Math.round(w / 2), hd = Math.max(1, Math.round((d / 2) * DEPTH_RATIO));
  const gap = S.crystalGap, crystals: [number, number][] = [];
  for (let cy = -hd + 2, row = 0; cy <= hd - 2; cy += Math.max(2, Math.round(gap * DEPTH_RATIO)), row++) {
    for (let cx = -hw + 3 + (row % 2) * Math.round(gap / 2); cx <= hw - 3; cx += gap) {
      crystals.push([cx + Math.round((hash(cx * 7 + cy) - 0.5) * 2), cy]);
    }
  }
  return {
    ...life(S.sec),
    draw(g, k) {
      const e = (1 - k) * S.sec, spread = easeOut(clamp01(e / S.spreadSec)), a = Math.min(1, (k * S.sec) / S.fadeLast);
      const sw = Math.round(hw * spread), sd = Math.max(1, Math.round(hd * spread));
      for (let py = -sd; py <= sd; py++) for (let qx = -sw; qx <= sw; qx++) {
        const X = x + qx, Y = y + py, edge = Math.abs(py) === sd || Math.abs(qx) === sw;
        if (edge) px(g, X, Y, Math.abs(py) === sd && Math.abs(qx) === sw ? white : sky, a);
        else if (Math.abs(py) === sd - 1 || Math.abs(qx) === sw - 1) px(g, X, Y, deep, a * 0.7);
        else if ((qx + py) % 2 === 0) dot(g, X, Y, sky, 1, 1, a * 0.35);
      }
      const glint = Math.floor(e / S.glintSec) % Math.max(1, crystals.length);
      crystals.forEach(([cx, cy], i) => {
        if (Math.abs(cx) > sw - 2 || Math.abs(cy) > sd - 1) return;
        const X = x + cx, Y = y + cy;
        if (i === glint && spread >= 1) { star4(g, X, Y, 2, white, sky, a); return; }
        px(g, X, Y, white, a);
        px(g, X - 1, Y, sky, a); px(g, X + 1, Y, sky, a);
        px(g, X, Y - 1, deep, a);
      });
    },
  };
}
