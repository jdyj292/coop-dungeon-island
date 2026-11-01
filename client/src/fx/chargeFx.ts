// 대검 충전 모이는 빛 (SK-3 2차, art.md 7장): 충전하는 동안 손 둘레의 금빛 점이 소용돌이치며 손으로 빨려들고,
// 충전 비율만큼 손 빛이 커진다. 다 차는 순간 큰 별 + 빛살 + 몸 둘레 고리(소리 charge_ready), 다 찬 채 들고 있으면 손 둘레 반짝이.
// 키를 떼는 순간 별, 최대(fullAt 이상)면 큰 별 + 퍼지는 빛살. 충전 중 모이는 소리 charge_gather 반복. 매 프레임 다시 그린다. 값 fx.json chargeGlow.
// 일섬은 준비·충전 동안 발밑 앞 부채꼴 범위(충전한 만큼 커짐, 바닥 층, flashFx.drawFlashFan)와 기 모으기 바람(drawFlashGather)도
import type Phaser from 'phaser';
import { fighterPose, phaseAt, type PlayerState, type WeaponDef } from '@game/shared';
import fx from '../../data/fx.json';
import { spriteData } from '../sprites/data';
import { project } from '../view/layout';
import { lookOf } from './branchFx';
import { drawCurtainCharge } from './curtainFx';
import { drawFlashFan, drawFlashGather } from './flashFx';
import { FX_GROUND_DEPTH } from './layer';
import { clamp01, col, hash, px, star4 } from './spellDraw';

/** 캐릭터 위 (상태 표시와 같은 층) */
const DEPTH = 4050;
const C = fx.chargeGlow;

/** 그릴 플레이어 (논리 좌표). level = 충전 비율 0~1 (0 = 충전 아님), pose = 지금 포즈 이름 */
export interface ChargeView {
  id: string;
  x: number;
  y: number;
  facing: number;
  level: number;
  weapon: WeaponDef;
  pose: string | null;
  /** 충전 단계 수 (파쇄참 3단 충전 = 3, 보통 1): 단계마다 손 둘레를 도는 금빛 점 + 소리 charge_stage */
  stages: number;
  /** 일섬 준비·충전 중: 지금 부채꼴 범위 (반지름 논리 px = 기본 × (1 + 충전 비율 × 최대 보너스), 각도 도), 기 모으는 손 = 준비 포즈 앞손 */
  fan?: { radius: number; angle: number; pose: string | null };
  /** 검의 장막 준비·충전 중: 지금 둘레 범위·최대 충전 범위 (반지름 논리 px) */
  ring?: { radius: number; max: number };
}

/** 플레이어 상태 → 그릴 것 (충전 중이 아니면 level 0). level = 충전 비율 (본인 chargeLevel, 다른 사람은 서버 chargeLv) */
export function chargeView(id: string, p: PlayerState, weapon: WeaponDef, level: number): ChargeView {
  const run = p.fighter.run, stages = run?.def.chargeRule?.stages ?? 1;
  const area = run?.def.area, tr = weapon.trait;
  const bonus = tr?.type === 'charge' ? tr.bonusMax + (p.perks?.chargeBonusAdd ?? 0) : 0;
  const fan = run && area?.shape === 'fan' && lookOf(run.def.id) === 'flash' && phaseAt(run.def, run.t) === 'windup'
    ? { radius: area.radius! * (1 + level * bonus), angle: area.angle!, pose: run.def.poses?.windup ?? null } : undefined;
  const ring = run && area?.shape === 'circle' && lookOf(run.def.id) === 'curtain' && phaseAt(run.def, run.t) === 'windup'
    ? { radius: area.radius! * (1 + level * bonus), max: area.radius! * (1 + bonus) } : undefined;
  return { id, x: p.pos.x, y: p.pos.y, facing: p.facing, level, weapon, pose: fighterPose(p.fighter), stages, fan, ring };
}

interface Burst {
  x: number;
  y: number;
  left: number;
  full: boolean;
  /** 다 차는 순간 (몸 둘레 고리, 발밑 화면 위치) */
  ready?: { fx: number; fy: number };
}

/** 지난 프레임 충전 상태: 비율·손 위치(떼는 순간 별 자리)·단계·다음 모이는 소리까지 남은 초 */
interface Last {
  level: number;
  x: number;
  y: number;
  stage?: number;
  gather: number;
}

/** 포즈 앞손 → 화면 위치 (발밑 = base.foot, 포즈 bob만큼 아래) */
export function handAt(v: Pick<ChargeView, 'x' | 'y' | 'facing' | 'weapon' | 'pose'>): { x: number; y: number } {
  const data = spriteData(), pose = v.pose ? data.poses.weapons[v.weapon.poseSet]?.[v.pose] : undefined;
  const [hx, hy] = pose?.front?.hand ?? data.base.foot, [fx0, fy0] = data.base.foot;
  const { sx, sy } = project(v.x, v.y);
  return { x: sx + (hx - fx0) * v.facing, y: sy + (hy - fy0) + (pose?.body?.bob ?? 0) };
}

export class ChargeLayer {
  private g: Phaser.GameObjects.Graphics;
  /** 바닥 층 (일섬 부채꼴 범위) */
  private ground: Phaser.GameObjects.Graphics;
  /** 지난 프레임 충전 비율·손 위치 (떼는 순간 별 자리) */
  private last = new Map<string, Last>();
  private bursts: Burst[] = [];

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(DEPTH);
    this.ground = scene.add.graphics().setDepth(FX_GROUND_DEPTH);
  }

  /** dt = 지난 그리기 뒤 흐른 초. 반환 = 낼 소리 (충전 시작 charge_start, 충전 중 charge_gather, 다 참 charge_ready, 최대 충전으로 발동 charge_full) */
  draw(views: ChargeView[], dt: number): string[] {
    const g = this.g, now = performance.now() / 1000, cues: string[] = [];
    g.clear();
    this.ground.clear();
    const seen = new Set<string>();
    for (const v of views) {
      seen.add(v.id);
      if (v.fan) {
        const { sx, sy } = project(v.x, v.y), h = handAt({ ...v, pose: v.fan.pose });
        drawFlashFan(this.ground, sx, sy, v.facing, v.fan.radius, v.fan.angle, v.level, now);
        drawFlashGather(g, sx, sy, h.x, h.y, v.facing, v.level, now);
      }
      if (v.ring) {
        const { sx, sy } = project(v.x, v.y);
        drawCurtainCharge(this.ground, sx, sy, v.ring.radius, v.ring.max, v.level, now);
      }
      const prev = this.last.get(v.id);
      if (v.level <= 0) {
        if (prev) this.release(v.id, prev, cues);
        continue;
      }
      const h = handAt(v);
      if (!prev) cues.push('charge_start');
      const stage = v.stages > 1 ? Math.min(v.stages, Math.floor(v.level * v.stages + 1e-6)) : 0;
      if (stage > (prev?.stage ?? 0)) cues.push('charge_stage');
      const full = v.level >= 1;
      let gather = (prev?.gather ?? C.sound.every) - dt;
      if (!full && gather <= 0) {
        cues.push('charge_gather');
        gather = C.sound.every * (1 - C.sound.faster * v.level);
      }
      if (full && (prev?.level ?? 0) < 1) {
        cues.push('charge_ready');
        const { sx, sy } = project(v.x, v.y);
        this.bursts.push({ ...h, left: C.ready.sec, full: true, ready: { fx: sx, fy: sy } });
      }
      this.last.set(v.id, { level: v.level, ...h, stage, gather });
      this.gather(h.x, h.y, v.level, now);
      if (stage) this.pips(h.x, h.y, stage, now);
      if (full) this.sparkles(h.x, h.y, now);
    }
    for (const [id, prev] of this.last) if (!seen.has(id)) this.release(id, prev, cues);
    this.bursts = this.bursts.filter((b) => (b.left -= dt) > 0);
    for (const b of this.bursts) this.burst(b);
    return cues;
  }

  private release(id: string, prev: Last, cues: string[]): void {
    this.last.delete(id);
    const full = prev.level >= C.fullAt;
    if (full) cues.push('charge_full');
    this.bursts.push({ x: prev.x, y: prev.y, left: full ? C.full.sec : C.release.sec, full });
  }

  /** 빨려드는 점 + 손 빛 */
  private gather(x: number, y: number, level: number, now: number): void {
    const g = this.g, { gold, white, amber } = col();
    const n = Math.ceil(C.motes * (C.minShare + (1 - C.minShare) * level));
    for (let i = 0; i < n; i++) {
      const t = (now / C.gatherSec + hash(i)) % 1, d = C.from * (1 - t) ** 1.5;
      const a = ((i / C.motes) + C.swirl * t) * Math.PI * 2;
      px(g, x + Math.cos(a) * d, y + Math.sin(a) * d * 0.7, t > 0.7 ? white : i % 2 ? gold : amber);
    }
    const r = Math.round(C.core[0]! + (C.core[1]! - C.core[0]!) * level) + (Math.floor(now / C.pulseSec) % 2);
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const q = Math.hypot(dx, dy);
      if (q <= r) px(g, x + dx, y + dy, q <= r * 0.5 ? white : q <= r - 0.5 ? gold : amber, clamp01(0.5 + level));
    }
  }

  /** 3단 충전: 다다른 단계 수만큼 손 둘레를 도는 금빛 점 (흰 심) */
  private pips(x: number, y: number, n: number, now: number): void {
    const g = this.g, S = fx.tier3.stages, { gold, white } = col();
    for (let i = 0; i < n; i++) {
      const q = now * S.spin + (i / n) * Math.PI * 2, px0 = x + Math.cos(q) * S.radius, py0 = y + Math.sin(q) * S.radius * 0.7;
      star4(g, Math.round(px0), Math.round(py0), 1, white, gold);
    }
  }

  /** 다 찬 채 들고 있음: 손 둘레 반짝이가 차례로 깜빡임 */
  private sparkles(x: number, y: number, now: number): void {
    const g = this.g, R = C.ready, { gold, white } = col();
    for (let i = 0; i < R.sparkles; i++) {
      const t = (now / R.sparkleSec + i / R.sparkles) % 1;
      if (t > 0.5) continue;
      const a = (i / R.sparkles + 0.125) * Math.PI * 2, r = t < 0.25 ? 1 : 0;
      star4(g, Math.round(x + Math.cos(a) * R.sparkleR), Math.round(y + Math.sin(a) * R.sparkleR * 0.7), r, white, gold);
    }
  }

  /** 떼는 순간: 별, 최대면 큰 별 + 빛살. 다 차는 순간: 더 큰 별 + 빛살 + 몸 둘레 고리 */
  private burst(b: Burst): void {
    const g = this.g, { gold, white, amber } = col(), S = b.ready ? C.ready : b.full ? C.full : C.release, k = b.left / S.sec;
    star4(g, b.x, b.y, Math.max(1, Math.round(S.radius * k)), white, gold);
    if (!b.full) return;
    if (b.ready) {
      const R = C.ready, r = R.ring[0]! + (R.ring[1]! - R.ring[0]!) * (1 - k), cy = b.ready.fy + R.ringY;
      const n = Math.round(Math.PI * 2 * r);
      for (let i = 0; i < n; i += 2) {
        const q = (i / n) * Math.PI * 2;
        px(g, b.ready.fx + Math.cos(q) * r, cy + Math.sin(q) * r * R.ry, i % 4 ? gold : amber, k * 1.5);
      }
    }
    const F = b.ready ? C.ready : C.full, d = F.rayLen * (1 - k);
    for (let i = 0; i < F.rays; i++) {
      const a = (i / F.rays) * Math.PI * 2;
      px(g, b.x + Math.cos(a) * d, b.y + Math.sin(a) * d * 0.7, i % 2 ? gold : white, k * 1.5);
    }
  }

  destroy(): void {
    this.g.destroy();
    this.ground.destroy();
  }
}
