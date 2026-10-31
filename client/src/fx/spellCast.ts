// 행동 → 마법 연출 연결 (MVP 보충 ST-2a). 무엇을 그릴지는 데이터로 고른다:
// 포즈 fx(poses.json: ready·gather·skyRaise 등 준비 = spark, bolt·thrust = bolt, area·channel = circle, plantDeep = stamp) + 행동 판정(area 원 = 화염 폭발, status freeze = 얼음 장판, slow = 동토 장판).
// 계열 스킬(fx.json branch.looks: 불꽃 기둥·부유 구슬·끌어올림·중력 우물·중력장)은 원 판정 자리에 자기 그림 (spellBranch·spellGravity), 반복 판정마다 하나씩.
// 원형 마법 준비 표적은 불 속성이면 금색, 아니면 하늘색
import { areaCenter, blastDef, type ActionDef, type EchoLook, type WeaponDef } from '@game/shared';
import { spriteData } from '../sprites/data';
import { project } from '../view/layout';
import fx from '../../data/fx.json';
import type { FxContext } from './hitPackage';
import type { Effect } from './layer';
import { dust, ring, sparks } from './particles';
import { cyclone, lookOf } from './branchFx';
import { boltHit, magicCircle, muzzle, spark, stampImpact } from './spell';
import { firePillar, floatOrb, liftUp } from './spellBranch';
import { fireBurst, fireTarget } from './spellFire';
import { gravField, gravityWell } from './spellGravity';
import { iceField, slowField } from './spellIce';
import { chainBolt, orbBurst, quakeRing, scarBurst, stickSlash } from './tier2Fx';
import { collapseField, collapsePulse, risePillars } from './tier3Fx';

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

/** 마법 행동인가 (active 포즈가 bolt·circle·stamp 이펙트) */
const isSpell = (weapon: WeaponDef, def: ActionDef, c: Caster) => {
  const t = poseFx(weapon, def.poses?.active, c)?.type;
  return t === 'bolt' || t === 'circle' || t === 'stamp';
};

/** 이펙트 층: layer = 캐릭터 위, ground = 바닥(마법진·범위 표시·장판, 캐릭터·몬스터 아래) */
type Layers = Pick<FxContext, 'layer' | 'ground'>;

const AREA_LOOKS: Record<string, (x: number, y: number, r: number) => Effect> = { pillar: firePillar, orb: floatOrb, lift: liftUp, well: gravityWell, gravfield: gravField, cyclone: (x, y, r) => cyclone(x, y, r, 1) };

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
    fxl.ground.add(fireTarget(sx, sy, def.area.radius!, def.phases.windup, def.element === 'fire' ? 'fire' : 'magic'));
  }
}

/** active 순간: 발사 섬광·마법진, 화염 폭발·얼음 장판 */
export function castActive(fxl: Layers, weapon: WeaponDef, def: ActionDef, c: Caster): void {
  const a = poseFx(weapon, def.poses?.active, c);
  if (a?.type === 'bolt') fxl.layer.add(muzzle(a.x, a.y));
  if (a?.type === 'circle') fxl.ground.add(magicCircle(a.x, a.y));
  if (a?.type === 'stamp') {
    fxl.ground.add(magicCircle(a.x, a.y));
    fxl.ground.add(stampImpact(a.x, a.y));
    dust(a.x, a.y, fx.spell.stamp.dust).forEach((e) => fxl.layer.add(e));
  }
  // 대지붕괴: 판정 사각형에 반복 시간 동안 깨진 땅 (바닥 층)
  if (lookOf(def.id) === 'collapse' && def.area) {
    const at = areaCenter(c, def.area.at), { sx, sy } = project(at.x, at.y), rep = def.repeat;
    fxl.ground.add(collapseField(sx, sy, def.area.width ?? 64, def.area.depth ?? 32, rep ? rep.count * rep.interval + 0.2 : 0.6));
    return;
  }
  if (!def.area || !isSpell(weapon, def, c)) return;
  const at = areaCenter(c, def.area.at), { sx, sy } = project(at.x, at.y);
  if (def.status?.type === 'freeze') fxl.ground.add(iceField(sx, sy, def.area.width ?? 32, def.area.depth ?? 16));
  else if (def.status?.type === 'slow') fxl.ground.add(slowField(sx, sy, def.area.width ?? 32, def.area.depth ?? 16));
  else if (def.area.shape === 'circle') areaBurst(fxl.layer, def, c);
}

/** 예약 판정 자리 + 전용 그림 (SK-4 2차 look, 번개 줄 시작 자리 from) */
export type EchoAt = Caster & { look?: EchoLook; from?: { x: number; y: number } };

/**
 * 변형 예약 판정 순간 (반복·후속·해제, shared sim/skillExtras.ts): look이 있으면 전용 그림 (tier2Fx), 없으면 기존 이펙트를 그 자리에.
 * 해제(빙결 폭발) = 마법탄 적중 섬광, 원형 마법(연쇄·구슬 반복) = 그 그림 또는 화염 폭발,
 * 근접 판정(균열) = 판정 줄을 따라 먼지·충격 링·흔들림
 */
export function castEcho(c: Pick<FxContext, 'layer' | 'shake'>, kind: 'repeat' | 'after' | 'shatter', skill: ActionDef, at: EchoAt): void {
  const def = skill.projectile?.blast && kind !== 'shatter' ? blastDef(skill) : skill;
  if (at.look && tier2Echo(c, at.look, def, at)) return;
  if (kind === 'shatter') {
    const { sx, sy } = project(at.x, at.y, fx.spell.bolt.height);
    c.layer.add(boltHit(sx, sy));
    return;
  }
  if (lookOf(def.id) === 'collapse' && def.area) {
    const a = areaCenter(at, def.area.at), { sx, sy } = project(a.x, a.y);
    collapsePulse(sx, sy, def.area.width ?? 64, def.area.depth ?? 32, Math.round(at.x + at.y * 7 + performance.now())).forEach((e) => c.layer.add(e));
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

/** 전용 그림 (그렸으면 true) */
function tier2Echo(c: Pick<FxContext, 'layer' | 'shake'>, look: EchoLook, def: ActionDef, at: EchoAt): boolean {
  const { sx, sy } = project(at.x, at.y), r = def.area?.radius ?? 16;
  if (look === 'chain') {
    const f = project(at.from?.x ?? at.x, at.from?.y ?? at.y);
    c.layer.add(chainBolt(f.sx, f.sy, sx, sy));
  } else if (look === 'scar') {
    c.layer.add(scarBurst(sx, sy));
    sparks(sx, sy + fx.tier2.scar.y).slice(0, 4).forEach((e) => c.layer.add(e));
  } else if (look === 'stick') c.layer.add(stickSlash(sx, sy, r, at.facing));
  else if (look === 'quake') {
    c.layer.add(quakeRing(sx, sy, r));
    dust(sx, sy, fx.tier2.quake.dust).forEach((e) => c.layer.add(e));
  } else if (look === 'orbEnd') c.layer.add(orbBurst(sx, sy, r));
  else if (look === 'rise' && def.area) {
    const a = areaCenter(at, def.area.at), p = project(a.x, a.y);
    risePillars(p.sx, p.sy, def.area.width ?? 64, def.area.depth ?? 32).forEach((e) => c.layer.add(e));
    c.shake.start(fx.downShake.sec * 2, fx.downShake.px * 2);
  }
  else if (look === 'blast') {
    fireBurst(sx, sy, r).forEach((e) => c.layer.add(e));
    c.shake.start(fx.downShake.sec, fx.downShake.px);
  } else return false;
  return true;
}
