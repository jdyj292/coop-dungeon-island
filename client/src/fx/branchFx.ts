// 계열 스킬 근접 연출 (SK-2 2차, art.md 7장): 회전베기 = 몸을 도는 초승달 고리, 어깨 들이받기 = 몸 뒤 속도선 + 몸 앞 충격 괄호,
// 발도 = 출발 자리에서 벤 자리까지 한 줄 섬광. 색은 스미어와 같음 (흰 → 금 → 어두운 금). 어떤 그림인지는 fx.json branch.looks
import type { ActionDef } from '@game/shared';
import fx from '../../data/fx.json';
import { colorInt } from '../palette';
import { type Effect } from './layer';
import { clamp01, ellipseDots, hash, life, px } from './spellDraw';

const B = fx.branch;

/** 행동 id → 계열 스킬 그림 이름 (없으면 기존 연출) */
export const lookOf = (id: string): string | undefined => (B.looks as Record<string, string>)[id];

const tones = () => ['global.allyFx.white', 'global.allyFx.gold', 'global.fx.smearEdge'].map(colorInt) as [number, number, number];

type Foot = () => { sx: number; sy: number; facing: number };

/** 회전베기: 납작한 고리를 따라 초승달 arcs개가 돈다 (앞이 흰색, 꼬리로 갈수록 어두운 금). 몸 뒤 반은 몸 폭만큼 가려짐 */
export function whirl(foot: Foot, def: ActionDef): Effect {
  const W = B.whirl, [white, gold, edge] = tones(), sec = def.phases.active + W.tail;
  const r = (def.area?.radius ?? 24) * W.scale, suck = def.flags?.includes('pull');
  return {
    ...life(sec),
    draw(g, k) {
      const { sx, sy, facing } = foot(), e = (1 - k) * sec, cy = sy + W.y;
      const a = e > def.phases.active ? k * sec / W.tail : 1;
      const rot = e * W.spin * facing;
      // 바닥: 판정 반지름을 도는 점선 고리 (칼끝이 땅을 쓸고 지나간 자리)
      ellipseDots(g, sx, sy, r * 1.1, e * W.groundSpin * facing, edge, a * 0.8, W.groundEvery);
      for (let n = 0; n < W.arcs; n++) {
        const head = rot + (n / W.arcs) * Math.PI * 2;
        const steps = Math.round(r * W.span);
        for (let i = 0; i <= steps; i++) {
          const f = i / steps, q = head - f * W.span * facing, s = Math.sin(q);
          const x = sx + Math.cos(q) * r, y = cy + s * r * W.flat;
          if (s < 0 && Math.abs(x - sx) < W.body) continue;
          const thick = Math.max(1, Math.round(W.width * Math.sin(Math.PI * (1 - f) ** 0.7)));
          const c = f < 0.25 ? white : f < 0.65 ? gold : edge;
          for (let t = 0; t < thick; t++) px(g, x, y - t, c, a * (1.15 - f * 0.6));
        }
      }
      // 흡입: 바깥에서 몸 쪽으로 빨려드는 바람 줄 (줄마다 시작 시각이 다름)
      if (!suck) return;
      for (let i = 0; i < W.suckLines; i++) {
        const q = (i / W.suckLines) * Math.PI * 2 + hash(i) * 0.6, t = (e * 2.2 + hash(i + 3)) % 1;
        const d = r * (W.suckFrom - (W.suckFrom - 1) * t);
        for (let j = 0; j < 3; j++) {
          const dd = d + j * 2;
          px(g, sx + Math.cos(q) * dd, cy + Math.sin(q) * dd * W.flat, j ? edge : white, a * (1 - t) * (1 - j * 0.3));
        }
      }
    },
  };
}

/** 어깨 들이받기: 돌진하는 몸 뒤로 속도선(길이가 떨림), 몸 앞에 세로 충격 괄호. active가 끝나면 꼬리부터 사라짐 */
export function shoulder(foot: Foot, def: ActionDef): Effect {
  const S = B.shoulder, [white, gold, edge] = tones(), sec = def.phases.active + S.tail;
  return {
    ...life(sec),
    draw(g, k) {
      const { sx, sy, facing } = foot(), e = (1 - k) * sec, done = e > def.phases.active;
      const a = done ? (k * sec) / S.tail : 1, frame = Math.floor(e * 30);
      S.lines.forEach(([y, len], i) => {
        const l = Math.round(len! * (0.7 + 0.3 * hash(i + frame)) * (done ? a : 1));
        for (let d = 0; d < l; d++) px(g, sx + (S.back - d) * facing, sy + y!, d < 2 ? white : d < l * 0.6 ? gold : edge, a);
      });
      // 발밑 흙먼지 자국: 몸 뒤 바닥에 puffEvery px마다 (멀수록 어둡고 성김)
      const dustL = colorInt('global.fx.dustLight'), dustD = colorInt('global.fx.dustDark');
      for (let d = 4; d < 24; d += S.puffEvery) {
        const f = d / 24, j = Math.round(hash(d + frame) * 2) - 1;
        px(g, sx - d * facing, sy + j - 1, f < 0.5 ? dustL : dustD, a * (1 - f));
      }
      if (done) {
        // 멈춘 순간 몸 앞 충격파: 세로로 긴 타원이 퍼지며 바둑판으로 사라짐
        const t = clamp01((e - def.phases.active) / S.burstSec);
        if (t >= 1) return;
        const rr = 3 + S.burstR * t, cx = sx + S.front * facing, cy = sy + (S.top + S.bottom) / 2;
        for (let q = -Math.PI / 2; q <= Math.PI / 2; q += 0.18) {
          px(g, cx + Math.cos(q) * rr * 0.5 * facing, cy + Math.sin(q) * rr, t < 0.4 ? white : gold, 1 - t);
        }
        return;
      }
      // 괄호: 위아래 끝이 뒤로 휘는 2px 호 (안쪽 흰, 바깥 금)
      const h = S.bottom - S.top, mid = (S.top + S.bottom) / 2;
      for (let y = S.top; y <= S.bottom; y++) {
        const f = (y - mid) / (h / 2), bend = Math.round(f * f * 3);
        px(g, sx + (S.front - bend) * facing, sy + y, white);
        px(g, sx + (S.front - bend + 1) * facing, sy + y, Math.abs(f) > 0.7 ? edge : gold);
      }
    },
  };
}

/** 발도: 출발 자리(sx)에서 벤 끝까지 한 줄. thickSec 동안 3px 흰 줄 → 1px 금색 → 바둑판으로 사라짐, 줄 위아래 잔금 */
export function drawSlash(sx: number, sy: number, facing: number, def: ActionDef): Effect {
  const D = B.draw, [white, gold, edge] = tones();
  const width = def.hitbox?.width ?? 30, m = def.move, dist = m && 'distance' in m ? m.distance : 0;
  // 뒤로 빠지며 벨 때는 출발 자리 앞만, 앞으로 나갈 때는 지나간 길 + 판정 끝까지
  const len = dist > 0 ? dist + width / 2 : width, y = sy + D.y;
  return {
    ...life(D.sec),
    draw(g, k) {
      const e = (1 - k) * D.sec, thick = e < D.thickSec, a = clamp01(k * 1.6);
      for (let d = 0; d <= len; d++) {
        const x = sx + d * facing, f = d / len;
        if (thick) {
          px(g, x, y, white);
          if (f > 0.05 && f < 0.95) { px(g, x, y - 1, gold); px(g, x, y + 1, gold); }
          continue;
        }
        if (f < 1 - k * 1.3) continue;
        px(g, x, y, f > 0.85 ? white : gold, a);
      }
      // 잔금: 줄을 따라 비스듬한 2px 금
      for (let i = 1; i <= D.ticks; i++) {
        const x = sx + Math.round((len * i) / (D.ticks + 1)) * facing, up = i % 2 ? -1 : 1;
        px(g, x + facing, y + up * 2, edge, a);
        px(g, x + 2 * facing, y + up * 3, edge, a * 0.7);
      }
      // 늦게 터지는 베기 자국: 줄을 따라 cuts개의 짧은 대각선이 차례로 번쩍임 (흰 → 금 → 바둑판)
      for (let i = 0; i < D.cuts; i++) {
        const t = (e - D.cutDelay - i * 0.03) / D.cutSec;
        if (t < 0 || t >= 1) continue;
        const cx = sx + Math.round((len * (i + 1)) / (D.cuts + 1)) * facing, grow = Math.min(1, t * 4), n = Math.round(D.cutLen * grow);
        for (let j = -n; j <= n; j++) px(g, cx + Math.round(j * 0.6) * facing, y + j, Math.abs(j) < n * 0.5 && t < 0.5 ? white : gold, 1 - t);
      }
      if (e < D.thickSec * 3) {
        const ex = sx + len * facing;
        px(g, ex + facing, y, white); px(g, ex, y - 1, white); px(g, ex, y + 1, white);
      }
    },
  };
}

/**
 * 회오리 검기: 판정 원 자리(x, y = 바닥)에서 솟는 회오리. 아래가 좁고 위가 넓은 층 rings개 위를 초승달이 돌고,
 * 둘레 빛 점이 나선을 그리며 빨려 오른다. 마지막 fadeLast 비율은 바둑판으로 사라짐
 */
export function cyclone(x: number, y: number, radius: number, facing: number): Effect {
  const C = B.cyclone, [white, gold, edge] = tones();
  return {
    ...life(C.sec),
    draw(g, k) {
      const e = (1 - k) * C.sec, a = clamp01(k / C.fadeLast), rise = clamp01(e / 0.08);
      for (let i = 0; i < C.rings; i++) {
        const f = i / (C.rings - 1), r = radius * (C.bottom + (1 - C.bottom) * f), cy = y - C.height * f * rise;
        const head = e * C.spin * facing + i * 1.3, steps = Math.round(r * 2.2);
        for (let j = 0; j <= steps; j++) {
          const u = j / steps, q = head - u * 2.2 * facing;
          const c = u < 0.2 ? white : u < 0.6 ? gold : edge;
          px(g, x + Math.cos(q) * r, cy + Math.sin(q) * r * C.flat, c, a * (1.1 - u * 0.7));
        }
      }
      for (let i = 0; i < C.motes; i++) {
        const t = (e * 2.5 + hash(i)) % 1, q = e * C.spin * 0.7 * facing + (i / C.motes) * Math.PI * 2;
        const r = radius * (1.2 - t * 0.6);
        px(g, x + Math.cos(q) * r, y - C.height * t + Math.sin(q) * r * C.flat, t < 0.5 ? gold : white, a * (1 - t * 0.5));
      }
    },
  };
}
