// 행동 → 마법 연출 연결 (MVP 보충 ST-2a). 무엇을 그릴지는 데이터로 고른다:
// 포즈 fx(poses.json: ready = spark, bolt = bolt, area·plant = circle) + 행동 판정(area 원 = 화염 폭발, status freeze = 얼음 장판)
import { areaCenter, type ActionDef, type WeaponDef } from '@game/shared';
import { spriteData } from '../sprites/data';
import { project } from '../view/layout';
import type { FxLayer } from './layer';
import { magicCircle, muzzle, spark } from './spell';
import { fireBurst, fireTarget } from './spellFire';
import { iceField } from './spellIce';

/** 시전자 (논리 좌표) */
export interface Caster {
  x: number;
  y: number;
  facing: number;
}

/** 포즈의 fx (스프라이트 좌표 at, 발밑 = base.foot) → 화면 위치 */
function poseFx(weapon: WeaponDef, pose: string | undefined, c: Caster): { type: string; x: number; y: number } | null {
  const data = spriteData(), set = data.poses.weapons[weapon.poseSet];
  const f = pose ? (set?.[pose]?.fx as { type?: string; at?: [number, number] } | undefined) : undefined;
  if (!f?.type || !f.at) return null;
  const { sx, sy } = project(c.x, c.y), [fx0, fy0] = data.base.foot;
  return { type: f.type, x: sx + (f.at[0] - fx0) * c.facing, y: sy + (f.at[1] - fy0) };
}

/** 마법 행동인가 (active 포즈가 bolt·circle 이펙트) */
const isSpell = (weapon: WeaponDef, def: ActionDef, c: Caster) => {
  const t = poseFx(weapon, def.poses?.active, c)?.type;
  return t === 'bolt' || t === 'circle';
};

/** 준비 시작: 준비 시간 동안 보석으로 빛 모으기, 지연 원형 마법이면 바닥 표적 (준비 시간 동안) */
export function castStart(layer: FxLayer, weapon: WeaponDef, def: ActionDef, c: Caster): void {
  const w = poseFx(weapon, def.poses?.windup, c);
  if (w?.type === 'spark') layer.add(spark(w.x, w.y, def.phases.windup));
  if (def.area?.shape === 'circle' && isSpell(weapon, def, c)) {
    const at = areaCenter(c, def.area.at), { sx, sy } = project(at.x, at.y);
    layer.add(fireTarget(sx, sy, def.area.radius!, def.phases.windup));
  }
}

/** active 순간: 발사 섬광·마법진, 화염 폭발·얼음 장판 */
export function castActive(layer: FxLayer, weapon: WeaponDef, def: ActionDef, c: Caster): void {
  const a = poseFx(weapon, def.poses?.active, c);
  if (a?.type === 'bolt') layer.add(muzzle(a.x, a.y));
  if (a?.type === 'circle') layer.add(magicCircle(a.x, a.y));
  if (!def.area || !isSpell(weapon, def, c)) return;
  const at = areaCenter(c, def.area.at), { sx, sy } = project(at.x, at.y);
  if (def.status?.type === 'freeze') layer.add(iceField(sx, sy, def.area.width ?? 32, def.area.depth ?? 16));
  else if (def.area.shape === 'circle') fireBurst(sx, sy, def.area.radius!).forEach((e) => layer.add(e));
}
