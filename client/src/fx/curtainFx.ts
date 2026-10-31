// 검의 장막 연출 (대검 B Lv11, art.md 7장, 값 fx.json tier3b.curtain): 준비 동안 떨어질 줄에 깊이 방향 점선 표적,
// active에 하늘에서 칼빛이 떨어져 꽂히고 방 위아래 끝까지 빛의 장막이 반복 시간 동안 남는다 (밀어내기면 함께 나아감).
// 반복 판정마다 줄 위 빛 조각. 방 깊이 끝은 무대가 setCurtainField로 알려 준다 (서버는 화면을 모름)
import type { ActionDef, Bounds } from '@game/shared';
import fx from '../../data/fx.json';
import { colorInt } from '../palette';
import { project } from '../view/layout';
import type { Effect, FxLayer } from './layer';
import { dust } from './particles';
import { clamp01, col, hash, life, px, star4 } from './spellDraw';
import { quakeRing } from './tier2Fx';

const C = fx.tier3b.curtain;
let field = { minY: 0, maxY: 224 };

/** 지금 방의 깊이 끝 (장막이 그 끝까지) */
export function setCurtainField(b: Pick<Bounds, 'minY' | 'maxY'>): void {
  field = { minY: b.minY, maxY: b.maxY };
}

interface Caster { x: number; y: number; facing: number }

/** 장막 줄 (논리 x): 판정 가운데 + copies 자리. step = 판정마다 나아가는 px (밀어내기), 끝까지 (count − 1)번 */
interface Line { x: number; facing: number; step: number; interval: number; steps: number }

function linesOf(def: ActionDef, c: Caster): Line[] {
  const ax = def.area?.at[0] ?? 0, rep = def.repeat;
  const offs = [0, ...(rep?.copies ?? []).map(([dx]) => dx)];
  return offs.map((dx) => ({
    x: c.x + (ax + dx) * c.facing, facing: c.facing, step: rep?.step ?? 0, interval: rep?.interval ?? 1, steps: (rep?.count ?? 1) - 1,
  }));
}

/** 화면 위·아래 끝 (방 깊이 끝) */
const span = (x: number) => ({ sx: project(x, 0).sx, top: project(x, field.minY).sy, bot: project(x, field.maxY).sy });

/** 준비: 떨어질 줄에 아래로 흐르는 점선 (점점 진해짐) */
function target(l: Line, sec: number): Effect {
  const { sx, top, bot } = span(l.x), gold = colorInt('global.allyFx.gold');
  return {
    ...life(sec),
    draw(g, k) {
      const e = (1 - k) * sec, a = clamp01(0.3 + (1 - k) * 0.7), off = Math.floor(e * C.flow);
      for (let y = top; y <= bot; y++) if ((y - top - off) % C.every === 0) px(g, sx, y, gold, a);
    },
  };
}

/** 칼빛: fallFrom px 위에서 fallSec 동안 떨어져 시전자 깊이 줄에 꽂힘, 그 뒤 바둑판으로 사라짐 */
function fallingBlade(sx: number, sy: number): Effect {
  const { white, gold } = col(), edge = colorInt('global.fx.smearEdge'), sec = C.fallSec + C.spreadSec * 2;
  return {
    ...life(sec),
    draw(g, k) {
      const e = (1 - k) * sec, t = clamp01(e / C.fallSec), tip = Math.round(sy - C.fallFrom * (1 - t));
      const a = t < 1 ? 1 : clamp01(1 - (e - C.fallSec) / (C.spreadSec * 2));
      for (let d = 0; d < C.bladeLen; d++) {
        const y = tip - d, w = d < 3 ? Math.ceil((C.blade * d) / 3) : C.blade;
        for (let o = -w; o <= w; o++) px(g, sx + o, y, o === 0 ? white : Math.abs(o) < w ? gold : edge, a * (1 - d / C.bladeLen / 2));
      }
      if (t >= 1) star4(g, sx, sy, Math.max(1, Math.round(5 * a)), white, gold, a);
    },
  };
}

/** 장막: 꽂힌 자리에서 위아래로 펼쳐져 방 끝까지, 높이 height 빛 벽 (가운데 흰·양옆 금·끝 어두운 금) + 위로 흐르는 밝은 띠 */
function wall(l: Line, sy: number, sec: number): Effect {
  const { white, gold } = col(), edge = colorInt('global.fx.smearEdge'), { top, bot } = span(l.x);
  return {
    ...life(sec),
    draw(g, k) {
      const e = (1 - k) * sec - C.fallSec;
      if (e < 0) return;
      const s = clamp01(e / C.spreadSec), y0 = Math.round(sy - (sy - top) * s), y1 = Math.round(sy + (bot - sy) * s);
      const a = k < C.fadeLast ? k / C.fadeLast : 1, band = Math.floor(e * C.rise);
      const sx = project(l.x + Math.min(l.steps, e / l.interval) * l.step * l.facing, 0).sx;
      for (let y = y0 - C.height; y <= y1; y++) {
        const up = y < y0 ? 1 - (y0 - y) / C.height : 1, lit = (y + band) % C.band === 0;
        px(g, sx, y, white, a * up);
        px(g, sx - 1, y, lit ? white : gold, a * up * 0.9);
        px(g, sx + 1, y, lit ? white : gold, a * up * 0.9);
        px(g, sx - 2, y, edge, a * up * 0.45);
        px(g, sx + 2, y, edge, a * up * 0.45);
      }
      // 발밑 줄 끝: 방 위아래 끝에 금빛 매듭
      for (const y of [y0, y1]) star4(g, sx, y, 2, white, gold, a);
    },
  };
}

/** 준비 시작: 떨어질 줄마다 표적 (바닥 층) */
export function curtainStart(ground: FxLayer, def: ActionDef, c: Caster): void {
  for (const l of linesOf(def, c)) ground.add(target(l, def.phases.windup));
}

/** active: 줄마다 칼빛 + 장막(반복 시간 동안, 바닥 층) + 꽂히는 자리 먼지·충격 고리 */
export function curtainActive(fxl: { layer: FxLayer; ground: FxLayer }, def: ActionDef, c: Caster): void {
  const rep = def.repeat, sec = C.fallSec + (rep ? rep.count * rep.interval : 0.6);
  for (const l of linesOf(def, c)) {
    const { sx, sy } = project(l.x, c.y);
    fxl.layer.add(fallingBlade(sx, sy));
    fxl.ground.add(wall(l, sy, sec));
    fxl.layer.add(quakeRing(sx, sy, 14));
    dust(sx, sy, C.dust).forEach((e) => fxl.layer.add(e));
  }
}

/** 반복 판정 한 번: 그 줄 위 빛 조각 (자리는 판정마다 다름). (x, y) = 예약 판정 자리 */
export function curtainTick(layer: FxLayer, def: ActionDef, at: Caster): void {
  const { white, gold } = col(), x = at.x + (def.area?.at[0] ?? 0) * at.facing, { sx, top, bot } = span(x), seed = Math.round(performance.now());
  for (let i = 0; i < C.glints; i++) {
    const y = Math.round(top + (bot - top) * hash(seed + i * 7) - C.height * hash(seed + i * 13));
    layer.add({ ...life(C.glintSec), draw: (g, k) => star4(g, sx, y, Math.max(1, Math.round(3 * k)), white, gold, k) });
  }
}
