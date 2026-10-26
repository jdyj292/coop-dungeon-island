// 온라인 무대의 상태 변화 연출 (onlineStage에서 분리): 플레이어 cue = 소리·스미어·마법(spellCast)·순간이동·다운 먼지,
// 몬스터 cue = 예고·공격 소리, 다운 먼지·충격 링·흔들림, 어지러움·그로기 (docs/network.md 8장, motion.md)
import type { ActionDef, PlayerState, WeaponDef } from '@game/shared';
import fx from '../../data/fx.json';
import { sfx } from '../audio/player';
import { actionSmear } from '../fx/actionSmear';
import type { FxContext } from '../fx/hitPackage';
import { dust, ring } from '../fx/particles';
import { teleportPuff } from '../fx/spell';
import { castActive, castStart } from '../fx/spellCast';
import type { Cue } from '../net/transitions';
import { project } from '../view/layout';
import type { PlayerView } from '../view/playerView';

function dustAt(c: FxContext, x: number, y: number, kind: typeof fx.dust.down): void {
  const { sx, sy } = project(x, y);
  dust(sx, sy, kind).forEach((d) => c.layer.add(d));
}

/** mine = 내 캐릭터 (달리기 소리·다운 흔들림은 나만), w = 그 사람 무기 */
export function playerCue(c: FxContext, view: PlayerView, p: PlayerState, q: Cue, mine: boolean, w: WeaponDef): void {
  // 플레이어 cue의 def는 항상 플레이어 행동
  const caster = { x: p.pos.x, y: p.pos.y, facing: p.facing };
  if (q.type === 'actionStart') {
    if (q.def.sfx?.windup) sfx.play(q.def.sfx.windup);
    castStart(c.layer, w, q.def as ActionDef, caster);
  }
  if (q.type === 'actionActive') {
    if (q.def.sfx?.active) sfx.play(q.def.sfx.active);
    actionSmear(c.layer, q.def as ActionDef, () => ({ ...project(p.pos.x, p.pos.y), facing: p.facing }));
    castActive(c.layer, w, q.def as ActionDef, caster);
  }
  if (q.type !== 'enter') return;
  // 순간이동 백스텝: 사라지는 자리·나타나는 자리에 하늘색 점 (스태프)
  if (view.teleport && (q.state === 'backstep' || q.from === 'backstep')) {
    const { sx, sy } = project(p.pos.x, p.pos.y);
    teleportPuff(sx, sy - fx.spell.bolt.height).forEach((e) => c.layer.add(e));
  }
  if (q.state === 'backstep') sfx.play('backstep');
  if (q.state === 'run' && mine) sfx.play('dash');
  if (q.state === 'down') {
    dustAt(c, p.pos.x, p.pos.y, fx.dust.down);
    if (mine) c.shake.start(fx.downShake.sec, fx.downShake.px);
  }
  if (q.from === 'down') view.onGetup();
}

export function monsterCue(c: FxContext, b: { x: number; y: number }, q: Cue): void {
  if (q.type === 'actionStart' && q.def.sfx?.windup) sfx.play(q.def.sfx.windup);
  if (q.type === 'actionActive' && q.def.sfx?.active) sfx.play(q.def.sfx.active);
  if (q.type !== 'enter') return;
  if (q.state === 'down') {
    sfx.play('down');
    dustAt(c, b.x, b.y, fx.dust.down);
    const { sx, sy } = project(b.x, b.y);
    c.layer.add(ring(sx, sy));
    c.shake.start(fx.downShake.sec, fx.downShake.px);
  }
  if (q.state === 'groggy' || q.state === 'dizzy') {
    if (q.state === 'groggy') sfx.play('mon_bear_roar');
    dustAt(c, b.x, b.y, fx.dust.down);
    c.shake.start(fx.downShake.sec, fx.downShake.px);
  }
}
