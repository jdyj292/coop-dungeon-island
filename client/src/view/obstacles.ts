// 장애물 임시 표시 (roadmap 3-2에서 바위·그루터기 그림으로 바꾼다): 바닥 칸을 어두운 판 + 위쪽 밝은 줄로
// 깊이 정렬은 캐릭터와 같이 장애물 아래 끝 y (place()의 setDepth(y)와 같은 기준)
import type Phaser from 'phaser';
import type { Block } from '@game/shared';
import { colorInt } from '../palette';
import { project } from './layout';

const STYLE: Record<string, { body: string; top: string }> = {
  rock: { body: 'floors.1.bg.wallDark', top: 'floors.1.bg.wall' },
  stump: { body: 'floors.1.env.trunkDark', top: 'floors.1.env.trunk' },
};
/** 바닥 위로 솟은 높이 (px, "낮게": dungeon.md 10장) */
const RISE = 6;

export function drawObstacles(scene: Phaser.Scene, blocks: readonly Block[]): Phaser.GameObjects.Graphics[] {
  return blocks.map((b) => {
    const s = STYLE[b.kind] ?? STYLE.rock!;
    const a = project(b.x0, b.y0), c = project(b.x1, b.y1);
    const g = scene.add.graphics().setDepth(b.y1);
    g.fillStyle(colorInt(s.body), 1).fillRect(a.sx, a.sy - RISE, c.sx - a.sx, c.sy - a.sy + RISE);
    g.fillStyle(colorInt(s.top), 1).fillRect(a.sx, a.sy - RISE, c.sx - a.sx, 2);
    return g;
  });
}
