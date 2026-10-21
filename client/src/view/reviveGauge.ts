// 부활 게이지 (hud.md 3장, 승인 데모 크기·색): 쓰러진 동료 위 연두 막대 18×2, 외곽선 20×4
import type Phaser from 'phaser';
import { colorInt } from '../palette';
import { project } from './layout';

/** 누운 동료 위 높이 (데모 fy − 14) */
const ABOVE = 14;
const W = 18;

export function drawReviveGauges(g: Phaser.GameObjects.Graphics, list: { x: number; y: number; progress: number }[]): void {
  g.clear();
  for (const d of list) {
    const { sx, sy } = project(d.x, d.y), gx = sx - W / 2, gy = sy - ABOVE;
    g.fillStyle(colorInt('global.outline'), 1).fillRect(gx - 1, gy - 1, W + 2, 4);
    g.fillStyle(colorInt('global.ui.barTrack'), 1).fillRect(gx, gy, W, 2);
    if (d.progress > 0) g.fillStyle(colorInt('global.ui.hp'), 1).fillRect(gx, gy, Math.round(W * d.progress), 2);
  }
}
