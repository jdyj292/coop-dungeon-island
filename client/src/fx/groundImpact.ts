// 땅 내려치기 (대지가르기 등): 발 앞으로 번지는 도트 균열 + 충격 링 + 먼지 (art.md 7장, 값 fx.json smear.ground)
import fx from '../../data/fx.json';
import { colorInt } from '../palette';
import { dot, type Effect } from './layer';
import { dust, ring } from './particles';
import { clamp01, hash, life, shown } from './spellDraw';

/** 땅을 내려치는 행동인가 (fx.json smear.ground.actions) */
export const isGroundImpact = (actionId: string): boolean => fx.smear.ground.actions.includes(actionId);

export interface CrackPixel {
  dx: number;
  dy: number;
  /** 0 = 균열(진한), 1 = 아래 밝은 가장자리 */
  tone: 0 | 1;
  /** 발에서 앞으로 얼마나 (0~1, 번지는 순서) */
  f: number;
}

/** 균열 픽셀 (오른쪽을 볼 때, 발밑 기준). 줄은 위아래로 1px씩 꺾이고, branchEvery마다 짧은 잔금 */
export function crackPixels(): CrackPixel[] {
  const c = fx.smear.ground;
  const out: CrackPixel[] = [];
  let y = 0;
  for (let i = 0; i <= c.length; i++) {
    const f = i / c.length;
    if (i > 0 && hash(i) < 0.35) y = Math.max(-1, Math.min(1, y + (hash(i + 99) < 0.5 ? -1 : 1)));
    const dx = c.forward + i;
    out.push({ dx, dy: y, tone: 0, f });
    if (i % 2 === 0) out.push({ dx, dy: y + 1, tone: 1, f });
    // 잔금: 위나 아래로 비스듬히 2~3px, 끝으로 갈수록 짧게
    if (i > 2 && i % c.branchEvery === 0) {
      const dir = hash(i + 7) < 0.5 ? -1 : 1;
      const n = f < 0.6 ? 3 : 2;
      for (let j = 1; j <= n; j++) out.push({ dx: dx + j, dy: y + dir * j, tone: 0, f });
    }
  }
  return out;
}

/** 균열 1개: spreadSec 동안 앞으로 번지고(끝에 금색 반짝임), 마지막 fadeLast 비율은 바둑판으로 사라짐 */
export function crack(sx: number, sy: number, facing: number): Effect {
  const c = fx.smear.ground;
  const pixels = crackPixels();
  const dark = colorInt('global.outline'), rim = colorInt('global.fx.dustDark');
  const gold = colorInt('global.allyFx.gold'), white = colorInt('global.allyFx.white');
  return {
    ...life(c.sec),
    draw(g, k) {
      const t = (1 - k) * c.sec;
      const reach = clamp01(t / c.spreadSec);
      const a = clamp01(k / c.fadeLast);
      for (const p of pixels) {
        if (p.f > reach) continue;
        const x = sx + p.dx * facing, y = sy + p.dy;
        if (shown(x, y, a)) dot(g, x, y, p.tone === 0 ? dark : rim);
      }
      if (reach < 1) {
        const tip = c.forward + Math.round(reach * c.length);
        dot(g, sx + tip * facing, sy - 1, gold);
        dot(g, sx + tip * facing, sy, white);
      }
    },
  };
}

/** 내려친 순간 한꺼번에: 균열 + 칼끝 자리 충격 링 + 먼지 */
export function groundImpact(sx: number, sy: number, facing: number): Effect[] {
  const c = fx.smear.ground;
  const hx = sx + c.ringAt * facing;
  return [crack(sx, sy, facing), ring(hx, sy), ...dust(hx, sy, c.dust)];
}
