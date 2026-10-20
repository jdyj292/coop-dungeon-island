// 잔상: 백스텝·대시·돌진 중 일정 간격으로 지금 모습을 반투명하게 남기고 사라지게 함 (motion.md 5장, 값 fx.json)
import type Phaser from 'phaser';
import fx from '../../data/fx.json';

export class Afterimages {
  private list: { img: Phaser.GameObjects.Image; life: number }[] = [];
  private since = Infinity;

  constructor(private scene: Phaser.Scene) {}

  /** dt = 지난 그리기 이후 게임 시간. active 동안 every초마다 source를 복사 */
  update(dt: number, active: boolean, source: Phaser.GameObjects.Image): void {
    const a = fx.afterimage;
    for (const g of this.list) {
      g.life -= dt;
      g.img.setAlpha(Math.max(0, (a.alpha * g.life) / a.sec));
    }
    this.list = this.list.filter((g) => (g.life > 0 ? true : (g.img.destroy(), false)));
    if (!active) {
      this.since = Infinity;
      return;
    }
    this.since += dt;
    if (this.since < a.every) return;
    this.since = 0;
    const img = this.scene.add.image(source.x, source.y, source.texture.key)
      .setOrigin(source.originX, source.originY).setFlipX(source.flipX).setDepth(source.depth - 0.5).setAlpha(a.alpha);
    this.list.push({ img, life: a.sec });
  }

  clear(): void {
    this.list.forEach((g) => g.img.destroy());
    this.list = [];
  }
}
