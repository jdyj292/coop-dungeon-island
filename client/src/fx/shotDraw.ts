// 계열 스킬 투사체 그리기 (SK-2 2차, art.md 7장): 검기 = 세로 초승달(흰 앞 → 금 → 어두운 금) + 뒤 잔상, 얼음 창 = 앞이 뾰족한
// 마름모 창(흰 심줄·하늘·진한 테두리) + 서리 가루. 크기는 행동 projectile.radius (변형 대형이면 커짐). 끝 연출도 그림별로
import type Phaser from 'phaser';
import fx from '../../data/fx.json';
import { colorInt } from '../palette';
import type { FxLayer } from './layer';
import { lookOf } from './branchFx';
import { sparks, star } from './particles';
import { boltFizzle, boltHit } from './spell';
import { col, px } from './spellDraw';

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

/** 이 투사체를 계열 그림으로 그렸으면 true (아니면 BoltLayer가 마법탄으로) */
export function drawShot(g: G, sx: number, sy: number, s: ShotView): boolean {
  const look = s.id && lookOf(s.id);
  if (look === 'wave') swordWave(g, sx, sy + fx.spell.bolt.height, s.dir, s.r ?? 6);
  else if (look === 'lance') iceLance(g, sx, sy, s.dir, s.r ?? 5);
  else return false;
  return true;
}

/** 투사체가 끝난 자리: 검기는 금색 별·불꽃, 나머지는 마법탄 적중 섬광·흩어짐. (sx, sy) = 마법탄 높이 화면 좌표 */
export function shotEnd(layer: FxLayer, id: string | undefined, sx: number, sy: number, hit: boolean): void {
  if (id && lookOf(id) === 'wave') {
    const y = sy + fx.spell.bolt.height - 8;
    if (hit) layer.add(star(sx, y, 'medium'));
    sparks(sx, y).slice(0, hit ? 6 : 3).forEach((e) => layer.add(e));
    return;
  }
  if (hit) layer.add(boltHit(sx, sy));
  else boltFizzle(sx, sy).forEach((e) => layer.add(e));
}
