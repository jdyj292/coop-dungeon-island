// 화염 폭발 연출 (MVP 보충 ST-2a, art.md 7장): 준비 동안 바닥 표적 → 섬광·불덩이·바닥 고리·불씨. 값 fx.json spell.target·burst
import { DEPTH_RATIO } from '@game/shared';
import fx from '../../data/fx.json';
import { ellipse } from './hazards';
import { dot, type Effect } from './layer';
import { sparks } from './particles';
import { clamp01, col, easeOut, ellipseDots, hash, life, px } from './spellDraw';

const S = fx.spell;

/** 원형 마법 표적: 점선 원이 천천히 돌고 안쪽이 차오름, 터지기 직전 테두리가 이어짐 (적 예고와 같은 모양, 색만 아군).
 *  tone fire = 금 → 주황빛 금(화염), magic = 하늘 → 진한 하늘(불 아닌 원형 마법: 부유 구슬·끌어올림·중력 우물·중력장) */
export function fireTarget(x: number, y: number, r: number, sec: number, tone: 'fire' | 'magic' = 'fire'): Effect {
  const c = col(), T = S.target, [gold, amber] = tone === 'fire' ? [c.gold, c.amber] : [c.sky, c.deep];
  return {
    ...life(sec),
    draw(g, k) {
      const t = 1 - k, shift = T.spin * t * sec, locked = t >= T.lockAt;
      ellipse(x, y, r, (px0, py0, edge) => {
        if (edge) {
          const s = Math.atan2((py0 - y) / DEPTH_RATIO, px0 - x) * r + shift;
          if (locked || Math.floor(s / T.dash) % 2 === 0) dot(g, px0, py0, gold);
          return;
        }
        const n = Math.hypot((px0 - x) / r, (py0 - y) / (r * DEPTH_RATIO));
        if (n <= t && (px0 + py0) % 4 === 0) dot(g, px0, py0, n > t - 0.15 ? gold : amber, 1, 1, 0.6);
      });
      dot(g, x, y, gold);
    },
  };
}

/** 화염 폭발: 흰 섬광 → 왼쪽 위가 밝은 금색 불덩이(바깥 주황빛)가 커지며 속부터 비고 바둑판으로 흩어짐 + 바닥 고리 + 불씨 */
export function fireBurst(x: number, y: number, r: number): Effect[] {
  const { gold, white, amber } = col(), B = S.burst;
  const burst: Effect = {
    ...life(B.sec),
    draw(g, k) {
      const t = 1 - k, e = t * B.sec;
      if (e < B.flashSec) {
        const fr = Math.round(r * 0.45), cy = y - fr * DEPTH_RATIO;
        ellipse(x, cy, fr, (px0, py0, edge) => dot(g, px0, py0, edge ? gold : white));
        return;
      }
      const rr = Math.max(2, Math.round(r * (0.45 + 0.55 * easeOut(t)))), cy = y - rr * DEPTH_RATIO;
      const a = t < 0.45 ? 1 : 1 - (t - 0.45) / 0.55, hollow = (t - 0.5) * 2;
      ellipse(x, cy, rr, (px0, py0, edge) => {
        const n = Math.hypot((px0 - x + 1) / rr, (py0 - cy + 1) / (rr * DEPTH_RATIO));
        if (n < hollow) return;
        px(g, px0, py0, edge || n > 0.8 ? amber : n < 0.45 ? white : gold, a);
      });
      ellipseDots(g, x, y, r * (0.6 + 0.5 * easeOut(t)), 0, amber, 1 - t, 2);
    },
  };
  const embers: Effect[] = Array.from({ length: B.embers }, (_, i) => {
    const ox = (hash(i) - 0.5) * r, delay = hash(i + 5) * 0.3;
    return {
      ...life(B.sec * 1.4),
      draw(g, k) {
        const t = clamp01((1 - k) * 1.3 - delay);
        if (t <= 0) return;
        const ex = x + ox + Math.sin(t * 6 + i) * 1.5, ey = y - 6 - B.emberRise * t;
        px(g, ex, ey, Math.floor(t * 10 + i) % 2 ? gold : amber, 1.2 - t);
      },
    };
  });
  return [burst, ...embers, ...sparks(x, y - 6).slice(0, B.sparks)];
}
