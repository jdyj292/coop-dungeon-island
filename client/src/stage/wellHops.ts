// 섬 주민의 우물 연출 (docs/island.md 6장, 값 fx.json wellHop): 출발하면 우물로 뛰어들기, 던전에서 돌아오면 우물에서 튀어나오기
import type Phaser from 'phaser';
import type { Vec2 } from '@game/shared';
import fx from '../../data/fx.json';
import { FxLayer } from '../fx/layer';
import { glowPuff, jumpAt, popAt, wellDepth, wellHole, type HopPose } from '../fx/wellHop';
import type { ResidentSnap } from '../net/islandNet';
import { project } from '../view/layout';

interface Hop {
  kind: 'jump' | 'pop';
  /** 뛰어들기 = 출발 자리, 튀어나오기 = 착지 자리 */
  at: Vec2;
  t: number;
  puffed: boolean;
  /** 서버 목록에서 빠진 뒤에도 그릴 수 있게 마지막 모습 */
  r: ResidentSnap;
}

export interface HopView extends HopPose {
  /** 그림 숨김 (구멍 속으로 사라진 뒤) */
  hidden: boolean;
  /** 덮어쓸 그림 깊이 (공중이면 우물보다 앞, 그 앞의 게시판 등은 원래 깊이대로) */
  depth: number | undefined;
  motion: string;
}

export class WellHops {
  private list = new Map<string, Hop>();
  private fx: FxLayer;

  constructor(scene: Phaser.Scene, depth: number) {
    this.fx = new FxLayer(scene, depth);
  }

  has(id: string): boolean {
    return this.list.has(id);
  }

  /** 우물로 뛰어들기 시작 (from = 지금 보이는 자리) */
  jump(id: string, from: Vec2, r: ResidentSnap): void {
    if (this.list.get(id)?.kind !== 'jump') this.list.set(id, { kind: 'jump', at: { ...from }, t: 0, puffed: false, r });
  }

  /** 처음 보이는 주민이 방금 우물 앞으로 들어왔으면 튀어나오기 (to = 착지 자리) */
  maybePop(id: string, r: ResidentSnap, to: Vec2, serverNow: number): void {
    if (r.wellAt > 0 && serverNow - r.wellAt < fx.wellHop.popWindowSec * 1000) this.list.set(id, { kind: 'pop', at: { ...to }, t: 0, puffed: false, r });
  }

  /** 서버 목록에서 빠졌지만 아직 뛰어드는 중인 주민 (마지막 모습) */
  leftover(): [string, ResidentSnap, Vec2][] {
    return [...this.list].filter(([, h]) => h.kind === 'jump').map(([id, h]) => [id, h.r, h.at]);
  }

  /** 이번 프레임 자세 (연출 중이 아니면 null). 튀어나오기가 끝나면 지운다 */
  step(id: string, dt: number): HopView | null {
    const h = this.list.get(id);
    if (!h) return null;
    h.t += dt;
    const p = h.kind === 'jump' ? jumpAt(h.at, h.t) : popAt(h.at, h.t);
    // 구멍 가장자리를 지나는 순간 빛 점
    if (!h.puffed && (h.kind === 'jump' ? p.z < 0 : p.front)) {
      h.puffed = true;
      const hole = wellHole(), { sx, sy } = project(hole.x, hole.y);
      glowPuff(sx, sy - 4).forEach((e) => this.fx.add(e));
    }
    if (h.kind === 'pop' && p.done) this.list.delete(id);
    return { ...p, hidden: h.kind === 'jump' && p.done, depth: p.front ? Math.max(wellDepth() + 1, p.y) : undefined, motion: p.z > 0 ? 'backstepAir' : 'backstepLand' };
  }

  /** 뛰어들기가 끝났고 서버에서도 나간 주민은 지운다 */
  forget(id: string): void {
    const h = this.list.get(id);
    if (h?.kind === 'jump' && h.t >= fx.wellHop.jumpSec) this.list.delete(id);
  }

  update(dt: number): void {
    this.fx.update(dt);
    this.fx.draw();
  }

  destroy(): void {
    this.fx.clear();
    this.fx.draw();
    this.list.clear();
  }
}
