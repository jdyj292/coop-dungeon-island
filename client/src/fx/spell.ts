// 스태프 마법 연출 (MVP 보충 ST-2a, art.md 7장 "마법 = 하늘색 계열 구슬·마법진", 아군 이펙트 색 + 보조색):
// 시전 모으기·발사 섬광·마법진(포즈 fx spark·bolt·circle), 마법탄 적중·흩어짐, 순간이동. 화염은 spellFire, 얼음은 spellIce. 값 fx.json spell
import { DEPTH_RATIO } from '@game/shared';
import fx from '../../data/fx.json';
import { dot, type Effect } from './layer';
import { clamp01, col, easeOut, ellipseDots, hash, life, orb, px, star4 } from './spellDraw';

const S = fx.spell;

/** 시전 모으기: 준비 동안 빛 점이 돌며 보석으로 빨려들고, 끝에 십자 반짝임 (준비 자세 spark) */
export function spark(x: number, y: number, sec: number = S.charge.minSec): Effect {
  const { sky, white, deep } = col(), C = S.charge, total = Math.max(C.minSec, sec), flash = S.spark.sec;
  return {
    ...life(total),
    draw(g, k) {
      const e = (1 - k) * total, gather = clamp01(e / Math.max(0.01, total - flash * 0.5));
      for (let i = 0; i < C.motes; i++) {
        const t = clamp01(gather * 1.15 - (i / C.motes) * 0.15), d = C.from * (1 - t * t);
        if (t >= 1) continue;
        const a = (i / C.motes) * Math.PI * 2 + C.swirl * t * Math.PI;
        dot(g, x + Math.cos(a) * d, y + Math.sin(a) * d * 0.7, t > 0.6 ? white : i % 2 ? sky : deep);
      }
      const left = k * total;
      if (left < flash) star4(g, x, y, left > flash / 2 ? S.spark.radius : S.spark.radius - 1, white, sky);
      else if (gather > 0.3) dot(g, x, y, sky);
    },
  };
}

/** 발사 섬광: 4방향 별이 줄고 고리 하나가 퍼짐 (마법탄 bolt) */
export function muzzle(x: number, y: number): Effect {
  const { sky, white, deep } = col(), M = S.muzzle;
  return {
    ...life(M.sec),
    draw(g, k) {
      const t = 1 - k;
      star4(g, x, y, Math.max(1, Math.round(M.radius * k)), white, sky);
      const r = 2 + (M.ring - 2) * easeOut(t);
      for (let i = 0; i < 8; i++) px(g, x + Math.cos((i * Math.PI) / 4) * r, y + Math.sin((i * Math.PI) / 4) * r, t < 0.5 ? sky : deep, k * 1.5);
    },
  };
}

/** 마법진: 바깥 점선 고리·안쪽 고리가 서로 반대로 돌고, 룬 눈금과 떠오르는 빛 점 (광역·꽂기 circle) */
export function magicCircle(x: number, y: number): Effect {
  const { sky, white, deep } = col(), C = S.circle;
  return {
    ...life(C.sec),
    draw(g, k) {
      const t = 1 - k, e = t * C.sec, a = t < 0.6 ? 1 : (1 - t) / 0.4;
      const r = C.r0 + C.grow * easeOut(clamp01(t * 2.5)), rot = C.spin * e;
      ellipseDots(g, x, y, r, rot, sky, a, 2);
      ellipseDots(g, x, y, r * C.inner, -rot, deep, a, 1);
      for (let i = 0; i < C.runes; i++) {
        const q = rot + (i / C.runes) * Math.PI * 2, rx = x + Math.cos(q) * r, ry = y + Math.sin(q) * r * DEPTH_RATIO;
        px(g, rx, ry, white, a);
        px(g, rx, ry - 1, sky, a);
      }
      for (let i = 0; i < C.motes; i++) {
        const q = (i / C.motes) * Math.PI * 2 + hash(i) * 0.8, rise = C.rise * clamp01(t * 1.4 - hash(i + 9) * 0.4);
        px(g, x + Math.cos(q) * r * 0.8, y + Math.sin(q) * r * 0.8 * DEPTH_RATIO - rise, i % 2 ? white : sky, a * (1 - t * 0.5));
      }
    },
  };
}

/** 마법탄 적중: 한 프레임 흰 섬광 → 고리가 퍼지고 얼음 조각 같은 파편 3개가 튐 */
export function boltHit(x: number, y: number): Effect {
  const { sky, white, deep } = col(), H = S.boltHit;
  return {
    ...life(H.sec),
    draw(g, k) {
      const e = (1 - k) * H.sec, t = 1 - k;
      if (e < H.flashSec) {
        orb(g, x, y, 2);
        star4(g, x, y, 4, white, sky);
        return;
      }
      const r = 2 + (H.radius - 2) * easeOut(t), a = 1 - t * 0.9;
      for (let i = 0; i < 12; i++) {
        const q = (i * Math.PI) / 6;
        px(g, x + Math.cos(q) * r, y + Math.sin(q) * r * 0.8, i % 3 ? sky : deep, a);
      }
      for (let i = 0; i < H.shards; i++) {
        const q = -Math.PI / 2 + (i / H.shards) * Math.PI * 2 + 0.5, d = 2 + H.shardDist * easeOut(t);
        const sx = x + Math.cos(q) * d, sy = y + Math.sin(q) * d * 0.8;
        px(g, sx, sy, white, a);
        px(g, sx - Math.cos(q) * 1.5, sy - Math.sin(q) * 1.2, sky, a);
      }
      if (t < 0.4) dot(g, x, y, white);
    },
  };
}

/** 빙글 돌며 흩어지는 하늘색 점, 바둑판으로 사라짐 (사거리 끝 마법탄, 순간이동) */
function scatter(x: number, y: number, n: number, spread: number, sec: number, rise: number, spin: number): Effect[] {
  const { sky, white, deep } = col();
  return Array.from({ length: n }, (_, i) => {
    const a0 = (i / n) * Math.PI * 2 + hash(i) * 0.6;
    return {
      ...life(sec),
      draw(g, k) {
        const t = 1 - k, a = a0 + spin * t, d = spread * easeOut(t) * (0.7 + hash(i + 3) * 0.3);
        px(g, x + Math.cos(a) * d, y + Math.sin(a) * d * DEPTH_RATIO - rise * t, t < 0.3 ? white : i % 2 ? sky : deep, k * 1.6);
      },
    };
  });
}

export const boltFizzle = (x: number, y: number): Effect[] => {
  const F = S.boltFizzle;
  return scatter(x, y, F.count, F.spread, F.sec, F.rise, F.spin);
};

/** 순간이동: 가는 빛기둥이 잠깐 섰다 줄어들고, 점이 돌며 흩어짐 */
export const teleportPuff = (x: number, y: number): Effect[] => {
  const T = S.teleport, { sky, white } = col();
  const column: Effect = {
    ...life(T.columnSec),
    draw(g, k) {
      const h = Math.round(T.column * k), top = y + S.bolt.height - h;
      for (let i = 0; i < h; i++) {
        dot(g, x, top + i, white);
        px(g, x - 1, top + i, sky, k);
        px(g, x + 1, top + i, sky, k);
      }
    },
  };
  return [column, ...scatter(x, y, T.count, T.spread, T.sec, 6, S.boltFizzle.spin)];
};
