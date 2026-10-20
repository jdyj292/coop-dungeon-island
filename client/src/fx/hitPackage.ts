// 타격 패키지: 적중 프레임에 히트스톱·흔들림·번쩍임·섬광·숫자를 한꺼번에 (motion.md 3장)
import { gradeTiming, type FxGrade } from '@game/shared';
import fx from '../../data/fx.json';
import { damageNumber } from './damageNumber';
import type { FxLayer } from './layer';
import { sparks, star } from './particles';
import type { HitStop, Shake, ShakeDir } from './timing';

export interface FxContext {
  layer: FxLayer;
  stop: HitStop;
  shake: Shake;
}

/** 번쩍임을 받는 대상 (남은 시간, 게임 시간으로 줄어든다) */
export interface Flashable {
  flash: number;
}

export interface HitPoint {
  /** 타격 섬광 위치 (화면 좌표) */
  x: number;
  y: number;
  /** 숫자 위치 (대상 머리 위) */
  numberX: number;
  numberY: number;
}

export function hitPackage(
  ctx: FxContext, grade: FxGrade, target: Flashable, point: HitPoint, damage: number, shakeDir?: ShakeDir,
): void {
  const t = gradeTiming(grade);
  ctx.stop.stop(t.hitstop);
  ctx.shake.start(t.shakeSec, t.shakePx, shakeDir);
  target.flash = fx.flashFrames[grade] * fx.frame;
  ctx.layer.add(star(point.x, point.y, grade));
  sparks(point.x, point.y).forEach((e) => ctx.layer.add(e));
  ctx.layer.add(damageNumber(damage, point.numberX, point.numberY, grade));
}
