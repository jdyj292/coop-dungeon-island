// 대검 충전 모이는 빛 (SK-3 2차, art.md 7장): 충전하는 동안 손 둘레의 금빛 점이 소용돌이치며 손으로 빨려들고,
// 충전 비율만큼 손 빛이 커진다. 키를 떼는 순간 별, 최대(fullAt 이상)면 큰 별 + 퍼지는 빛살. 매 프레임 다시 그린다. 값 fx.json chargeGlow
import type Phaser from 'phaser';
import { fighterPose, type PlayerState, type WeaponDef } from '@game/shared';
import fx from '../../data/fx.json';
import { spriteData } from '../sprites/data';
import { project } from '../view/layout';
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
}

/** 플레이어 상태 → 그릴 것 (충전 중이 아니면 level 0). level = 충전 비율 (본인 chargeLevel, 다른 사람은 서버 chargeLv) */
export function chargeView(id: string, p: PlayerState, weapon: WeaponDef, level: number): ChargeView {
  return { id, x: p.pos.x, y: p.pos.y, facing: p.facing, level, weapon, pose: fighterPose(p.fighter) };
}

interface Burst {
  x: number;
  y: number;
  left: number;
  full: boolean;
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
  /** 지난 프레임 충전 비율·손 위치 (떼는 순간 별 자리) */
  private last = new Map<string, { level: number; x: number; y: number }>();
  private bursts: Burst[] = [];

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(DEPTH);
  }

  /** dt = 지난 그리기 뒤 흐른 초. 반환 = 낼 소리 (충전 시작 charge_start, 최대 충전으로 발동 charge_full) */
  draw(views: ChargeView[], dt: number): string[] {
    const g = this.g, now = performance.now() / 1000, cues: string[] = [];
    g.clear();
    const seen = new Set<string>();
    for (const v of views) {
      seen.add(v.id);
      const prev = this.last.get(v.id);
      if (v.level <= 0) {
        if (prev) this.release(v.id, prev, cues);
        continue;
      }
      const h = handAt(v);
      if (!prev) cues.push('charge_start');
      this.last.set(v.id, { level: v.level, ...h });
      this.gather(h.x, h.y, v.level, now);
    }
    for (const [id, prev] of this.last) if (!seen.has(id)) this.release(id, prev, cues);
    this.bursts = this.bursts.filter((b) => (b.left -= dt) > 0);
    for (const b of this.bursts) this.burst(b);
    return cues;
  }

  private release(id: string, prev: { level: number; x: number; y: number }, cues: string[]): void {
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

  /** 떼는 순간: 별, 최대면 큰 별 + 빛살 */
  private burst(b: Burst): void {
    const g = this.g, { gold, white } = col(), S = b.full ? C.full : C.release, k = b.left / S.sec;
    star4(g, b.x, b.y, Math.max(1, Math.round(S.radius * k)), white, gold);
    if (!b.full) return;
    const F = C.full, d = F.rayLen * (1 - k);
    for (let i = 0; i < F.rays; i++) {
      const a = (i / F.rays) * Math.PI * 2;
      px(g, b.x + Math.cos(a) * d, b.y + Math.sin(a) * d * 0.7, i % 2 ? gold : white, k * 1.5);
    }
  }

  destroy(): void {
    this.g.destroy();
  }
}
