// 중력 계열 스태프 연출 (art.md 7장): 중력 우물 = 가운데 어두운 핵으로 감겨 드는 나선 팔 + 오므라드는 점선 고리,
// 중력장 = 판정 원 둘레가 바깥에서 조여 들어와 자리 잡고, 안쪽에 ∨ 모양 누름 표시가 위에서 바닥으로 떨어짐.
// 반복 판정마다 하나씩 그려 겹쳐 이어진다 (우물 지속·붕괴도 그대로). 값 fx.json branch.well·gravfield
import { DEPTH_RATIO } from '@game/shared';
import fx from '../../data/fx.json';
import { dot, type Effect } from './layer';
import { clamp01, col, easeOut, ellipseDots, hash, life, px } from './spellDraw';

const B = fx.branch;

/** 중력 우물 한 번: arms개 나선 팔이 돌며 가운데로 감겨 듦(바깥 진한 하늘 → 안쪽 흰), 둘레 점선 고리가 오므라듦, 가운데 진한 핵 + 흰 테 */
export function gravityWell(x: number, y: number, r: number): Effect {
  const W = B.well, { sky, white, deep } = col();
  return {
    ...life(W.sec),
    draw(g, k) {
      const e = (1 - k) * W.sec, t = 1 - k, a = clamp01(Math.min(e / 0.05, k / 0.3));
      const rot = -e * W.spin;
      // 둘레 고리: 판정 반지름에서 안쪽으로 오므라들며 옅어짐 (반복 판정이 겹치면 계속 빨려드는 물결)
      ellipseDots(g, x, y, r * (1 - W.shrink * easeOut(t)), rot * 0.5, deep, a * (1 - t * 0.6), 3);
      // 나선 팔: 바깥(f=1)에서 안쪽(f=0)으로 각이 감김
      const steps = Math.round(r * 1.2);
      for (let n = 0; n < W.arms; n++) {
        const base = rot + (n / W.arms) * Math.PI * 2;
        for (let i = 0; i <= steps; i++) {
          const f = i / steps, d = r * (0.12 + 0.88 * f), q = base + (1 - f) * W.twist;
          const c = f < 0.3 ? white : f < 0.7 ? sky : deep;
          px(g, x + Math.cos(q) * d, y + Math.sin(q) * d * DEPTH_RATIO, c, a * (1.1 - f * 0.5));
        }
      }
      // 빨려드는 티끌: 둘레에서 가운데로 (티끌마다 시작이 다름)
      for (let i = 0; i < W.motes; i++) {
        const m = (e * W.pull + hash(i)) % 1, q = (i / W.motes) * Math.PI * 2 + rot * 1.5 + m * 2, d = r * (1 - m) + 2;
        px(g, x + Math.cos(q) * d, y + Math.sin(q) * d * DEPTH_RATIO - 1, m > 0.7 ? white : sky, a * (0.5 + m));
      }
      // 핵: 바닥 위 진한 덩어리 + 흰 테 1px (깜빡임 없이 크기만 숨쉼)
      const cr = W.core + (Math.sin(e * 14) > 0 ? 1 : 0), cy = y - 2;
      for (let dy = -cr; dy <= cr; dy++) for (let dx = -cr; dx <= cr; dx++) {
        const d = Math.hypot(dx, dy / DEPTH_RATIO * 0.8);
        if (d > cr) continue;
        px(g, x + dx, cy + dy, d > cr - 1 ? sky : deep, a);
      }
      dot(g, x - 1, cy - 1, white);
    },
  };
}

/** 중력장: closeSec 동안 둘레가 바깥(r × from)에서 조여 들어와 판정 원에 자리 잡고 점선으로 남음,
 *  안쪽 격자 자리마다 ∨ 누름 표시가 위에서 바닥으로 떨어져 납작해짐, 바닥에 옅은 바둑판 */
export function gravField(x: number, y: number, r: number): Effect {
  const G = B.gravfield, { sky, white, deep } = col();
  return {
    ...life(G.sec),
    draw(g, k) {
      const e = (1 - k) * G.sec, a = clamp01(k / G.fadeLast);
      const close = easeOut(clamp01(e / G.closeSec)), rr = r * (G.from - (G.from - 1) * close);
      ellipseDots(g, x, y, rr, e * G.spin, close < 1 ? white : sky, a, close < 1 ? 1 : 2);
      ellipseDots(g, x, y, rr * 0.92, -e * G.spin, deep, a * close, 3);
      if (close < 1) return;
      const t = (e - G.closeSec) / (G.sec - G.closeSec);
      // 바닥 바둑판 (옅게)
      for (let dy = -r * DEPTH_RATIO; dy <= r * DEPTH_RATIO; dy += 2) for (let dx = -r; dx <= r; dx += 4) {
        const ox = dx + ((Math.round(dy / 2) & 1) ? 2 : 0);
        if (Math.hypot(ox / r, dy / (r * DEPTH_RATIO)) > 0.85) continue;
        px(g, x + ox, y + dy, deep, a * 0.45);
      }
      // ∨ 누름 표시: 원 안 고정 자리에서 위로부터 떨어져 바닥에 닿으면 납작해짐 (자리마다 시차)
      for (let i = 0; i < G.marks; i++) {
        const q = hash(i) * Math.PI * 2, d = r * 0.75 * Math.sqrt(hash(i + 11));
        const mx = x + Math.cos(q) * d, my = y + Math.sin(q) * d * DEPTH_RATIO;
        const f = clamp01(t * 1.6 - hash(i + 4) * 0.6), landed = f >= 1, h = G.drop * (1 - easeOut(f));
        const tip = my - h, w = landed ? 3 : 2;
        // 꼭짓점이 아래인 ∨, 닿으면 팔이 1px 높이로 눌려 퍼짐
        for (let s = 0; s <= w; s++) {
          const sy = tip - (landed ? Math.min(s, 1) : s), c = s ? sky : white;
          px(g, mx - s, sy, c, a);
          px(g, mx + s, sy, c, a);
        }
      }
    },
  };
}
