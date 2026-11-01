// 검기 날리기 투사체·끝 연출 (art.md 7장, fx.json branch.wave): 크게 휜 초승달(흰 심 → 금 → 어두운 금) + 뒤 꼬리 + 속도선 + 앞 반짝임,
// 발밑 금빛 줄·긁힌 자국, 지나간 자리 흙먼지. 날아간 거리로 커지고, 끝나면 미끄러지며 얇아진 흰 호가 금빛 가루로 흩어진다
import type Phaser from 'phaser';
import fx from '../../data/fx.json';
import { colorInt } from '../palette';
import type { Effect } from './layer';
import { clamp01, easeOut, hash, life, px } from './spellDraw';

type G = Phaser.GameObjects.Graphics;
const W = fx.branch.wave;

const tones = () => ({
  white: colorInt('global.allyFx.white'), gold: colorInt('global.allyFx.gold'), edge: colorInt('global.fx.smearEdge'),
  dustL: colorInt('global.fx.dustLight'), dustD: colorInt('global.fx.dustDark'),
});

interface Arc {
  /** 반 높이, 휨, 두께 (px) */
  h: number;
  bulge: number;
  thick: number;
  tail: number;
}

/** 초승달 한 장 (f = -1 위 ~ 1 아래). 꼬리 먼저, 그 위에 날. 두께가 줄면 뒤부터 깎여 앞 흰 줄이 남는다 */
function crescent(g: G, sx: number, cy: number, dir: number, s: Arc, a: number, seed = 0): void {
  const c = tones();
  for (let dy = -s.h; dy <= s.h; dy++) {
    const f = dy / s.h;
    const bend = 1 - f * f, front = Math.round(bend * s.bulge), thick = Math.max(1, Math.round((1 - Math.abs(f) ** 1.5) * s.thick));
    // 꼬리: 줄마다 길이가 달라 깃털처럼 (seed = 이동 거리로 바뀜), 앞 2px만 금
    const y = cy + dy, tail = Math.round(bend * s.tail * (0.35 + 0.65 * hash(dy * 3.1 + seed)));
    for (let d = 0; d < tail; d++) px(g, sx + (front - thick - d) * dir, y, d < 2 ? c.gold : c.edge, a * 0.7 * (1 - d / tail));
    for (let t = 0; t < thick; t++) {
      const col = t === 0 || (t <= 1 && Math.abs(f) < 0.6) || (t === 2 && Math.abs(f) < 0.25) ? c.white : t < thick - 1 ? c.gold : c.edge;
      px(g, sx + (front - t) * dir, y, col, a);
    }
    if (Math.abs(f) < 0.75) px(g, sx + (front + 1) * dir, y, c.gold, a * 0.5);
  }
}

/** 그림 크기용 반지름: 6을 넘는 만큼은 절반만 (대형 반지름 12가 화면을 덮지 않게) */
const sizeR = (r: number) => (r > 6 ? 6 + (r - 6) * 0.5 : r);

/** 반지름 r·날아간 거리 trav로 정한 크기 */
function arcOf(r: number, trav: number): Arc {
  const k = r / 6, grow = W.growMin + (1 - W.growMin) * easeOut(clamp01(trav / W.grow));
  return { h: Math.round(r * W.tall * grow), bulge: W.bulge * k * grow, thick: Math.max(2, W.thick * Math.sqrt(k) * grow), tail: W.tail * k * grow };
}

/** 속도선: 꼬리 뒤로 길게, 이동 거리(flick)로 길이가 떨림. lenMul = 길이 배율 */
function speedLines(g: G, sx: number, cy: number, dir: number, s: Arc, r: number, flick: number, lenMul: number, a: number): void {
  const c = tones();
  W.lines.forEach((k, i) => {
    const y = cy + Math.round(k * s.h), start = Math.round((1 - k * k) * s.bulge) - s.thick + 2;
    const len = Math.round(r * W.lineLen * (0.55 + 0.25 * ((flick + i) % 3)) * lenMul);
    for (let d = 0; d < len; d++) px(g, sx + (start - d) * dir, y, d < 3 ? c.white : d < len / 3 ? c.gold : c.edge, a * (1 - d / len));
  });
}

/** 날고 있는 검기. (sx, sy) = 발밑(바닥) 화면 좌표, x = 월드 x (속도선·먼지 고정용), trav = 날아간 거리 */
export function swordWave(g: G, sx: number, sy: number, dir: number, hitR: number, x = 0, trav = 99): void {
  const r = sizeR(hitR);
  const c = tones(), s = arcOf(r, trav), full = Math.round(r * W.tall), cy = sy - full - W.lift, flick = Math.floor(x / 3);
  // 바닥: 지나간 자리 흙먼지 (월드 x에 고정, 뒤로 갈수록 크고 높게 피어오르다 사라짐)
  const span = Math.min(W.dustSpan, trav);
  for (let m = -Math.ceil(W.dustSpan / W.dustEvery) - 1; m <= 1; m++) {
    const at = (Math.floor(x / W.dustEvery) + m) * W.dustEvery, behind = (x - at) * dir;
    if (behind <= 2 || behind >= span) continue;
    const age = behind / W.dustSpan, rad = 1 + age * 2.5, px0 = sx - behind * dir + (hash(at) - 0.5) * 4, py0 = sy - age * 6;
    for (let oy = -Math.ceil(rad); oy <= rad; oy++) for (let ox = -Math.ceil(rad); ox <= rad; ox++) {
      if (ox * ox + oy * oy <= rad * rad) px(g, px0 + ox, py0 + oy, oy < 0 ? c.dustL : c.dustD, 0.8 * (1 - age));
    }
  }
  // 발밑: 금빛 줄 + 그 아래 긁힌 자국
  for (let d = -2; d < W.scratch; d++) {
    const f = Math.max(0, d) / W.scratch;
    px(g, sx - d * dir, sy, d < W.scratch * 0.4 ? c.gold : c.edge, 0.8 * (1 - f));
    if (d % 2 === 0) px(g, sx - d * dir, sy + 1, c.edge, 0.6 * (1 - f));
  }
  speedLines(g, sx, cy, dir, s, r, flick, 1, 0.85);
  crescent(g, sx, cy, dir, s, 1, Math.floor(x / 4));
  // 앞 가장자리 반짝임: 이동 거리로 자리가 바뀜
  for (let j = 0; j < W.sparkle; j++) {
    const f = hash(flick * 7 + j * 13) * 1.6 - 0.8, y = cy + Math.round(f * s.h), fx0 = sx + (Math.round((1 - f * f) * s.bulge) + 1 + (j % 2)) * dir;
    px(g, fx0, y, c.white);
    if (j === 0) { px(g, fx0, y - 1, c.white, 0.6); px(g, fx0, y + 1, c.white, 0.6); px(g, fx0 + dir, y, c.gold, 0.6); }
  }
}

/** 검기 끝: 갈라지지 않고 앞으로 drift px 미끄러지며 뒤부터 얇아져(꼬리·속도선도 줄어듦) 흰 호만 남고, breakAt부터 호가 금빛 가루 motes개로
 * 흩어져 앞으로 moteDrift px 날다 사라짐. (sx, sy) = 발밑 화면 좌표, 이동 거리 x는 꼬리 모양을 날던 마지막 프레임과 맞추려고 */
export function waveEnd(sx: number, sy: number, dir: number, hitR: number, x = 0): Effect {
  const r = sizeR(hitR), E = W.end, s = arcOf(r, 99), cy = sy - Math.round(r * W.tall) - W.lift, c = tones();
  const fadeEnd = E.breakAt + 0.15;
  return {
    ...life(E.sec),
    draw(g, k) {
      const e = 1 - k, ox = sx + Math.round(easeOut(e) * E.drift) * dir;
      if (e < fadeEnd) {
        const q = e / fadeEnd, a = e < E.breakAt ? 1 : 1 - (e - E.breakAt) / 0.15;
        const arc = { h: Math.round(s.h * (1 - 0.25 * q)), bulge: s.bulge, thick: Math.max(1, s.thick * (1 - q)), tail: s.tail * (1 - q) ** 2 };
        speedLines(g, ox, cy, dir, arc, r, Math.floor(x / 3), (1 - q) ** 2, 0.85 * a);
        crescent(g, ox, cy, dir, arc, a, Math.floor(x / 4));
      }
      const start = E.breakAt * 0.8;
      if (e < start) return;
      const m = (e - start) / (1 - start), h = s.h * 0.8;
      for (let j = 0; j < E.motes; j++) {
        const f = -0.85 + (1.7 * j) / (E.motes - 1), go = E.moteDrift * m * (0.6 + 0.4 * hash(j + 1));
        const mx = ox + (Math.round((1 - f * f) * s.bulge) + go) * dir, my = cy + f * h + f * m * 4 - m * 2;
        px(g, mx, my, m < 0.4 ? c.white : c.gold, 1 - m);
        if (j % 2 === 0) px(g, mx - dir, my, c.gold, (1 - m) * 0.5);
      }
    },
  };
}
