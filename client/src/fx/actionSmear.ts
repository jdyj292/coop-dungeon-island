// 행동 active 진입 때의 무기 스미어 (motion.md 2장): 찌르기 행동은 직선 스미어 + 출발 먼지, 나머지는 포즈 모양의 초승달.
// 땅을 내려치는 행동은 균열·충격 링·먼지를 더한다 (groundImpact, 부채꼴 판정이면 부채꼴 균열, 제자리 원 판정이면 사방 균열). 뒤쪽까지 베는 판정은 등 뒤 스미어.
// 엇갈려 베는 스킬(smear.cross)은 X자 스미어를 더한다.
// 파쇄참·대지붕괴(SK-7)는 tier3Fx, 일섬은 flashFx 그림 (검의 장막은 spellCast → curtainFx). 계열 근접 스킬(fx.json branch.looks)은 자기 그림: 회전베기·어깨 들이받기는 캐릭터를 따라감, 발도는 사라짐·나타남(벤 줄은 늦은 판정 때 spellCast.castEcho), 회오리 검기는 판정 원 자리에서 솟아 반복 내내 나아가는 회오리(cycloneFx), 검기 날리기는 칼끝 섬광 + 포즈 스미어
import { DEPTH_RATIO, type ActionDef, type FxGrade } from '@game/shared';
import fx from '../../data/fx.json';
import { drawVanish, lookOf, shoulder, waveLaunch, whirl } from './branchFx';
import { cyclone } from './cycloneFx';
import { groundImpact, isGroundImpact, isRadialImpact, radialImpact } from './groundImpact';
import type { FxLayer } from './layer';
import { dust } from './particles';
import { smear, smearShape } from './smear';
import { isThrust, thrust } from './thrust';
import { quakeRing } from './tier2Fx';
import { collapsePulse, crushImpact } from './tier3Fx';
import { flashSlash } from './flashFx';

const LAUNCH_DUST = fx.branch.wave.launch.dust;

/** foot = 지금 발 위치(화면)와 방향 (찌르기 스미어는 돌진하는 캐릭터를 따라간다) */
export function actionSmear(layer: FxLayer, def: ActionDef, foot: () => { sx: number; sy: number; facing: number }): void {
  const grade = def.fx?.grade ?? 'light';
  const { sx, sy, facing } = foot();
  const look = lookOf(def.id);
  if (look === 'whirl' || look === 'shoulder') {
    layer.add(look === 'whirl' ? whirl(foot, def) : shoulder(foot, def));
    dust(sx, sy, fx.smear.thrust.dust).forEach((e) => layer.add(e));
    return;
  }
  // 일섬: 앞으로 한 번 베기 + 부채꼴(충전으로 커진 반지름)을 훑는 파란 칼빛 (flashFx, 검기는 적중 때 몬스터마다)
  if (look === 'flash') {
    flashSlash(sx, sy, facing, def.area?.radius ?? 96, def.area?.angle ?? 100).forEach((e) => layer.add(e));
    dust(sx, sy, fx.smear.thrust.dust).forEach((e) => layer.add(e));
    return;
  }
  // 발도: 사라짐·나타남만 (벤 줄 섬광은 늦은 판정 때 castEcho)
  if (look === 'draw') {
    layer.add(drawVanish(sx, sy, facing, def));
    dust(sx, sy, fx.smear.thrust.dust).forEach((e) => layer.add(e));
    return;
  }
  // 검기 날리기: 칼끝 섬광·바람 줄 + 발밑 먼지 (그 위에 포즈 스미어)
  if (look === 'wave') {
    layer.add(waveLaunch(sx, sy, facing));
    dust(sx + 6 * facing, sy, LAUNCH_DUST).forEach((e) => layer.add(e));
  }
  if (isThrust(def.id)) {
    layer.add(thrust(foot, grade));
    dust(sx, sy, fx.smear.thrust.dust).forEach((e) => layer.add(e));
    return;
  }
  if (look === 'cyclone' && def.area) {
    // 반복 내내 이어지는 회오리 하나씩 (나란히 도는 copies도), 반복 판정 때는 다시 그리지 않음
    const [ax = 0, ay = 0] = def.area.at ?? [];
    for (const [dx, dy] of [[0, 0], ...(def.repeat?.copies ?? [])] as [number, number][]) {
      layer.add(cyclone(sx + (ax + dx) * facing, sy + Math.round((ay + dy) * DEPTH_RATIO), def.area.radius ?? 16, facing, def));
    }
  }
  // 파쇄참: 칼빛 기둥 + 펼친 균열 + 충격파 + 돌 조각 (판정 폭 = 충전으로 커진 폭)
  if (look === 'crush') crushImpact(sx, sy, facing, def.hitbox?.width ?? 56).forEach((e) => layer.add(e));
  // 대지붕괴 첫 판정: 판정 자리에 돌 조각 (깨진 땅 장판은 castActive가 바닥 층에)
  if (look === 'collapse' && def.area) {
    const [ax = 0, ay = 0] = def.area.at ?? [];
    collapsePulse(sx + ax * facing, sy + Math.round(ay * DEPTH_RATIO), def.area.width ?? 64, def.area.depth ?? 32, 0).forEach((e) => layer.add(e));
  }
  if (isGroundImpact(def.id)) {
    const a = def.area, fan = a?.shape === 'fan' && a.radius && a.angle ? { radius: a.radius, angle: a.angle } : undefined;
    groundImpact(sx, sy, facing, fan).forEach((e) => layer.add(e));
  }
  if (isRadialImpact(def.id)) {
    const r = def.area?.radius ?? 32;
    radialImpact(sx, sy, facing, r).forEach((e) => layer.add(e));
    layer.add(quakeRing(sx, sy, r));
  }
  const shape = smearShape(def.poses?.active ?? '');
  if (shape) layer.add(smear(sx, sy, facing, shape, grade));
  // 엇갈려 베기(검흔 베기): 포즈 스미어 위에 X자 스미어
  if (fx.smear.cross.actions.includes(def.id)) {
    for (const name of fx.smear.cross.shapes) {
      const s = smearShape(name);
      if (s) layer.add(smear(sx, sy, facing, s, grade));
    }
  }
  // 뒤쪽까지 베는 판정(변형 검풍): 등 뒤로 거울 스미어 + 뒤쪽 끝에 바람 먼지
  const back = def.hitbox?.back;
  if (shape && back) {
    layer.add(smear(sx, sy, -facing, shape, fx.smear.wind.grade as FxGrade));
    dust(sx - back * facing, sy, fx.smear.wind.dust).forEach((e) => layer.add(e));
  }
}
