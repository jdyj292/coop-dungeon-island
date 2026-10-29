// 행동 active 진입 때의 무기 스미어 (motion.md 2장): 찌르기 행동은 직선 스미어 + 출발 먼지, 나머지는 포즈 모양의 초승달.
// 땅을 내려치는 행동은 균열·충격 링·먼지를 더한다 (groundImpact)
import { type ActionDef } from '@game/shared';
import fx from '../../data/fx.json';
import { groundImpact, isGroundImpact } from './groundImpact';
import type { FxLayer } from './layer';
import { dust } from './particles';
import { smear, smearShape } from './smear';
import { isThrust, thrust } from './thrust';

/** foot = 지금 발 위치(화면)와 방향 (찌르기 스미어는 돌진하는 캐릭터를 따라간다) */
export function actionSmear(layer: FxLayer, def: ActionDef, foot: () => { sx: number; sy: number; facing: number }): void {
  const grade = def.fx?.grade ?? 'light';
  const { sx, sy, facing } = foot();
  if (isThrust(def.id)) {
    layer.add(thrust(foot, grade));
    dust(sx, sy, fx.smear.thrust.dust).forEach((e) => layer.add(e));
    return;
  }
  if (isGroundImpact(def.id)) groundImpact(sx, sy, facing).forEach((e) => layer.add(e));
  const shape = smearShape(def.poses?.active ?? '');
  if (shape) layer.add(smear(sx, sy, facing, shape, grade));
}
