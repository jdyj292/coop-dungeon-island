// 날아가는 마법탄 그리기 (MVP 보충 ST-2a): 3단 구슬(흰 심·하늘·진한 테두리) + 둘레를 도는 반짝임 + 가늘어지는 꼬리·빛 가루,
// 바닥에서 높이 fx.json spell.bolt.height. 위치는 로컬 RoomSim.bolts 또는 RemoteShots (서버 이벤트). 매 프레임 다시 그린다
import type Phaser from 'phaser';
import fx from '../../data/fx.json';
import { project } from '../view/layout';
import { dot } from './layer';
import { drawShot, type ShotView } from './shotDraw';
import { col, orb, px } from './spellDraw';

/** 이펙트 층(5000)보다 아래, 캐릭터(깊이 = y)보다 위 */
const DEPTH = 4100;

export class BoltLayer {
  private g: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(DEPTH);
  }

  draw(list: ShotView[]): void {
    const g = this.g, b = fx.spell.bolt, { sky, white, deep } = col();
    g.clear();
    for (const p of list) {
      const { sx, sy } = project(p.x, p.y, b.height), back = -p.dir;
      // 계열 스킬 투사체 (검기·얼음 창)는 자기 그림
      if (drawShot(g, sx, sy, p)) continue;
      // 꼬리: 앞 두 칸은 3px 두께, 뒤로 갈수록 1px·진한 색·바둑판으로 옅어짐
      for (let i = 1; i <= b.tail; i++) {
        const tx = sx + back * (b.radius + i - 1), a = 1 - i / (b.tail + 1);
        px(g, tx, sy, i <= 2 ? sky : deep, a + 0.2);
        if (i <= 2) { px(g, tx, sy - 1, deep, a); px(g, tx, sy + 1, deep, a); }
      }
      // 빛 가루: 이동 거리로 위치가 정해져 흘러 뒤에 남는 것처럼 보임
      const step = Math.floor(p.x / 3);
      for (let j = 0; j < b.motes; j++) {
        const mx = sx + back * (b.radius + b.tail + 1 + j * 3 + (Math.round(p.x) % 3)), my = sy + ((step + j) % 2 ? 1 : -1) * (1 + (j % 2));
        px(g, mx, my, j === 0 ? sky : deep, 0.7 - j * 0.2);
      }
      orb(g, sx, sy, b.radius);
      // 둘레를 도는 반짝임: 앞쪽(아래 반)일 때 흰색, 뒤쪽일 때 하늘색
      const q = p.x / 3;
      dot(g, sx + Math.round(Math.cos(q) * b.orbit), sy + Math.round(Math.sin(q) * b.orbit * 0.5), Math.sin(q) > 0 ? white : sky);
    }
  }

  destroy(): void {
    this.g.destroy();
  }
}
