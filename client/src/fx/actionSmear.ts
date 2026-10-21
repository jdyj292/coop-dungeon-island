// 행동 active 진입 때의 무기 스미어 (motion.md 2장): 찌르기 행동은 직선 스미어, 나머지는 포즈 모양의 초승달
import { type ActionDef } from '@game/shared';
import fx from '../../data/fx.json';
import type { FxLayer } from './layer';
import { smear, smearShape } from './smear';
import { isThrust, thrust } from './thrust';

/** foot = 지금 발 위치(화면)와 방향 (찌르기 스미어는 돌진하는 캐릭터를 따라간다) */
export function actionSmear(layer: FxLayer, def: ActionDef, foot: () => { sx: number; sy: number; facing: number }): void {
  const grade = def.fx?.grade ?? 'light';
  if (isThrust(def.id)) {
    layer.add(thrust(foot, grade));
    return;
  }
  const shape = smearShape(def.poses?.active ?? '');
  if (!shape) return;
  const { sx, sy, facing } = foot();
  const [cx, cy] = fx.smear.center as [number, number];
  layer.add(smear(sx + cx * facing, sy + cy, facing, shape, grade));
}
