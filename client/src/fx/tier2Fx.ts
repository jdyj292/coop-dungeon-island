// SK-4 2차 새 판정 순간 연출 (art.md 7장): 예약 판정 사건의 look으로 고른다 (shared sim/skillExtras.ts EchoLook).
// 번개 연쇄 = 앞 대상에서 이번 대상까지 꺾인 번개 줄, 검흔 터짐 = 엇갈린 두 베기, 꽂기 = 꽂힌 대검 + 둘레 베기 호,
// 여진 = 땅 충격파 고리, 구슬 확장 끝 = 부푼 구슬이 터지며 고리. 화염구 끝 폭발(blast)은 기존 화염 폭발 + 흔들림 (spellCast)
import { DEPTH_RATIO } from '@game/shared';
import fx from '../../data/fx.json';
import { colorInt } from '../palette';
import { dot, type Effect } from './layer';
import { clamp01, col, easeOut, ellipseDots, hash, life, orb, px, star4 } from './spellDraw';

const T = fx.tier2;
const gold3 = () => ({ ...col(), edge: colorInt('global.fx.smearEdge') });

/** 화면 두 점 사이 1px 줄 */
function line(g: Parameters<Effect['draw']>[0], x0: number, y0: number, x1: number, y1: number, color: number, a = 1): void {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  for (let i = 0; i <= n; i++) px(g, x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, color, a);
}

/** 번개 줄: 마디마다 좌우로 꺾이고 reflash초마다 다시 꺾임. 흰 심 + 하늘 테두리, 끝에 별. (x0, y0) → (x1, y1) = 발밑 화면 좌표 */
export function chainBolt(x0: number, y0: number, x1: number, y1: number): Effect {
  const C = T.chain, { sky, white, deep } = col();
  return {
    ...life(C.sec),
    draw(g, k) {
      const e = (1 - k) * C.sec, seed = Math.floor(e / C.reflash), a = clamp01(k * 2.5);
      const pts: [number, number][] = [];
      for (let i = 0; i <= C.segs; i++) {
        const f = i / C.segs, j = i === 0 || i === C.segs ? 0 : (hash(i * 13 + seed) - 0.5) * 2 * C.jag;
        pts.push([x0 + (x1 - x0) * f, y0 + C.y + (y1 - y0) * f + j]);
      }
      for (let i = 0; i < C.segs; i++) {
        const [ax, ay] = pts[i]!, [bx, by] = pts[i + 1]!;
        line(g, ax, ay - 1, bx, by - 1, deep, a * 0.7);
        line(g, ax, ay + 1, bx, by + 1, sky, a * 0.8);
        line(g, ax, ay, bx, by, white, a);
      }
      star4(g, x1, y1 + C.y, e < C.sec * 0.4 ? 3 : 2, white, sky, a);
    },
  };
}

/** 검흔 터짐: 엇갈린 두 대각선 베기가 growSec 동안 뻗고 흰 → 금 → 어두운 금 바둑판으로 사라짐 */
export function scarBurst(x: number, y: number): Effect {
  const S = T.scar, { white, gold, edge } = gold3();
  return {
    ...life(S.sec),
    draw(g, k) {
      const e = (1 - k) * S.sec, grow = easeOut(clamp01(e / S.growSec)), cy = y + S.y, a = clamp01(k * 1.8);
      const len = Math.round(S.len * grow);
      for (const s of [1, -1]) {
        for (let d = -len; d <= len; d++) {
          const f = Math.abs(d) / S.len, c = e < S.growSec * 2 ? white : f < 0.5 ? gold : edge;
          px(g, x + d, cy + d * s * 0.8, c, a);
          if (f < 0.6) px(g, x + d + 1, cy + d * s * 0.8, gold, a * 0.8);
        }
      }
      if (e < S.growSec * 2) star4(g, x, cy, 3, white, gold);
    },
  };
}

/** 꽂기 한 번: 끝 자리에 꽂힌 대검 + 둘레를 빠르게 도는 납작한 베기 호 (반복 판정마다 하나, 겹쳐서 이어짐) */
export function stickSlash(x: number, y: number, r: number, facing: number): Effect {
  const S = T.stick, { white, gold, edge } = gold3(), rr = r * S.ring;
  return {
    ...life(S.sec),
    draw(g, k) {
      const e = (1 - k) * S.sec, head = (e / S.sec) * Math.PI * 2 * facing, a = clamp01(k * 2);
      // 꽂힌 대검: 땅에서 날(흰 심 + 금 옆줄)이 솟고 위에 날밑(5px)·손잡이(3px, 어두운 금)
      for (let d = 0; d < S.blade; d++) {
        px(g, x, y - d, d < 2 ? edge : white);
        px(g, x + facing, y - d, gold);
      }
      dot(g, x - 2, y - S.blade, edge, 6, 1);
      for (let d = 1; d <= 3; d++) px(g, x, y - S.blade - d, edge);
      const steps = Math.round(rr * S.span);
      for (let i = 0; i <= steps; i++) {
        const f = i / steps, q = head - f * S.span * facing;
        px(g, x + Math.cos(q) * rr, y - 4 + Math.sin(q) * rr * DEPTH_RATIO, f < 0.2 ? white : f < 0.6 ? gold : edge, a * (1.1 - f));
      }
    },
  };
}

/** 여진: 땅을 따라 판정 반지름까지 퍼지는 충격파 고리 2겹 (앞 고리 밝은 먼지색, 뒤 고리 어두운 먼지색) */
export function quakeRing(x: number, y: number, r: number): Effect {
  const Q = T.quake, light = colorInt('global.fx.ring'), dark = colorInt('global.fx.dustDark');
  return {
    ...life(Q.sec),
    draw(g, k) {
      const t = easeOut(1 - k), a = clamp01(k * 1.5);
      ellipseDots(g, x, y, 3 + (r - 3) * t, 0, light, a);
      if (t > 0.25) ellipseDots(g, x, y, 3 + (r - 3) * (t - 0.25), 0, dark, a * 0.8, 2);
    },
  };
}

/** 구슬 확장 끝 폭발: 공중 구슬이 부풀었다 터지며 바닥·공중 고리가 판정 반지름까지 퍼지고 별 */
export function orbBurst(x: number, y: number, r: number): Effect {
  const O = T.orbEnd, { sky, white, deep } = col();
  return {
    ...life(O.sec),
    draw(g, k) {
      const t = 1 - k, cy = y - O.z, a = clamp01(k * 1.6);
      if (t < 0.25) {
        orb(g, x, cy, Math.round(3 + t * 12));
        return;
      }
      const s = easeOut((t - 0.25) / 0.75);
      for (let i = 0; i < O.rings; i++) {
        const rr = r * Math.max(0, s - i * 0.2);
        if (rr > 1) ellipseDots(g, x, y, rr, 0, i ? deep : sky, a, i + 1);
      }
      ellipseDots(g, x, cy, r * 0.6 * s, s * 3, sky, a, 2);
      star4(g, x, cy, Math.round(4 * (1 - s)) + 1, white, sky, a);
    },
  };
}

/** 작은 불티 n개: 위로 튀어 오르며 흰 → 금 → 주황빛 금 (화염구 관통·분열 조각이 사라질 때) */
export function fireSparks(x: number, y: number, n: number): Effect[] {
  const { white, gold, amber } = col();
  return Array.from({ length: n }, (_, i) => {
    const vx = (hash(i + x) - 0.5) * 60, vy = -30 - hash(i + y) * 30;
    let sx = x, sy = y, v = vy;
    return {
      ...life(0.3),
      update(dt) {
        sx += vx * dt;
        sy += v * dt;
        v += 160 * dt;
      },
      draw(g, k) {
        px(g, sx, sy, k > 0.66 ? white : k > 0.33 ? gold : amber, clamp01(k * 2));
      },
    };
  });
}
