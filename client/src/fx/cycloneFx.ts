// 회오리 검기 연출 (art.md 7장, 2026-11 다시 그림): 반복 판정 내내 하나로 이어지는 파란 회오리.
// 판정 원 자리에서 솟아 판정처럼 앞으로 나아가며(step/interval), 바닥 바람 고리 + 바깥에서 빨려드는 바람 줄(끌어당김) +
// 아래 좁고 위 넓은 깔때기(층마다 초승달 2개, 뒤 반은 어둡게) + 나선으로 오르는 바람 줄 + 빨려 오르는 티끌 + 꼭대기 흩날림.
// 색은 마법 파랑 (흰 심 → 하늘 → 진한 하늘). 반복 판정마다는 그리지 않는다 (spellCast)
import type { ActionDef } from '@game/shared';
import { DEPTH_RATIO } from '@game/shared';
import fx from '../../data/fx.json';
import { colorInt } from '../palette';
import { type Effect } from './layer';
import { clamp01, col, ellipseDots, hash, life, px } from './spellDraw';

const C = fx.branch.cyclone;

/** 회오리 하나: x, y = 판정 원 바닥 가운데(화면), radius = 판정 반지름, def.repeat로 이어지는 시간·나아가는 속도 */
export function cyclone(x: number, y: number, radius: number, facing: number, def: ActionDef): Effect {
  const rep = def.repeat, run = rep ? (rep.count - 1) * rep.interval : 0;
  const speed = rep?.step ? (rep.step / rep.interval) * facing : 0, sec = run + C.tail;
  const { white, sky, deep } = col(), dust = colorInt('global.fx.dustLight');
  const H = radius * C.heightMul, r0 = radius * C.bottom;
  return {
    ...life(sec),
    draw(g, k) {
      const e = (1 - k) * sec, cx = x + speed * Math.min(e, run);
      const grow = clamp01(e / C.growSec), a = e > run ? clamp01((sec - e) / C.tail) : 1;
      const lean = speed ? -facing * C.lean : 0, spin = e * C.spin * facing;
      // 층 f(0 = 바닥 ~ 1 = 꼭대기)의 가운데·반지름: 위로 갈수록 넓어지고 흔들리며 나아가는 반대쪽으로 기움
      const at = (f: number) => ({
        x: cx + (Math.sin(e * C.swaySpeed + f * 2.6) * C.sway + lean) * f,
        y: y - H * f * grow,
        r: (r0 + (radius - r0) * f ** 1.2) * (0.6 + 0.4 * grow),
      });
      // 바닥: 판정 반지름을 도는 바람 고리 두 겹 + 먼지 자국
      ellipseDots(g, cx, y, radius, spin * 0.8, deep, a * 0.9, 2);
      ellipseDots(g, cx, y, radius * 0.7, -spin * 0.6, sky, a * 0.6, 3);
      for (let i = 0; i < C.dust; i++) {
        const q = (i / C.dust) * Math.PI * 2 + spin * 0.5, d = radius * (0.5 + hash(i) * 0.7);
        px(g, cx + Math.cos(q) * d, y + Math.sin(q) * d * DEPTH_RATIO, dust, a * 0.7);
      }
      // 끌어당김: 바깥에서 가운데로 휘며 빨려드는 바람 줄
      for (let i = 0; i < C.suck; i++) {
        const t = (e * C.suckSpeed + hash(i + 7)) % 1, base = (i / C.suck) * Math.PI * 2 + hash(i) * 0.5;
        for (let j = 0; j < 4; j++) {
          const tt = Math.min(1, t + j * 0.04), d = radius * (C.suckFrom - (C.suckFrom - 0.4) * tt), q = base + tt * 1.6 * facing;
          px(g, cx + Math.cos(q) * d, y - 2 + Math.sin(q) * d * DEPTH_RATIO, j ? sky : white, a * (1 - tt * 0.6) * (1 - j * 0.2));
        }
      }
      // 깔때기: 뒤 반 먼저(어둡게), 앞 반 나중에(밝게) 그려 앞이 덮음
      for (const front of [false, true]) {
        for (let i = 0; i < C.rings; i++) {
          const f = i / (C.rings - 1), l = at(f), head0 = spin * (1.4 - f * 0.6) + i * 1.1;
          const steps = Math.round(l.r * C.span), thick = f > 0.55 ? 2 : 1;
          for (let arm = 0; arm < 2; arm++) {
            const head = head0 + arm * Math.PI;
            for (let j = 0; j <= steps; j++) {
              const u = j / steps, q = head - u * C.span * facing, s = Math.sin(q);
              if (s >= 0 !== front) continue;
              const c = !front ? deep : u < 0.2 ? white : u < 0.6 ? sky : deep;
              const px0 = l.x + Math.cos(q) * l.r, py0 = l.y + s * l.r * C.flat;
              for (let t = 0; t < thick; t++) px(g, px0, py0 - t, c, a * (front ? 1.15 - u * 0.7 : 0.55 - u * 0.3));
            }
          }
        }
      }
      // 나선으로 오르는 바람 줄 (앞쪽만 흰 줄)
      for (let s = 0; s < C.streaks; s++) {
        const off = (e * C.streakSpeed + s / C.streaks) % 1;
        for (let j = 0; j < 14; j++) {
          const f = clamp01(off - j * 0.025), l = at(f), q = spin * 1.2 + s * 2.1 + f * C.twist * facing, sn = Math.sin(q);
          if (sn < 0) continue;
          px(g, l.x + Math.cos(q) * l.r * 1.08, l.y + sn * l.r * C.flat, j < 3 ? white : sky, a * (1 - j / 14));
        }
      }
      // 빨려 오르는 티끌, 꼭대기에서 바깥으로 흩날림
      for (let i = 0; i < C.motes; i++) {
        const t = (e * C.moteSpeed + hash(i + 2)) % 1, q = spin * 0.9 + (i / C.motes) * Math.PI * 2;
        const l = at(Math.min(1, t)), out = t > 0.85 ? (t - 0.85) * 60 : 0;
        const mx = l.x + Math.cos(q) * (l.r + out), my = l.y + Math.sin(q) * l.r * C.flat - out * 0.3;
        px(g, mx, my, i % 3 ? sky : dust, a * (1 - t * 0.4));
        if (i % 4 === 0) px(g, mx + facing, my, white, a * (1 - t));
      }
    },
  };
}
