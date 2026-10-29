// 땅 내려치기 (대지가르기 등): 발 앞으로 번지는 도트 균열 + 충격 링 + 먼지 (art.md 7장, 값 fx.json smear.ground)
// 판정이 부채꼴(변형 부채꼴)이면 균열을 판정 각도로 펼친다
import { DEPTH_RATIO } from '@game/shared';
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

/** 균열 픽셀 (오른쪽을 볼 때, 발밑 기준). 줄은 위아래로 1px씩 꺾이고, branchEvery마다 짧은 잔금. seed가 다르면 꺾임이 다르다 */
export function crackPixels(length = fx.smear.ground.length, seed = 0): CrackPixel[] {
  const c = fx.smear.ground;
  const out: CrackPixel[] = [];
  let y = 0;
  for (let i = 0; i <= length; i++) {
    const f = i / length;
    if (i > 0 && hash(i + seed) < 0.35) y = Math.max(-1, Math.min(1, y + (hash(i + seed + 99) < 0.5 ? -1 : 1)));
    const dx = c.forward + i;
    out.push({ dx, dy: y, tone: 0, f });
    if (i % 2 === 0) out.push({ dx, dy: y + 1, tone: 1, f });
    // 잔금: 위나 아래로 비스듬히 2~3px, 끝으로 갈수록 짧게
    if (i > 2 && i % c.branchEvery === 0) {
      const dir = hash(i + seed + 7) < 0.5 ? -1 : 1;
      const n = f < 0.6 ? 3 : 2;
      for (let j = 1; j <= n; j++) out.push({ dx: dx + j, dy: y + dir * j, tone: 0, f });
    }
  }
  return out;
}

/** 균열 줄 하나의 방향·길이: rot = 앞에서 깊이 쪽으로 돌린 각(rad, 화면에서는 깊이 압축) */
export interface CrackLine {
  rot: number;
  length: number;
  seed: number;
}

/** 줄 위 점(dx, dy) → 화면 오프셋 (rot만큼 돌리고 깊이 성분은 DEPTH_RATIO로 납작하게) */
function turn(dx: number, dy: number, rot: number): [number, number] {
  if (!rot) return [dx, dy];
  const cos = Math.cos(rot), sin = Math.sin(rot);
  return [Math.round(dx * cos), Math.round(dx * sin * DEPTH_RATIO + dy)];
}

/** 균열 1개: spreadSec 동안 앞으로 번지고(끝에 금색 반짝임), 마지막 fadeLast 비율은 바둑판으로 사라짐 */
export function crack(sx: number, sy: number, facing: number, line: CrackLine = { rot: 0, length: fx.smear.ground.length, seed: 0 }): Effect {
  const c = fx.smear.ground;
  const pixels = crackPixels(line.length, line.seed).map((p) => ({ ...p, at: turn(p.dx, p.dy, line.rot) }));
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
        const x = sx + p.at[0] * facing, y = sy + p.at[1];
        if (shown(x, y, a)) dot(g, x, y, p.tone === 0 ? dark : rim);
      }
      if (reach < 1) {
        const [tx, ty] = turn(c.forward + Math.round(reach * line.length), 0, line.rot);
        dot(g, sx + tx * facing, sy + ty - 1, gold);
        dot(g, sx + tx * facing, sy + ty, white);
      }
    },
  };
}

/** 부채꼴 판정 (area fan): 반지름 px, 펼친 각 도 */
export interface FanArea {
  radius: number;
  angle: number;
}

/** 부채꼴 균열 줄들: 판정 각도 안에 lines줄을 고르게, 길이 = 반지름 − forward */
export function fanLines(area: FanArea): CrackLine[] {
  const n = fx.smear.ground.fan.lines, half = ((area.angle / 2) * Math.PI) / 180;
  const length = Math.max(8, area.radius - fx.smear.ground.forward);
  return Array.from({ length: n }, (_, i) => ({ rot: n > 1 ? -half + (2 * half * i) / (n - 1) : 0, length, seed: i * 31 }));
}

/** 내려친 순간 한꺼번에: 균열 + 칼끝 자리 충격 링 + 먼지. fan이면 균열을 부채꼴로 펼치고 줄 끝마다 먼지 */
export function groundImpact(sx: number, sy: number, facing: number, fan?: FanArea): Effect[] {
  const c = fx.smear.ground;
  const hx = sx + c.ringAt * facing;
  const lines = fan ? fanLines(fan) : [{ rot: 0, length: c.length, seed: 0 }];
  const tips = fan ? lines.flatMap((l) => {
    const [tx, ty] = turn(c.forward + l.length, 0, l.rot);
    return dust(sx + tx * facing, sy + ty, c.fan.tipDust);
  }) : [];
  return [...lines.map((l) => crack(sx, sy, facing, l)), ring(hx, sy), ...dust(hx, sy, c.dust), ...tips];
}
