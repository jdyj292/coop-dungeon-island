// SK-7 대검 B 계열 3단계 연출 (art.md 7장, 값 fx.json tier3b): 검의 장막은 curtainFx,
// 교차점(projectile.meet, 지금 쓰는 스킬 없음) = X자로 벌어지는 빛 + 큰 별 + 고리, 일섬 = 판정 끝까지 한 줄 섬광(굵은 흰 줄 → 금 → 바둑판) + 차례로 번쩍이는 베기 자국,
// 칼바람(일섬 다단) = 줄 위 몇 자리에 짧은 X자 베기 + 다시 번쩍이는 줄, 반환 = 맞은 적 자리 늦은 대각선 베기, 보조 잔상 = 같은 그림을 바둑판으로 반만 (ghosted)
import type Phaser from 'phaser';
import fx from '../../data/fx.json';
import { colorInt } from '../palette';
import type { Effect } from './layer';
import { sparks } from './particles';
import { clamp01, col, life, px, star4 } from './spellDraw';
import { quakeRing } from './tier2Fx';

const T = fx.tier3b;
type G = Phaser.GameObjects.Graphics;
const edgeCol = () => colorInt('global.fx.smearEdge');

/** 바둑판 반쪽만 그리는 Graphics (1px 점은 (x + y)가 짝수인 자리만): 잔상·잔상 투사체를 반투명처럼 */
export function checker(g: G): G {
  return new Proxy(g, {
    get(t, p) {
      if (p === 'fillRect') {
        return (x: number, y: number, w: number, h: number) => {
          if (w * h > 1 || ((x + y) & 1) === 0) t.fillRect(x, y, w, h);
          return t;
        };
      }
      const v = (t as unknown as Record<string | symbol, unknown>)[p];
      return typeof v === 'function' ? v.bind(t) : v;
    },
  });
}

/** 이펙트를 바둑판 반쪽으로 (보조 잔상) */
export function ghosted(e: Effect): Effect {
  const draw = e.draw.bind(e);
  e.draw = (g, k) => draw(checker(g), k);
  return e;
}

/** 두 점 사이 1px 줄 */
function line(g: G, x0: number, y0: number, x1: number, y1: number, color: number, a = 1): void {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  for (let i = 0; i <= n; i++) px(g, x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, color, a);
}

/** 교차점 폭발: X자 빛이 반지름까지 벌어지고(흰 심 → 금) 큰 별 + 고리 2겹 + 불꽃. (sx, sy) = 발밑 화면 좌표 */
export function meetBurst(sx: number, sy: number, r: number): Effect[] {
  const M = T.meet, { white, gold } = col(), y = sy + M.y;
  const x: Effect = {
    ...life(M.sec),
    draw(g, k) {
      const e = 1 - k, n = Math.round(r * Math.min(1, e * 4)), a = clamp01(k * 2);
      for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
        line(g, sx, y, sx + dx * n, y + dy * Math.round(n * 0.6), e < 0.3 ? white : gold, a);
      }
      star4(g, sx, y, Math.max(1, Math.round(M.star * k)), white, gold, a);
    },
  };
  return [x, quakeRing(sx, sy, r), quakeRing(sx, sy, r * 0.5), ...sparks(sx, y).slice(0, M.sparks)];
}

/** 반환: 맞은 적 자리 늦은 대각선 베기 (흰 → 금 → 바둑판) + 작은 별 */
export function flashCut(sx: number, sy: number, facing: number): Effect {
  const C = T.cut, { white, gold } = col(), y = sy + C.y;
  return {
    ...life(C.sec),
    draw(g, k) {
      const e = 1 - k, n = Math.round(C.len * Math.min(1, e * 5)), a = clamp01(k * 1.8);
      line(g, sx - n * facing, y - n, sx + n * facing, y + n, e < 0.25 ? white : gold, a);
      if (e < 0.25) line(g, sx - n * facing + 1, y - n, sx + n * facing + 1, y + n, gold, a);
      star4(g, sx, y, Math.max(1, Math.round(2 * k)), white, gold, a);
    },
  };
}
