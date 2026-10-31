// 계열 스킬 투사체 그리기 (SK-2 2차, art.md 7장): 검기 = 세로 초승달(흰 앞 → 금 → 어두운 금) + 뒤 잔상, 얼음 창 = 앞이 뾰족한
// 마름모 창(흰 심줄·하늘·진한 테두리) + 서리 가루. 대검 투척 = 도는 대검, 화염구 = 불덩이 + 불꼬리 (SK-4 2차). 크기는 행동 projectile.radius (변형 대형이면 커짐). 끝 연출도 그림별로
import type Phaser from 'phaser';
import fx from '../../data/fx.json';
import { colorInt } from '../palette';
import type { FxLayer } from './layer';
import { lookOf } from './branchFx';
import { sparks, star } from './particles';
import { boltFizzle, boltHit } from './spell';
import { col, ellipseDots, px } from './spellDraw';
import { fireSparks } from './tier2Fx';

type G = Phaser.GameObjects.Graphics;
const B = fx.branch;

/** 날고 있는 투사체 (화면 그리기용): 행동 id·판정 반지름 */
export interface ShotView {
  x: number;
  y: number;
  dir: number;
  id?: string;
  r?: number;
}

/** 검기: 높이 = r × tall인 세로 초승달, 가운데가 앞으로 bulge만큼 볼록. 잔상은 같은 모양 어두운 금색 바둑판 */
export function swordWave(g: G, sx: number, sy: number, dir: number, r: number): void {
  const W = B.wave, h = Math.round(r * W.tall), cy = sy - h - W.lift;
  const white = colorInt('global.allyFx.white'), gold = colorInt('global.allyFx.gold'), edge = colorInt('global.fx.smearEdge');
  const crescent = (ox: number, a: number, ghost: boolean) => {
    for (let dy = -h; dy <= h; dy++) {
      const f = dy / h, front = Math.round((1 - f * f) * W.bulge * (r / 6)), thick = Math.max(1, Math.round((1 - Math.abs(f)) * 3));
      for (let t = 0; t < thick; t++) px(g, sx + (front - t - ox) * dir, cy + dy, ghost ? edge : t === 0 ? white : t === 1 ? gold : edge, a);
    }
  };
  W.trail.forEach((d, i) => crescent(d, 0.5 - i * 0.2, true));
  crescent(0, 1, false);
}

/** 얼음 창: 길이 r × length, 앞에서 widest 비율 자리가 가장 두꺼움. 뒤로 서리 가루 */
export function iceLance(g: G, sx: number, sy: number, dir: number, r: number): void {
  const L = B.lance, { sky, white, deep } = col(), len = Math.round(r * L.length), w = Math.max(1, r * L.thick);
  const tipX = sx + Math.round(len / 2) * dir;
  for (let d = 0; d <= len; d++) {
    const f = d / len, half = Math.round(f < L.widest ? (w * f) / L.widest : w * (1 - (f - L.widest) / (1 - L.widest)) * 0.6 + 0.4);
    const x = tipX - d * dir;
    for (let o = -half; o <= half; o++) px(g, x, sy + o, Math.abs(o) === half && half > 0 ? deep : o === 0 && f < 0.6 ? white : sky);
  }
  px(g, tipX + dir, sy, white);
  for (let j = 0; j < L.motes; j++) {
    const mx = tipX - (len + 2 + j * 3 + (Math.round(sx) % 3)) * dir, my = sy + (j % 2 ? 1 : -1) * (1 + (j % 2));
    px(g, mx, my, j === 0 ? white : sky, 0.7 - j * 0.2);
  }
}

/** 대검 투척: 공중에서 도는 대검 (날 흰·금, 칼등 어두운 금, 손잡이 어두운 금), 둘레에 납작한 바람 고리. 회전은 이동 거리로 */
export function thrownBlade(g: G, sx: number, sy: number, x: number, dir: number, r: number): void {
  const T = B.throw, { white, gold } = col(), edge = colorInt('global.fx.smearEdge');
  const cy = sy - T.lift, q = x * T.spin * dir, len = Math.round(r * T.blade), cx = Math.cos(q), cyy = Math.sin(q);
  ellipseDots(g, sx, cy, r * T.ring, -q, edge, 0.6, 3);
  // 날: 가운데 흰 심 + 양쪽 금 (끝 2px 흰), 칼등 쪽 어두운 금. 손잡이는 어두운 금 1px, 날밑은 날에 직각으로 3px
  const nx = -cyy, ny = cx * 0.6;
  for (let d = -T.hilt; d <= len; d++) {
    const x0 = sx + cx * d, y0 = cy + cyy * d * 0.6;
    if (d < 0) { px(g, x0, y0, edge); continue; }
    if (d === 0) { for (const o of [-2, -1, 1, 2]) px(g, x0 + nx * o, y0 + ny * o, edge); continue; }
    px(g, x0, y0, d > len - 3 ? white : gold);
    px(g, x0 + nx, y0 + ny, white);
    if (d < len - 1) px(g, x0 - nx, y0 - ny, edge);
  }
  px(g, sx, cy, white);
}

/** 화염구: 불덩이 (흰 심·금·주황빛 금 테두리) + 뒤로 일렁이는 불꼬리, 꼬리 불씨 (분열 조각은 반지름이 작아 작게) */
export function fireball(g: G, sx: number, sy: number, x: number, dir: number, r: number): void {
  const F = B.fireball, { white, gold, amber } = col(), tail = Math.round(r * F.tail), wob = Math.floor(x / 4);
  for (let i = 1; i <= tail; i++) {
    const f = i / tail, half = Math.max(0, Math.round(r * (1 - f) * 0.9)), off = ((wob + i) % 3) - 1;
    for (let o = -half; o <= half; o++) px(g, sx - (r * 0.4 + i) * dir, sy + o + (i > 2 ? off : 0), Math.abs(o) < half * 0.4 ? gold : amber, 1 - f * 0.8);
  }
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const d = Math.hypot(dx, dy);
    if (d <= r) px(g, sx + dx, sy + dy, d <= r * 0.45 ? white : d <= r - 1 ? gold : amber);
  }
  for (let j = 0; j < F.embers; j++) {
    const k = ((x / 3 + j * 5) % 10) / 10;
    px(g, sx - (tail + 2 + j * 3) * dir, sy - Math.round(k * 4) + (j % 2), j ? amber : gold, 0.8 - k);
  }
}

/** 이 투사체를 계열 그림으로 그렸으면 true (아니면 BoltLayer가 마법탄으로) */
export function drawShot(g: G, sx: number, sy: number, s: ShotView): boolean {
  const look = s.id && lookOf(s.id);
  if (look === 'wave') swordWave(g, sx, sy + fx.spell.bolt.height, s.dir, s.r ?? 6);
  else if (look === 'lance') iceLance(g, sx, sy, s.dir, s.r ?? 5);
  else if (look === 'throw') thrownBlade(g, sx, sy + fx.spell.bolt.height, s.x, s.dir, s.r ?? 8);
  else if (look === 'fireball') fireball(g, sx, sy, s.x, s.dir, s.r ?? 9);
  else return false;
  return true;
}

/** 투사체가 끝난 자리: 검기는 금색 별·불꽃, 나머지는 마법탄 적중 섬광·흩어짐. (sx, sy) = 마법탄 높이 화면 좌표 */
export function shotEnd(layer: FxLayer, id: string | undefined, sx: number, sy: number, hit: boolean): void {
  const look = id && lookOf(id);
  if (look === 'wave' || look === 'throw') {
    const y = sy + fx.spell.bolt.height - 8;
    if (hit) layer.add(star(sx, y, 'medium'));
    sparks(sx, y).slice(0, hit ? 6 : 3).forEach((e) => layer.add(e));
    return;
  }
  // 화염구: 폭발이 있는 것은 echo(blast)가 그림, 관통·분열 조각은 작은 불티
  if (look === 'fireball') {
    fireSparks(sx, sy, hit ? 5 : 3).forEach((e) => layer.add(e));
    return;
  }
  if (hit) layer.add(boltHit(sx, sy));
  else boltFizzle(sx, sy).forEach((e) => layer.add(e));
}
