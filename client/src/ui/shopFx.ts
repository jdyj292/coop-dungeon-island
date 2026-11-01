// 카드 상점 입자·화면 흔들림 (hud.md 8장 카드 상점, 승인 데모 card_shop.html): 터지는 반짝이·먼지, 위로 오르는 빛 알갱이
import { Pix, SC } from './shopPix';

interface Part { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; star: boolean; float: boolean }

export class ShopFx {
  private parts: Part[] = [];
  /** 남은 흔들림 (초) */
  shake = 0;

  /** 사방으로 터짐 (sp = 빠르기, up = 위로 더 튐). 세 개 중 하나는 흰색, 네 개 중 하나는 별 */
  burst(x: number, y: number, n: number, color: string, sp = 1, up = 0): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = (0.6 + Math.random()) * sp;
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - up, life: 0, max: 0.5 + Math.random() * 0.5, color: i % 3 ? color : SC.flash, star: i % 4 === 0, float: false });
    }
  }

  /** 폭 w 아래에서 위로 오르는 빛 하나 */
  rise(x: number, y: number, w: number, color: string): void {
    this.parts.push({ x: x + Math.random() * w, y, vx: 0, vy: -0.4 - Math.random() * 0.6, life: 0, max: 0.8 + Math.random() * 0.6, color, star: Math.random() < 0.3, float: true });
  }

  step(dt: number): void {
    if (this.shake > 0) this.shake -= dt;
    for (const p of this.parts) {
      p.life += dt;
      p.x += p.vx * dt * 60;
      p.y += p.vy * dt * 60;
      if (!p.float) p.vy += 0.04 * dt * 60;
    }
    this.parts = this.parts.filter((p) => p.life < p.max);
  }

  /** 흔들림 오프셋 (px) */
  offset(): { x: number; y: number } {
    return this.shake > 0 ? { x: Math.round((Math.random() - 0.5) * 4), y: Math.round((Math.random() - 0.5) * 3) } : { x: 0, y: 0 };
  }

  draw(p: Pix<unknown>): void {
    for (const q of this.parts) {
      const a = 1 - q.life / q.max;
      if (q.star) p.star(q.x - 1, q.y - 1, q.color, a);
      else p.R(q.x, q.y, 1, 1, q.color, a);
    }
  }

  clear(): void {
    this.parts = [];
    this.shake = 0;
  }
}
