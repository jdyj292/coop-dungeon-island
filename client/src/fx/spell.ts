// 스태프 마법 연출 (MVP 보충 ST-2a, art.md 7장 "마법 = 하늘색 계열 구슬·마법진", 아군 이펙트 색만):
// 시전 반짝임·발사 섬광·마법진(포즈 fx spark·bolt·circle), 화염 폭발 표적·폭발, 얼음 장판, 마법탄 적중·흩어짐, 순간이동. 값 fx.json spell
import { DEPTH_RATIO } from '@game/shared';
import fx from '../../data/fx.json';
import { colorInt } from '../palette';
import { ellipse } from './hazards';
import { dot, type Effect } from './layer';
import { sparks } from './particles';

const S = fx.spell;
const life = (sec: number) => ({ life: sec, total: sec });
const col = () => ({ sky: colorInt('global.allyFx.sky'), white: colorInt('global.allyFx.white'), gold: colorInt('global.allyFx.gold') });

/** 시전 반짝임: 보석 끝 하늘색 십자 (준비 자세 spark) */
export function spark(x: number, y: number): Effect {
  const { sky, white } = col(), r = S.spark.radius;
  return {
    ...life(S.spark.sec),
    draw(g, k) {
      const rr = k > 0.5 ? r : r - 1;
      dot(g, x - rr, y, sky, rr * 2 + 1, 1);
      dot(g, x, y - rr, sky, 1, rr * 2 + 1);
      dot(g, x, y, white);
    },
  };
}

/** 발사 섬광: 손 앞 작은 구슬이 줄어듦 (마법탄 bolt) */
export function muzzle(x: number, y: number): Effect {
  const { sky, white } = col();
  return {
    ...life(S.muzzle.sec),
    draw(g, k) {
      const r = Math.max(1, Math.round(S.muzzle.radius * k));
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const d = Math.hypot(dx, dy);
        if (d <= r) dot(g, x + dx, y + dy, d < r - 1 ? white : sky);
      }
    },
  };
}

/** 마법진: 발밑에서 퍼지는 하늘색 타원 테두리, 한 칸 건너 점 (광역·꽂기 circle) */
export function magicCircle(x: number, y: number): Effect {
  const { sky } = col();
  return {
    ...life(S.circle.sec),
    draw(g, k) {
      const r = Math.round(S.circle.r0 + S.circle.grow * (1 - k));
      ellipse(x, y, r, (px, py, edge) => { if (edge && (px + py) % 2 === 0) dot(g, px, py, sky); });
    },
  };
}

/** 화염 폭발 표적: 준비 동안 바닥 금색 점선 원, 안쪽이 차오름 (적 예고와 같은 모양, 색만 아군) */
export function fireTarget(x: number, y: number, r: number, sec: number): Effect {
  const { gold } = col(), dash = S.target.dash;
  return {
    ...life(sec),
    draw(g, k) {
      const fill = 1 - k;
      ellipse(x, y, r, (px, py, edge) => {
        if (edge) { if (Math.floor((px + py) / dash) % 2 === 0) dot(g, px, py, gold); return; }
        if (Math.hypot((px - x) / r, (py - y) / (r * DEPTH_RATIO)) <= fill && (px + py) % 4 === 0) dot(g, px, py, gold, 1, 1, 0.6);
      });
    },
  };
}

/** 화염 폭발: 금색 원이 커지고 안쪽 흰색, 끝에는 체크무늬로 흩어짐 + 불꽃 */
export function fireBurst(x: number, y: number, r: number): Effect[] {
  const { gold, white } = col();
  const burst: Effect = {
    ...life(S.burst.sec),
    draw(g, k) {
      const rr = Math.max(2, Math.round(r * (0.5 + 0.5 * (1 - k))));
      ellipse(x, y - rr * DEPTH_RATIO, rr, (px, py, edge) => {
        if (k < 0.4 && (px + py) % 2) return;
        const inner = Math.hypot((px - x) / rr, (py - (y - rr * DEPTH_RATIO)) / (rr * DEPTH_RATIO)) < 0.5;
        dot(g, px, py, edge ? gold : inner ? white : gold);
      });
    },
  };
  return [burst, ...sparks(x, y - 6).slice(0, S.burst.sparks)];
}

/** 얼음 장판: 바닥 사각형에 하늘색 얼음 무늬 + 흰 반짝임, 끝에 옅어짐. w·d = 논리 px */
export function iceField(x: number, y: number, w: number, d: number): Effect {
  const { sky, white } = col(), hw = Math.round(w / 2), hd = Math.max(1, Math.round((d / 2) * DEPTH_RATIO));
  return {
    ...life(S.iceField.sec),
    draw(g, k) {
      const alpha = Math.min(1, (k * S.iceField.sec) / S.iceField.fadeLast);
      for (let py = -hd; py <= hd; py++) for (let px = -hw; px <= hw; px++) {
        const edge = Math.abs(py) === hd || Math.abs(px) === hw;
        if (edge) dot(g, x + px, y + py, sky, 1, 1, alpha);
        else if ((px + py * 3) % 7 === 0) dot(g, x + px, y + py, white, 1, 1, alpha);
        else if ((px + py) % 2 === 0) dot(g, x + px, y + py, sky, 1, 1, alpha * 0.45);
      }
    },
  };
}

/** 마법탄 적중: 하늘색 고리가 퍼지고 가운데 흰 점 */
export function boltHit(x: number, y: number): Effect {
  const { sky, white } = col();
  return {
    ...life(S.boltHit.sec),
    draw(g, k) {
      const r = Math.round(1 + (S.boltHit.radius - 1) * (1 - k));
      for (let a = 0; a < 8; a++) dot(g, x + Math.round(Math.cos((a * Math.PI) / 4) * r), y + Math.round(Math.sin((a * Math.PI) / 4) * r), sky);
      if (k > 0.5) dot(g, x, y, white);
    },
  };
}

/** 흩어지는 하늘색 점 (사거리 끝 마법탄, 순간이동) */
function scatter(x: number, y: number, n: number, spread: number, sec: number, rise: number): Effect[] {
  const { sky, white } = col();
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return {
      ...life(sec),
      draw(g, k) {
        const t = 1 - k;
        dot(g, x + Math.cos(a) * spread * t, y + Math.sin(a) * spread * t * DEPTH_RATIO - rise * t, i % 2 ? white : sky);
      },
    };
  });
}

export const boltFizzle = (x: number, y: number): Effect[] => scatter(x, y, S.boltFizzle.count, S.boltFizzle.spread, S.boltFizzle.sec, 0);
export const teleportPuff = (x: number, y: number): Effect[] => scatter(x, y, S.teleport.count, S.teleport.spread, S.teleport.sec, 6);
