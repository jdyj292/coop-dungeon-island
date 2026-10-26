// 날아가는 마법탄 그리기 (MVP 보충 ST-2a): 하늘색 구슬(흰 심) + 뒤로 짧은 꼬리, 바닥에서 높이 fx.json spell.bolt.height
// 위치는 로컬 RoomSim.bolts 또는 RemoteShots (서버 이벤트). 매 프레임 다시 그린다
import type Phaser from 'phaser';
import fx from '../../data/fx.json';
import { colorInt } from '../palette';
import { project } from '../view/layout';
import { dot } from './layer';

/** 이펙트 층(5000)보다 아래, 캐릭터(깊이 = y)보다 위 */
const DEPTH = 4100;

export class BoltLayer {
  private g: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(DEPTH);
  }

  draw(list: { x: number; y: number; dir: number }[]): void {
    const g = this.g, b = fx.spell.bolt, sky = colorInt('global.allyFx.sky'), white = colorInt('global.allyFx.white');
    g.clear();
    for (const p of list) {
      const { sx, sy } = project(p.x, p.y, b.height);
      for (let i = 1; i <= b.tail; i++) dot(g, sx - p.dir * (b.radius + i), sy, sky, 1, 1, 1 - i / (b.tail + 1));
      for (let y = -b.radius; y <= b.radius; y++) for (let x = -b.radius; x <= b.radius; x++) {
        const d = Math.hypot(x, y);
        if (d <= b.radius) dot(g, sx + x, sy + y, d < b.radius - 0.5 ? white : sky);
      }
    }
  }

  destroy(): void {
    this.g.destroy();
  }
}
