// 타격 섬광(십자 별·불꽃), 먼지, 충격 링 (art.md 7장, 값 client/data/fx.json)
import type { FxGrade } from '@game/shared';
import fx from '../../data/fx.json';
import { colorInt } from '../palette';
import { dot, type Effect } from './layer';

const life = (sec: number) => ({ life: sec, total: sec });

/** 십자 별: 앞 절반은 반지름 r, 뒤 절반은 r-1 */
export function star(x: number, y: number, grade: FxGrade): Effect {
  const r = fx.star.radius[grade];
  const gold = colorInt('global.allyFx.gold'), white = colorInt('global.allyFx.white');
  return {
    ...life(fx.star.frames * fx.frame),
    draw(g, k) {
      const rr = k > 0.5 ? r : r - 1;
      dot(g, x - rr, y, gold, rr * 2 + 1, 1);
      dot(g, x, y - rr, gold, 1, rr * 2 + 1);
      dot(g, x - 1, y, white, 3, 1);
      dot(g, x, y - 1, white, 1, 3);
    },
  };
}

/** 1px 불꽃: 사방으로 튀고 중력으로 떨어짐 */
export function sparks(x: number, y: number, rand = Math.random): Effect[] {
  const s = fx.sparks;
  const cols = ['global.allyFx.white', 'global.allyFx.gold', 'global.allyFx.sky'].map(colorInt);
  return Array.from({ length: s.count }, (_, i) => {
    const a = rand() * Math.PI * 2;
    let px = x, py = y, vx = Math.cos(a) * s.speed[0]!, vy = Math.sin(a) * s.speed[1]! - s.lift;
    return {
      ...life(s.sec),
      update(dt) {
        px += vx * dt;
        py += vy * dt;
        vy += s.gravity * dt;
      },
      draw(g) {
        dot(g, px, py, cols[i % cols.length]!);
      },
    };
  });
}

/** 먼지 덩어리 n개: 발밑에서 양옆으로 퍼짐 (앞 절반 밝게, 뒤 절반 어둡게) */
export function dust(x: number, y: number, n: number, rand = Math.random): Effect[] {
  const d = fx.dust;
  const light = colorInt('global.fx.dustLight'), dark = colorInt('global.fx.dustDark');
  return Array.from({ length: n }, (_, i) => {
    const side = i - n / 2;
    let px = x + side * 2, py = y, vx = side * d.spread, vy = -(d.lift[0]! + rand() * (d.lift[1]! - d.lift[0]!));
    return {
      ...life(d.sec),
      update(dt) {
        px += vx * dt;
        py += vy * dt;
        vy += d.gravity * dt;
      },
      draw(g, k) {
        dot(g, px, py - 1, k > 0.5 ? light : dark, 2, 2);
      },
    };
  });
}

/** 바닥에 퍼지는 납작한 타원 테두리 */
export function ring(x: number, y: number): Effect {
  const r = fx.ring, col = colorInt('global.fx.ring');
  return {
    ...life(r.sec),
    draw(g, k) {
      const rad = Math.round(r.r0 + (1 - k) * r.grow);
      const ry = Math.round(rad * r.flat);
      for (let dy = -ry; dy <= ry; dy++) {
        const hw = Math.round(rad * Math.sqrt(Math.max(0, 1 - (dy / (rad * r.flat)) ** 2)));
        dot(g, x - hw, y + dy, col, 1, 1, k);
        dot(g, x + hw, y + dy, col, 1, 1, k);
      }
    },
  };
}
