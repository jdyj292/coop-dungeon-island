// SK-7 계열 3단계 연출 (art.md 7장, 값 fx.json tier3): 파쇄참 = 떨어지는 칼빛 기둥 + 펼친 균열 + 충격파 + 돌 조각,
// 대지붕괴 = 판정 사각형의 깨진 땅(반복 동안 남음) + 반복마다 튀는 돌 조각, 솟구침 = 돌기둥이 솟았다 무너짐.
// 전장 장악 발밑 점선 고리는 statusFx.ts가 auraRing으로 그린다
import type Phaser from 'phaser';
import { DEPTH_RATIO } from '@game/shared';
import fx from '../../data/fx.json';
import { colorInt } from '../palette';
import { crack } from './groundImpact';
import { dot, type Effect } from './layer';
import { dust } from './particles';
import { clamp01, col, easeOut, ellipseDots, hash, life, px, shown, star4 } from './spellDraw';
import { quakeRing } from './tier2Fx';

const T = fx.tier3;
type G = Phaser.GameObjects.Graphics;
const stone = () => ({ dark: colorInt('global.outline'), mid: colorInt('global.fx.dustDark'), light: colorInt('global.fx.dustLight') });

/** 돌 조각 n개: (x, y)에서 튀어 올라 떨어짐 (2×2 밝은 면 + 1px 어두운 아래) */
export function rocks(x: number, y: number, n: number, spread = T.crush.rockSpread, rand = Math.random): Effect[] {
  const C = T.crush, { dark, mid, light } = stone();
  return Array.from({ length: n }, () => {
    let sx = x + (rand() - 0.5) * 6, sy = y, vx = (rand() - 0.5) * spread, vy = -(C.rockLift[0]! + rand() * (C.rockLift[1]! - C.rockLift[0]!));
    const big = rand() < 0.4;
    return {
      ...life(C.rockSec),
      update(dt) {
        sx += vx * dt;
        sy = Math.min(y + 2, sy + vy * dt);
        vy += C.gravity * dt;
      },
      draw(g, k) {
        const a = clamp01(k * 3);
        if (!shown(sx, sy, a)) return;
        dot(g, sx, sy, big ? light : mid, big ? 2 : 1, big ? 2 : 1);
        dot(g, sx, sy + (big ? 2 : 1), dark, big ? 2 : 1, 1);
      },
    };
  });
}

/** 칼빛 기둥: 하늘에서 내리꽂히는 세로 빛 (처음 thickSec는 3px 흰 심, 뒤로 1px 금 → 바둑판), 바닥에 큰 별 */
export function crushBeam(x: number, y: number): Effect {
  const C = T.crush, { white, gold } = col(), edge = colorInt('global.fx.smearEdge');
  return {
    ...life(C.beamSec),
    draw(g, k) {
      const e = (1 - k) * C.beamSec, thick = e < C.thickSec, a = clamp01(k * 1.8);
      const top = y - Math.round(C.height * (thick ? clamp01(e / C.thickSec) : 1));
      for (let yy = top; yy <= y; yy++) {
        const f = (y - yy) / C.height;
        if (thick) {
          px(g, x - 1, yy, gold);
          px(g, x, yy, white);
          px(g, x + 1, yy, gold);
        } else px(g, x, yy, f > 0.7 ? edge : f > 0.3 ? gold : white, a * (1.2 - f));
      }
      star4(g, x, y, thick ? 5 : Math.max(1, Math.round(4 * k)), white, gold, a);
    },
  };
}

/** 파쇄참 내려친 순간: 판정 앞쪽 칼빛 기둥 + 발 앞에서 펼친 균열 lines줄(판정 폭) + 충격파 2겹 + 돌 조각 + 먼지 */
export function crushImpact(sx: number, sy: number, facing: number, width: number): Effect[] {
  const C = T.crush, hx = sx + Math.round(width * C.at) * facing;
  const lines = Array.from({ length: C.lines }, (_, i) => ({
    rot: C.lines > 1 ? -C.spread + (2 * C.spread * i) / (C.lines - 1) : 0, length: Math.max(8, Math.round(width)), seed: 11 + i * 23,
  }));
  return [
    ...lines.map((l) => crack(sx, sy, facing, l)),
    crushBeam(hx, sy),
    quakeRing(hx, sy, width * 0.6),
    quakeRing(hx, sy, width * 0.35),
    ...rocks(hx, sy, C.rocks),
    ...dust(hx, sy, 6),
  ];
}

/** 깨진 땅 조각: 줄마다 어긋난 너비의 판석 (tile px 안팎), 조각마다 고정 난수로 꺼짐·기울기 */
function slabs(w: number, h: number): { x: number; y: number; w: number; h: number; sunk: boolean; tilt: number; r: number }[] {
  const C = T.collapse, out: { x: number; y: number; w: number; h: number; sunk: boolean; tilt: number; r: number }[] = [];
  const th = Math.max(3, Math.round(C.tile * DEPTH_RATIO));
  let row = 0;
  for (let y = -h / 2; y < h / 2; y += th, row++) {
    let x = -w / 2 - Math.round(hash(row * 17) * C.tile);
    for (let i = 0; x < w / 2; i++) {
      const r = hash(row * 31 + i * 7.3), sw = Math.round(C.tile * (0.8 + r * 0.9));
      out.push({ x: Math.round(x), y: Math.round(y), w: sw, h: th, sunk: r < C.sunk, tilt: r > 0.7 ? 1 : r < 0.15 ? -1 : 0, r });
      x += sw;
    }
  }
  return out;
}

/** 대지붕괴 장판: 판정 사각형(w × 깊이 d, 화면에서는 깊이 납작)이 가운데부터 깨진 흙 판석으로 무너져 sec 동안 남고 마지막 fadeLast는 바둑판으로 사라짐 (바닥 층).
 * 판석 = 흙 바탕(바둑판 반쯤) + 아래 그림자 줄, 꺼진 판석은 더 어둡게, 틈은 들쭉날쭉한 진한 금 */
export function collapseField(x: number, y: number, w: number, d: number, sec: number): Effect {
  const C = T.collapse, { dark, mid, light } = stone(), h = Math.round(d * DEPTH_RATIO), cells = slabs(w, h);
  return {
    ...life(sec),
    draw(g, k) {
      const e = (1 - k) * sec, open = clamp01(e / 0.12), a = clamp01(k / C.fadeLast);
      const inside = (xx: number, yy: number) => Math.abs(xx) <= w / 2 && Math.abs(yy) <= h / 2;
      for (const c of cells) {
        const far = Math.hypot((c.x + c.w / 2) / (w / 2), (c.y + c.h / 2) / (h / 2 || 1)) / 1.42;
        if (far > open) continue;
        for (let yy = 0; yy < c.h; yy++) {
          for (let xx = 0; xx < c.w; xx++) {
            const lx = c.x + xx, ly = c.y + yy - (c.tilt * xx) / c.w;
            if (!inside(lx, ly)) continue;
            const edgeTop = yy === 0, edgeLeft = xx === 0, bottom = yy === c.h - 1;
            const cx = x + lx, cy = y + Math.round(ly);
            // 틈: 위 줄은 들쭉날쭉(가끔 1px 아래로), 왼쪽 줄은 판석마다 다른 자리에서 끊김
            if (edgeTop && hash(lx * 1.7 + c.r * 50) > 0.12) px(g, cx, cy + (hash(lx + c.r * 9) > 0.8 ? 1 : 0), dark, a);
            else if (edgeLeft && yy !== Math.floor(c.r * c.h)) px(g, cx, cy, dark, a);
            else if (bottom) px(g, cx, cy, mid, a);
            else px(g, cx, cy, c.sunk ? dark : mid, a * (c.sunk ? 0.45 : 0.35));
          }
        }
        // 들린 판석 모서리 밝은 점
        if (!c.sunk && c.r > 0.55) px(g, x + c.x + 1, y + c.y + 1, light, a);
      }
    },
  };
}

/** 반복 판정 한 번: 판정 사각형 안 고정 난수 자리들에서 돌 조각이 튀고 먼지 (seed = 몇 번째 판정) */
export function collapsePulse(x: number, y: number, w: number, d: number, seed: number): Effect[] {
  const C = T.collapse, h = d * DEPTH_RATIO, out: Effect[] = [];
  for (let i = 0; i < C.pulseRocks; i++) {
    const rx = x + (hash(seed * 13 + i) - 0.5) * w, ry = y + (hash(seed * 29 + i + 5) - 0.5) * h;
    out.push(...rocks(rx, ry, 2, 30), ...dust(rx, ry, C.pulseDust));
  }
  return out;
}

/** 솟구침: 판정 사각형에 돌기둥 spikes개가 riseSec 동안 솟았다 남은 시간 동안 아래부터 무너짐 + 충격파 */
export function risePillars(x: number, y: number, w: number, d: number): Effect[] {
  const R = T.rise, { dark, mid, light } = stone(), h = d * DEPTH_RATIO;
  const spots = Array.from({ length: R.spikes }, (_, i) => ({
    x: Math.round(x + ((i + 0.5) / R.spikes - 0.5) * w + (hash(i * 5) - 0.5) * 6), y: Math.round(y + (hash(i * 9 + 1) - 0.5) * h), s: 0.6 + hash(i * 3) * 0.4,
  })).sort((a, b) => a.y - b.y);
  const pillars: Effect = {
    ...life(R.sec),
    draw(g: G, k) {
      const e = (1 - k) * R.sec, up = easeOut(clamp01(e / R.riseSec)), a = clamp01(k * 2.5);
      for (const s of spots) {
        const top = Math.round(R.height * s.s * up), half = R.width / 2;
        for (let yy = 0; yy < top; yy++) {
          const hw = Math.max(0, Math.round(half * (1 - yy / (top + 1)) + 0.4));
          for (let xx = -hw; xx <= hw; xx++) px(g, s.x + xx, s.y - yy, xx < 0 ? light : xx === hw ? dark : mid, a);
        }
        if (top > 2) dot(g, s.x, s.y - top, light);
      }
    },
  };
  const out: Effect[] = [pillars, quakeRing(x, y, w * 0.6)];
  for (const s of spots) out.push(...rocks(s.x, s.y, 1, 30));
  return out;
}

/** 전장 장악 발밑 고리: 밝은 점선 타원 + 둘레를 천천히 도는 금빛 점 (statusFx가 매 프레임 그림) */
export function auraRing(g: G, x: number, y: number, r: number, now: number): void {
  const A = T.aura, ring = colorInt('global.fx.ring'), { gold, white } = col();
  ellipseDots(g, x, y, r, now * 0.2, ring, A.alpha, A.every);
  for (let i = 0; i < A.motes; i++) {
    const q = now * A.spin + (i / A.motes) * Math.PI * 2, mx = x + Math.cos(q) * r, my = y + Math.sin(q) * r * DEPTH_RATIO;
    px(g, mx, my - 1, white);
    px(g, mx - 1, my - 1, gold);
    px(g, mx + 1, my - 1, gold);
  }
}
