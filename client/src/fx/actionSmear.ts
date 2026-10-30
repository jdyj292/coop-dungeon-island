// 행동 active 진입 때의 무기 스미어 (motion.md 2장): 찌르기 행동은 직선 스미어 + 출발 먼지, 나머지는 포즈 모양의 초승달.
// 땅을 내려치는 행동은 균열·충격 링·먼지를 더한다 (groundImpact, 부채꼴 판정이면 부채꼴 균열). 뒤쪽까지 베는 판정은 등 뒤 스미어.
// 계열 근접 스킬(fx.json branch.looks)은 자기 그림: 회전베기·어깨 들이받기는 캐릭터를 따라감, 발도는 출발 자리에서 한 줄
import { type ActionDef, type FxGrade } from '@game/shared';
import fx from '../../data/fx.json';
import { drawSlash, lookOf, shoulder, whirl } from './branchFx';
import { groundImpact, isGroundImpact } from './groundImpact';
import type { FxLayer } from './layer';
import { dust } from './particles';
import { smear, smearShape } from './smear';
import { isThrust, thrust } from './thrust';

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
  if (look === 'draw') {
    layer.add(drawSlash(sx, sy, facing, def));
    dust(sx, sy, fx.smear.thrust.dust).forEach((e) => layer.add(e));
    return;
  }
  if (isThrust(def.id)) {
    layer.add(thrust(foot, grade));
    dust(sx, sy, fx.smear.thrust.dust).forEach((e) => layer.add(e));
    return;
  }
  if (isGroundImpact(def.id)) {
    const a = def.area, fan = a?.shape === 'fan' && a.radius && a.angle ? { radius: a.radius, angle: a.angle } : undefined;
    groundImpact(sx, sy, facing, fan).forEach((e) => layer.add(e));
  }
  const shape = smearShape(def.poses?.active ?? '');
  if (shape) layer.add(smear(sx, sy, facing, shape, grade));
  // 뒤쪽까지 베는 판정(변형 검풍): 등 뒤로 거울 스미어 + 뒤쪽 끝에 바람 먼지
  const back = def.hitbox?.back;
  if (shape && back) {
    layer.add(smear(sx, sy, -facing, shape, fx.smear.wind.grade as FxGrade));
    dust(sx - back * facing, sy, fx.smear.wind.dust).forEach((e) => layer.add(e));
  }
}
