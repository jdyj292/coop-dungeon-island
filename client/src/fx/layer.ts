// 이펙트 묶음: 한 Graphics에 매 프레임 도트로 다시 그린다. 위치는 정수 픽셀 (art.md 7장)
import type Phaser from 'phaser';

export interface Effect {
  /** 남은 시간 (초) */
  life: number;
  readonly total: number;
  update?(dt: number): void;
  /** k = 남은 비율 (1 → 0) */
  draw(g: Phaser.GameObjects.Graphics, k: number): void;
}

export class FxLayer {
  private list: Effect[] = [];
  private g: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, depth: number) {
    this.g = scene.add.graphics().setDepth(depth);
  }

  add(e: Effect): void {
    this.list.push(e);
  }

  /** 히트스톱 동안은 dt = 0으로 불러 멈춘 채 보이게 한다 (승인 데모와 같음) */
  update(dt: number): void {
    for (const e of this.list) {
      e.life -= dt;
      e.update?.(dt);
    }
    this.list = this.list.filter((e) => e.life > 0);
  }

  draw(): void {
    this.g.clear();
    for (const e of this.list) e.draw(this.g, Math.max(0, e.life / e.total));
  }
}

/** 정수 픽셀 사각형 */
export function dot(g: Phaser.GameObjects.Graphics, x: number, y: number, color: number, w = 1, h = 1, alpha = 1): void {
  g.fillStyle(color, alpha);
  g.fillRect(Math.round(x), Math.round(y), w, h);
}
