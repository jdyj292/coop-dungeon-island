// 일섬 연출 (SK-7 대검 B 계열, art.md 7장, 값 fx.json flash):
// 준비·충전 = 앞 부채꼴 범위가 보이고 충전할수록 커짐, 바람 줄이 소용돌이치며 손으로 빨려들고(충전할수록 넓고 많게) 금빛 점이 모임 →
// 판정(키를 뗌) = 발도로 앞을 한 번 베는 초승달 + 부채꼴을 아래에서 위로 훑는 파란 칼빛, 곧 칼을 거둠(피해 없음) →
// 검기 = 캐릭터에서 날아가지 않고 칼을 거둔 뒤 범위 안 몬스터마다 그 자리에서 사방으로 베고 지나가는 다단 검기(stab, 굵은 줄·섬광·불꽃), 준비·충전 동안 발밑 앞 부채꼴 범위(drawFlashFan, chargeFx가 그림)
import type Phaser from 'phaser';
import { DEPTH_RATIO } from '@game/shared';
import fx from '../../data/fx.json';
import { colorInt } from '../palette';
import { lookOf } from './branchFx';
import type { Effect, FxLayer } from './layer';
import { clamp01, col, easeOut, ellipseDots, hash, life, px, star4 } from './spellDraw';
import { sparks } from './particles';
import { smear, type SmearShape } from './smear';

const F = fx.flash;

/**
 * 기 모으기 (준비·충전 내내, 매 프레임 chargeFx가 그림): (sx, sy) = 발밑, (hx, hy) = 손, level = 충전 비율 0~1, now = 초.
 * 바람 줄(streaks[0] → [1]개)이 손 둘레 from[0] → [1] px에서 cycle초마다 swirl 바퀴 돌며 손으로 빨려듦(충전할수록 넓고 많게),
 * 손 둘레 from px에 옅은 하늘 점선, 발밑 금빛 점선 고리가 ring[0] → [1] px에서 ringSec마다 안으로 줄어들기를 되풀이, 손 별이 충전할수록 커짐(tipStar px까지)
 */
export function drawFlashGather(g: Phaser.GameObjects.Graphics, sx: number, sy: number, hx: number, hy: number, facing: number, level: number, now: number): void {
  const G0 = F.gather, { white, gold, sky } = col(), lerp = (v: number[]) => v[0]! + (v[1]! - v[0]!) * level;
  const n = Math.round(lerp(G0.streaks)), from = lerp(G0.from);
  for (let i = 0; i < n; i++) {
    const t = (now / G0.cycle + hash(i * 7.3)) % 1, r = from * (1 - t ** 1.4);
    const th = (i / n) * Math.PI * 2 + t * G0.swirl * Math.PI * 2 * -facing;
    for (let j = 0; j < G0.tail; j++) {
      const tt = th + j * 0.12 * facing, rr = r + j * 1.5;
      const x = hx + Math.cos(tt) * rr, y = hy + Math.sin(tt) * rr * 0.6, a = clamp01(t * 3) * (1 - j / G0.tail);
      px(g, x, y, j === 0 ? white : sky, a);
      if (j < 2) px(g, x, y + 1, j === 0 ? gold : sky, a);
    }
    if (i % 2 === 0) px(g, hx + Math.cos(th + 1) * r * 0.7, hy + Math.sin(th + 1) * r * 0.42, gold, clamp01(t * 2));
  }
  // 모으는 둘레: 손 둘레 from px 옅은 하늘 점선 (충전할수록 넓어짐)
  ellipseDots(g, hx, hy, from, now * -facing, sky, 0.5, 4);
  const rp = (now / G0.ringSec) % 1;
  ellipseDots(g, sx, sy, lerp(G0.ring) * (1 - rp * 0.7), now * 3 * -facing, gold, clamp01(rp * 3) * clamp01((1 - rp) * 3), 3);
  star4(g, hx, hy, 1 + Math.round(level * G0.tipStar), white, gold, level > 0 ? 1 : 0.6);
}

/**
 * 한 번 베기 (키를 뗀 순간): 캐릭터 앞 초승달 한 번 (검기를 날리지 않음) + 부채꼴(반지름 r 논리 px, angle도) 범위를 아래 변에서 위 변으로 훑는 파란 칼빛.
 * 칼빛 = sec 동안 아래(앞쪽 깊이) → 위로 도는 반지름 줄(흰 심 → 하늘, 끝에 별) + 뒤로 trail줄(step도 간격) 잔광이 하늘 → 진한 하늘로 옅어짐, 테두리 호도 따라 빛남
 */
export function flashSlash(sx: number, sy: number, facing: number, r: number, angle: number): Effect[] {
  const W = F.sweep, { white, sky, deep } = col(), half = (angle / 2) * (Math.PI / 180), step = (W.step * Math.PI) / 180;
  const at = (q: number, d: number) => ({ x: sx + Math.cos(q) * d * facing, y: sy + Math.sin(q) * d * DEPTH_RATIO });
  const sweep: Effect = {
    ...life(W.sec),
    draw(g, k) {
      const t = easeOut(Math.min(1, (1 - k) / W.pass)), q0 = half - 2 * half * t, fade = clamp01(k / (1 - W.pass));
      for (let i = W.trail; i >= 0; i--) {
        const q = q0 + i * step;
        if (q > half) continue;
        const a = (1 - i / (W.trail + 1)) * fade, c = i === 0 ? white : i < W.trail / 2 ? sky : deep;
        for (let d = W.from; d <= r; d += i === 0 ? 1 : 2) { const p = at(q, d); px(g, p.x, p.y, c, a); }
        const tip = at(q, r);
        px(g, tip.x, tip.y, i === 0 ? white : sky, a);
      }
      // 칼빛이 지나간 테두리 호
      const n = Math.max(6, Math.round(2 * half * r));
      for (let i = 0; i <= n; i++) {
        const q = -half + (2 * half * i) / n;
        if (q < q0) continue;
        const p = at(q, r);
        px(g, p.x, p.y, sky, fade * 0.8);
      }
      if (t < 1) { const tip = at(q0, r); star4(g, tip.x, tip.y, W.star, white, sky); }
    },
  };
  return [smear(sx, sy, facing, F.slash as SmearShape, 'heavy'), sweep];
}

/**
 * 검기 베기: 맞은 몬스터 몸(sx, sy = 몸 기준 화면 좌표)을 사방(판정마다 다른 각도)에서 굵은 검기 lines줄(지금 1줄, 여러 줄이면 간격 gap px)이 베고 지나감.
 * 줄은 2px(흰 심 + 금 옆줄), 조금씩 늦게(lag) 한쪽 끝에서 다른 쪽 끝으로 지나가고(흰 머리 → 금 → 어두운 금 꼬리) 꼬리부터 사라짐.
 * 지나가는 순간 가운데 흰 섬광 + 별, 베인 자리에 짧은 불꽃 sparks개. big = 첫 판정 (더 길고 별 크게)
 */
export function flashStab(sx: number, sy: number, seed: number, big: boolean): Effect[] {
  const S = F.stab, { white, gold } = col(), edge = colorInt('global.fx.smearEdge');
  const th = hash(seed) * Math.PI * 2, n = big ? S.bigLen : S.len, lines = S.lines;
  const dx = Math.cos(th), dy = Math.sin(th) * 0.8, nx = -dy, ny = dx, y = sy + S.y;
  const ox = Math.round((hash(seed * 2.9) - 0.5) * S.jitter), oy = Math.round((hash(seed * 3.7) - 0.5) * S.jitter);
  const cut: Effect = {
    ...life(S.sec),
    draw(g, k) {
      const e = 1 - k, a = clamp01(k * 1.8);
      for (let l = 0; l < lines; l++) {
        const off = (l - (lines - 1) / 2) * S.gap, t = clamp01((e - l * S.lag) / (1 - (lines - 1) * S.lag));
        const grow = Math.min(1, t / S.pass), from = -n + Math.round(2 * n * Math.max(0, t - S.pass) / (1 - S.pass)), to = -n + Math.round(2 * n * grow);
        if (t <= 0) continue;
        for (let j = from; j <= to; j++) {
          const lead = to - j < 3 && grow < 1, mid = Math.abs(j) < n * 0.7;
          const x = sx + ox + dx * j + nx * off, yy = y + oy + dy * j + ny * off;
          px(g, x, yy, lead || t < 0.35 ? white : mid ? gold : edge, a);
          if (mid || lead) px(g, x + nx, yy + ny, lead || t < 0.25 ? white : gold, a);
        }
      }
      if (e < S.flashAt) {
        star4(g, sx + ox, y + oy, big ? S.star[1]! : S.star[0]!, white, gold, a);
        px(g, sx + ox + 1, y + oy + 1, white, a); px(g, sx + ox - 1, y + oy - 1, white, a);
      }
    },
  };
  return [cut, ...sparks(sx + ox, y + oy).slice(0, big ? S.sparks[1] : S.sparks[0])];
}

/** 일섬 검기 다단(가벼운 판정)인가: 몬스터 흰 번쩍임을 빼서 긁는 검기가 가려지지 않게 (첫 판정·이중 일섬·반환은 번쩍임) */
export const quietFlashTick = (id: string | undefined, big: boolean): boolean => !big && !!id && lookOf(id) === 'flash';

/** 일섬 적중(첫 판정·칼바람·이중 일섬·반환)이면 맞은 몬스터 몸에 검기 박힘. (sx, sy) = 몸 기준 화면 좌표, seed = 판정마다 다른 값 */
export function flashHit(layer: Pick<FxLayer, 'add'>, id: string | undefined, sx: number, sy: number, seed: number, big: boolean): void {
  if (id && lookOf(id) === 'flash') flashStab(sx, sy, seed, big).forEach((e) => layer.add(e));
}

/**
 * 일섬 범위: 준비·충전 동안 발밑 앞 부채꼴(반지름 r = 논리 px, angle도) 테두리. 바닥 층에 매 프레임 (chargeFx).
 * 둥근 테두리는 도는 금 점선, 양옆 변은 안에서 바깥으로 흐르는 금 점(2px), 안은 옅은 금 호, 충전 중이면 테두리·변 끝이 흰색
 */
export function drawFlashFan(g: Phaser.GameObjects.Graphics, sx: number, sy: number, facing: number, r: number, angle: number, grow: number, now: number): void {
  const R = F.fan, { white, gold } = col();
  const half = (angle / 2) * (Math.PI / 180), at = (q: number, d: number) => ({ x: sx + Math.cos(q) * d * facing, y: sy + Math.sin(q) * d * DEPTH_RATIO });
  const flow = (now * R.flow) % R.every;
  // 둥근 테두리
  const n = Math.max(8, Math.round(2 * half * r));
  for (let i = 0; i <= n; i++) {
    const q = -half + (2 * half * i) / n, p = at(q, r);
    if ((i + Math.round(now * R.spin)) % R.every < R.every - 1) px(g, p.x, p.y, grow > 0 ? white : gold, R.alpha);
  }
  // 양옆 변: 안에서 바깥으로 흐르는 점
  for (const q of [-half, half]) {
    for (let d = flow; d <= r; d += R.every) {
      const p = at(q, d);
      px(g, p.x, p.y, grow > 0 && d > r * 0.6 ? white : gold, R.alpha);
      px(g, p.x + facing, p.y, gold, R.alpha * 0.6);
    }
  }
  // 안: 옅은 바둑판 (반지름 링마다)
  for (let d = R.ring; d < r; d += R.ring) {
    const m = Math.max(4, Math.round(2 * half * d / 3));
    for (let i = 0; i <= m; i++) {
      const p = at(-half + (2 * half * i) / m, d);
      px(g, p.x, p.y, gold, R.inner);
    }
  }
}
