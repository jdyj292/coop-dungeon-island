// 계열 스킬 스태프 연출 (SK-2 2차, art.md 7장): 불꽃 기둥 = 솟아 일렁이는 불기둥, 부유 구슬 = 공중 큰 구슬 + 감싸는 고리,
// 끌어올림 = 둘레 점이 가운데로 빨려든 뒤 빛 점이 솟음. 반복 판정마다 하나씩 그려 겹쳐 이어진다 (행진·쌍기둥·유도·이중도 그대로)
import { DEPTH_RATIO } from '@game/shared';
import fx from '../../data/fx.json';
import { dot, type Effect } from './layer';
import { clamp01, col, easeOut, ellipseDots, hash, life, orb, px } from './spellDraw';

const B = fx.branch;

/** 나타나고(앞 inSec) 사라짐(남은 비율 fadeLast 아래) 진하기 */
const fade = (k: number, total: number, inSec: number, fadeLast: number) => clamp01(Math.min(((1 - k) * total) / inSec, k / fadeLast));

/** 불기둥 한 번: 바닥 타원 불빛 위로 riseSec 동안 솟는 기둥. 위로 갈수록 가늘고 좌우로 일렁임, 속 흰 → 금 → 주황빛 금, 위로 불씨 */
export function firePillar(x: number, y: number, r: number): Effect {
  const P = B.pillar, { gold, white, amber } = col(), half = Math.max(2, r * P.width);
  return {
    ...life(P.sec),
    draw(g, k) {
      const e = (1 - k) * P.sec, a = fade(k, P.sec, 0.02, P.fadeLast), h = P.height * easeOut(clamp01(e / P.riseSec));
      ellipseDots(g, x, y, half + 2, e * 3, amber, a, 2);
      for (let dy = 0; dy <= h; dy++) {
        const f = dy / P.height, w = half * (1 - f ** 1.5 * 0.7);
        const sway = Math.sin(dy * 0.45 - e * P.flicker) * (1 + f * 1.5);
        for (let dx = -Math.ceil(w); dx <= Math.ceil(w); dx++) {
          const n = Math.abs(dx) / w;
          if (n > 1) continue;
          px(g, x + dx + sway, y - dy, n < 0.35 && f < 0.75 ? white : n < 0.75 ? gold : amber, a * (f > 0.8 ? (1 - f) * 5 : 1));
        }
      }
      // 꼭대기 위로 떨어져 나가는 불꽃·불씨
      for (let i = 0; i < P.embers; i++) {
        const t = (e * 2.5 + hash(i)) % 1, ex = x + (hash(i + 7) - 0.5) * half * 2 + Math.sin(t * 8 + i);
        px(g, ex, y - h - t * 10, i % 2 ? gold : amber, a * (1 - t));
      }
    },
  };
}

/** 부유 구슬 한 번: 공중 z 높이 큰 3단 구슬(위아래로 떠다님), 둘레를 도는 납작한 고리 2겹, 바닥 그림자 고리와 이어지는 점선 */
export function floatOrb(x: number, y: number, r: number): Effect {
  const O = B.orb, { sky, white, deep } = col(), ro = Math.max(3, Math.round(r * O.size)), ring = r * O.ring;
  return {
    ...life(O.sec),
    draw(g, k) {
      const e = (1 - k) * O.sec, a = fade(k, O.sec, 0.06, 0.3);
      const cy = y - O.z + Math.round(Math.sin(e * 6) * O.bob), rot = e * O.spin;
      ellipseDots(g, x, y, r, -rot * 0.5, deep, a * 0.8, 3);
      for (let d = ro + 2; d < O.z - 2; d += 3) px(g, x, cy + d, deep, a * 0.6);
      ellipseDots(g, x, cy, ring, rot, sky, a, 2);
      ellipseDots(g, x, cy, ring * 0.7, -rot, deep, a, 3);
      orb(g, x, cy, ro, a);
      // 고리를 따라 도는 흰 반짝임 (앞쪽 = 아래 반일 때만 구슬 앞에)
      const q = rot * 1.5, gx = x + Math.cos(q) * ring, gy = cy + Math.sin(q) * ring * DEPTH_RATIO;
      if (Math.sin(q) > 0 || Math.abs(gx - x) > ro) dot(g, gx, gy, white);
    },
  };
}

/** 끌어올림: 둘레 motes개 점이 pullSec 동안 가운데로 빨려들고(꼬리 2px), 그 뒤 가운데서 빛 점이 솟고 바닥 고리가 퍼짐 */
export function liftUp(x: number, y: number, r: number): Effect {
  const L = B.lift, { sky, white, deep } = col();
  return {
    ...life(L.sec),
    draw(g, k) {
      const e = (1 - k) * L.sec, a = clamp01(k / 0.3);
      if (e < L.pullSec) {
        const t = easeOut(e / L.pullSec);
        for (let i = 0; i < L.motes; i++) {
          const q = (i / L.motes) * Math.PI * 2 + hash(i) * 0.4, d = r * (1 - t) + 1;
          const mx = x + Math.cos(q) * d, my = y + Math.sin(q) * d * DEPTH_RATIO;
          px(g, mx, my, i % 2 ? sky : white);
          px(g, mx + Math.cos(q) * 2, my + Math.sin(q) * 2 * DEPTH_RATIO, deep, 0.7);
        }
        ellipseDots(g, x, y, r * (1 - t * 0.7), 0, deep, 1 - t, 3);
        return;
      }
      const t = clamp01((e - L.pullSec) / (L.sec - L.pullSec));
      ellipseDots(g, x, y, 3 + r * 0.5 * easeOut(t), 0, sky, a, 2);
      for (let i = 0; i < L.risers; i++) {
        const lt = clamp01(t * 1.3 - hash(i + 2) * 0.3), ox = (hash(i) - 0.5) * r * 0.6;
        if (lt <= 0) continue;
        const ry = y - L.rise * easeOut(lt);
        px(g, x + ox, ry, white, a);
        px(g, x + ox, ry + 1, sky, a);
        px(g, x + ox, ry + 2, deep, a * 0.6);
      }
      // 솟구치는 화살 모양 (^) 하나
      const cy = y - 6 - L.rise * 0.6 * easeOut(t);
      for (let d = 0; d <= 3; d++) { px(g, x - d, cy + d, sky, a); px(g, x + d, cy + d, sky, a); }
      dot(g, x, cy, white);
    },
  };
}
