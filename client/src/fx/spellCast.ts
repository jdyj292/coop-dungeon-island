// 행동 → 마법 연출 연결 (MVP 보충 ST-2a). 무엇을 그릴지는 데이터로 고른다:
// 포즈 fx(poses.json: ready = spark, bolt = bolt, area·plant = circle) + 행동 판정(area 원 = 화염 폭발, status freeze = 얼음 장판, slow = 동토 장판).
// 계열 스킬(fx.json branch.looks: 불꽃 기둥·부유 구슬·끌어올림)은 원 판정 자리에 자기 그림 (spellBranch), 반복 판정마다 하나씩
import { areaCenter, type ActionDef, type WeaponDef } from '@game/shared';
import { spriteData } from '../sprites/data';
import { project } from '../view/layout';
import fx from '../../data/fx.json';
import type { FxContext } from './hitPackage';
import type { Effect } from './layer';
import { dust, ring } from './particles';
import { lookOf } from './branchFx';
import { boltHit, magicCircle, muzzle, spark } from './spell';
import { firePillar, floatOrb, liftUp } from './spellBranch';
import { fireBurst, fireTarget } from './spellFire';
import { iceField, slowField } from './spellIce';

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

/** 이펙트 층: layer = 캐릭터 위, ground = 바닥(마법진·범위 표시·장판, 캐릭터·몬스터 아래) */
type Layers = Pick<FxContext, 'layer' | 'ground'>;

const AREA_LOOKS: Record<string, (x: number, y: number, r: number) => Effect> = { pillar: firePillar, orb: floatOrb, lift: liftUp };

/** 원 판정 자리 그림: 계열 스킬이면 그 그림, 아니면 화염 폭발 */
function areaBurst(layer: Layers['layer'], def: ActionDef, c: Caster): void {
  const at = areaCenter(c, def.area!.at), { sx, sy } = project(at.x, at.y), look = AREA_LOOKS[lookOf(def.id) ?? ''];
  if (look) layer.add(look(sx, sy, def.area!.radius!));
  else fireBurst(sx, sy, def.area!.radius!).forEach((e) => layer.add(e));
}

/** 준비 시작: 준비 시간 동안 보석으로 빛 모으기, 지연 원형 마법이면 바닥 표적 (준비 시간 동안) */
export function castStart(fxl: Layers, weapon: WeaponDef, def: ActionDef, c: Caster): void {
  const w = poseFx(weapon, def.poses?.windup, c);
  if (w?.type === 'spark') fxl.layer.add(spark(w.x, w.y, def.phases.windup));
  if (def.area?.shape === 'circle' && isSpell(weapon, def, c)) {
    const at = areaCenter(c, def.area.at), { sx, sy } = project(at.x, at.y);
    fxl.ground.add(fireTarget(sx, sy, def.area.radius!, def.phases.windup));
  }
}

/** active 순간: 발사 섬광·마법진, 화염 폭발·얼음 장판 */
export function castActive(fxl: Layers, weapon: WeaponDef, def: ActionDef, c: Caster): void {
  const a = poseFx(weapon, def.poses?.active, c);
  if (a?.type === 'bolt') fxl.layer.add(muzzle(a.x, a.y));
  if (a?.type === 'circle') fxl.ground.add(magicCircle(a.x, a.y));
  if (!def.area || !isSpell(weapon, def, c)) return;
  const at = areaCenter(c, def.area.at), { sx, sy } = project(at.x, at.y);
  if (def.status?.type === 'freeze') fxl.ground.add(iceField(sx, sy, def.area.width ?? 32, def.area.depth ?? 16));
  else if (def.status?.type === 'slow') fxl.ground.add(slowField(sx, sy, def.area.width ?? 32, def.area.depth ?? 16));
  else if (def.area.shape === 'circle') areaBurst(fxl.layer, def, c);
}

/**
 * 변형 예약 판정 순간 (반복·후속·해제, shared sim/skillExtras.ts): 새 그림 없이 기존 이펙트를 그 자리에.
 * 해제(빙결 폭발) = 마법탄 적중 섬광, 원형 마법(연쇄) = 화염 폭발, 근접 판정(균열) = 판정 줄을 따라 먼지·충격 링·흔들림
 */
export function castEcho(c: Pick<FxContext, 'layer' | 'shake'>, kind: 'repeat' | 'after' | 'shatter', def: ActionDef, at: Caster): void {
  if (kind === 'shatter') {
    const { sx, sy } = project(at.x, at.y, fx.spell.bolt.height);
    c.layer.add(boltHit(sx, sy));
    return;
  }
  if (def.area?.shape === 'circle') {
    areaBurst(c.layer, def, at);
    return;
  }
  const box = def.hitbox;
  if (!box) return;
  for (let d = box.forward; d <= box.forward + box.width; d += 16) {
    const { sx, sy } = project(at.x + d * at.facing, at.y);
    dust(sx, sy, fx.dust.bounce).forEach((e) => c.layer.add(e));
  }
  const mid = project(at.x + (box.forward + box.width / 2) * at.facing, at.y);
  c.layer.add(ring(mid.sx, mid.sy));
  c.shake.start(fx.downShake.sec, fx.downShake.px);
}
