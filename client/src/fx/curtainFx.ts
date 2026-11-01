// 검의 장막 연출 (대검 B Lv11, art.md 7장, 값 fx.json tier3b.curtain): 준비·충전 동안 내 둘레 범위 고리가 충전한 만큼 커짐
// (최대 범위 옅은 점선 + 바깥으로 밀려나는 물결 + 고리 위 바깥 화살표, chargeFx가 매 프레임), active에 칼을 꽂은 자리에서
// 둘레 고리가 펼쳐져 반복 시간 동안 꽂은 자리에 남음(따라다니는 장막 = repeat.follow면 캐릭터를 따라감). 맞은 몬스터 몸에 X자 베기 + 별 + 불꽃,
// 조여드는 장막의 끝 판정은 고리가 안으로 조여든 뒤 큰 별·사방 베기·충격 고리
import { DEPTH_RATIO, type ActionDef } from '@game/shared';
import type Phaser from 'phaser';
import fx from '../../data/fx.json';
import { colorInt } from '../palette';
import { project } from '../view/layout';
import { lookOf } from './branchFx';
import type { Effect, FxLayer } from './layer';
import { dust, sparks } from './particles';
import { clamp01, col, ellipseDots, hash, life, px, star4 } from './spellDraw';
import { quakeRing } from './tier2Fx';

const C = fx.tier3b.curtain;

type Foot = () => { sx: number; sy: number; facing: number };

const radiusOf = (def: ActionDef) => def.area?.radius ?? 40;
/** 장막이 남는 시간: 반복 묶음 전체 (잔상처럼 반복이 없으면 짧게) */
const lastOf = (def: ActionDef) => (def.repeat ? def.repeat.count * def.repeat.interval : C.shortSec);

/**
 * 준비·충전 중 범위 (바닥 층에 매 프레임, chargeFx): r = 지금 반지름, max = 최대 충전 반지름 (논리 px), level = 충전 비율.
 * 최대 범위는 옅은 점선, 지금 범위는 도는 2겹 점선(충전 중 흰색), 안에서 바깥으로 밀려나는 물결, 고리 위 바깥쪽 화살표
 */
export function drawCurtainCharge(g: Phaser.GameObjects.Graphics, sx: number, sy: number, r: number, max: number, level: number, now: number): void {
  const G = C.charge, { white, gold } = col(), edge = colorInt('global.fx.smearEdge');
  const growing = level > 0 && level < 1, full = level >= 1, main = growing || (full && Math.floor(now / G.pulseSec) % 2 === 0) ? white : gold;
  if (max > r + 1) ellipseDots(g, sx, sy, max, -now * C.spin, edge, G.maxAlpha, G.maxEvery);
  ellipseDots(g, sx, sy, r, now * C.spin, main, 1, C.ringEvery);
  ellipseDots(g, sx, sy, r - 1, now * C.spin, gold, 0.6, C.ringEvery);
  // 물결: 몸 둘레에서 지금 범위까지 waveSec마다 밀려남 (바깥으로 갈수록 진함)
  for (let i = 0; i < G.waves; i++) {
    const t = ((now / G.waveSec) + i / G.waves) % 1, d = G.from + (r - G.from) * t;
    ellipseDots(g, sx, sy, d, now, gold, clamp01(t * 1.2) * 0.7, G.waveEvery);
  }
  // 고리 위 바깥 화살표 arrows개: 충전 중이면 밖으로 들썩임
  const bob = growing ? Math.round((Math.sin(now * G.bobSpeed) + 1) * 1) : 0;
  for (let i = 0; i < G.arrows; i++) {
    const q = (i / G.arrows) * Math.PI * 2 + Math.PI / G.arrows, cx = Math.cos(q), cy = Math.sin(q) * DEPTH_RATIO;
    for (let d = 0; d < G.arrowLen; d++) {
      const x = sx + cx * (r + 1 + bob + d), y = sy + cy * (r + 1 + bob + d);
      px(g, x, y, d === G.arrowLen - 1 ? white : gold);
    }
    // 화살촉: 끝에서 양옆으로 1px
    const tx = sx + cx * (r + bob + G.arrowLen - 1), ty = sy + cy * (r + bob + G.arrowLen - 1);
    px(g, tx - cy * 2, ty + cx, white);
    px(g, tx + cy * 2, ty - cx, white);
  }
}

/** 장막 고리: spreadSec 동안 펼쳐져 반지름 r, 테두리 금 점선(천천히 돎) + 안쪽 어두운 금 점선 + 흰 반짝임, 마지막 fadeLast 비율은 바둑판으로 사라짐 */
function ring(foot: Foot, r: number, sec: number): Effect {
  const { white, gold } = col(), edge = colorInt('global.fx.smearEdge');
  return {
    ...life(sec),
    draw(g, k) {
      const { sx, sy } = foot(), e = (1 - k) * sec, s = clamp01(e / C.spreadSec), a = k < C.fadeLast ? k / C.fadeLast : 1;
      const rr = Math.max(2, r * s);
      ellipseDots(g, sx, sy, rr, e * C.spin, gold, a, C.ringEvery);
      ellipseDots(g, sx, sy, rr - 1, -e * C.spin, edge, a * 0.5, C.ringEvery * 2);
      for (let i = 0; i < C.sparks; i++) {
        const t = hash(i * 11) * Math.PI * 2 + e * C.spin, on = (Math.floor(e / C.sparkSec) + i) % C.sparks === 0;
        if (on || s < 1) px(g, sx + Math.cos(t) * rr, sy + Math.sin(t) * rr * DEPTH_RATIO, white, a);
      }
    },
  };
}

/** active (actionSmear가 부름): 꽂는 자리 별·충격 고리·먼지 + 캐릭터를 따라가는 고리 (반복 시간 동안, 바닥 층. follow가 아니면 꽂은 자리에) */
export function curtainField(layer: FxLayer, ground: FxLayer, def: ActionDef, foot: Foot): void {
  const here = foot(), { sx, sy } = here, r = radiusOf(def), { white, gold } = col();
  ground.add(ring(def.repeat?.follow ? foot : () => here, r, lastOf(def)));
  layer.add(quakeRing(sx, sy, r));
  layer.add({ ...life(C.starSec), draw: (g, k) => star4(g, sx, sy, Math.max(1, Math.round(5 * k)), white, gold, k) });
  dust(sx, sy, C.dust).forEach((e) => layer.add(e));
}

/** 조여드는 장막 끝 판정: 고리가 closeSec 동안 반지름 r → 0으로 조여들고(흰 → 금) 다 조이면 큰 별 + 사방 베기 줄 rays개 + 충격 고리 + 먼지 */
export function curtainClose(sx: number, sy: number, r: number): Effect[] {
  const E = C.close, { white, gold } = col(), sec = E.closeSec + E.burstSec;
  const shrink: Effect = {
    ...life(sec),
    draw(g, k) {
      const e = (1 - k) * sec;
      if (e < E.closeSec) {
        const t = e / E.closeSec;
        ellipseDots(g, sx, sy, Math.max(1, r * (1 - t * t)), e * 8, t < 0.5 ? white : gold, 1, 2);
        return;
      }
      const b = clamp01((e - E.closeSec) / E.burstSec), a = 1 - b, y = sy + C.hit.y;
      star4(g, sx, y, Math.max(1, Math.round(E.star * a)), white, gold, 1);
      for (let i = 0; i < E.rays; i++) {
        const q = (i / E.rays) * Math.PI * 2 + 0.4, d0 = E.from + (r - E.from) * b, d1 = Math.min(r, d0 + E.rayLen);
        for (let d = d0; d <= d1; d++) px(g, sx + Math.cos(q) * d, y + Math.sin(q) * d * DEPTH_RATIO, d > d1 - 2 ? white : gold, a);
      }
    },
  };
  return [shrink, quakeRing(sx, sy, r), ...dust(sx, sy, C.dust)];
}

/**
 * 맞은 몬스터 몸에 X자 베기 (2px 줄 두 개가 lag초 엇갈려 그어지고 꼬리부터 사라짐, 흰 머리 → 금 → 어두운 금) + 가운데 별 + 불꽃.
 * big = 펼칠 때 판정 (더 길고 큰 별·불꽃 많이). (sx, sy) = 몸 기준 화면 좌표, seed = 판정마다 다른 값
 */
export function curtainHit(layer: Pick<FxLayer, 'add'>, id: string | undefined, sx: number, sy: number, seed: number, big: boolean): void {
  if (!id || lookOf(id) !== 'curtain') return;
  const H = C.hit, { white, gold } = col(), edge = colorInt('global.fx.smearEdge');
  const n = big ? H.bigLen : H.len, y = sy + H.y, tilt = (hash(seed) - 0.5) * H.tilt;
  const ox = Math.round((hash(seed * 2.3) - 0.5) * H.jitter), oy = Math.round((hash(seed * 3.1) - 0.5) * H.jitter);
  const cut = (dir: number, lag: number): Effect => ({
    ...life(H.sec),
    draw(g, k) {
      const t = clamp01(((1 - k) * H.sec - lag) / (H.sec - lag));
      if (t <= 0) return;
      const grow = Math.min(1, t / H.pass), from = -n + Math.round(2 * n * Math.max(0, t - H.pass) / (1 - H.pass)), to = -n + Math.round(2 * n * grow);
      const dx = 1, dy = dir * (1 + tilt), a = clamp01((1 - t) * 2);
      for (let j = from; j <= to; j++) {
        const lead = to - j < 3 && grow < 1, x = sx + ox + dx * j, yy = y + oy + Math.round(dy * j * 0.8);
        px(g, x, yy, lead || t < 0.4 ? white : Math.abs(j) < n * 0.7 ? gold : edge, a);
        px(g, x, yy - 1, lead || t < 0.3 ? white : gold, a);
      }
    },
  });
  const flash: Effect = {
    ...life(H.flashSec),
    draw: (g, k) => star4(g, sx + ox, y + oy, Math.max(1, Math.round((big ? H.star[1]! : H.star[0]!) * k)), white, gold, 1),
  };
  layer.add(cut(1, 0));
  layer.add(cut(-1, H.lag));
  layer.add(flash);
  sparks(sx + ox, y + oy).slice(0, big ? H.sparks[1] : H.sparks[0]).forEach((e) => layer.add(e));
}
