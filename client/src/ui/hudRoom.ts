// 방 진행 HUD (hud.md 2장, 위치·모양은 승인 데모 floor1_room_hud_mockup.html hudTop과 같음): 오른쪽 위 점 5개 + 보스 아이콘
// 지난 방 연두, 현재 방 금색(+ 밝은 점), 남은 방 어두움. 보스 방에서는 점이 모두 금색, 보스 아이콘 주황
// 출구 안내 (hud.md 5장 "출구 문 빛남", 데모 CLEAR 화면): 화면 오른쪽 끝 빛 줄 + 화살표
import type Phaser from 'phaser';
import { dot } from '../fx/layer';
import { colorInt } from '../palette';
import { FLOOR_TOP } from '../view/layout';

const C = (p: string) => colorInt(p);
/** 데모: rx = LW − 62, 점 간격 9, 보스 아이콘 rx + 46 */
const RIGHT = 62;
const STEP = 9;
const BOSS_DX = 46;
/** 데모 출구 안내 화살표 픽셀 (화면 오른쪽 끝 기준 x, 바닥 위 기준 y) */
const ARROW = [[-14, 28], [-13, 27], [-13, 29], [-12, 26], [-12, 30]] as const;

export class HudRoom {
  private g: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, depth: number) {
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(depth);
  }

  /** roomIndex = 0부터, roomCount = 보스 방 포함 방 수, exitHint = 출구가 열렸고 다음 방이 있음 */
  draw(roomIndex: number, roomCount: number, width: number, exitHint: boolean): void {
    const g = this.g, rx = width - RIGHT, boss = roomIndex === roomCount - 1;
    g.clear();
    for (let i = 0; i < roomCount - 1; i++) {
      const x = rx + i * STEP;
      dot(g, x, 5, C('global.outline'), 6, 6);
      const fill = boss || i === roomIndex ? 'global.allyFx.gold' : i < roomIndex ? 'global.ui.hp' : 'global.ui.barTrack';
      dot(g, x + 1, 6, C(fill), 4, 4);
      if (!boss && i === roomIndex) dot(g, x + 1, 6, C('global.allyFx.white'));
    }
    const bx = rx + BOSS_DX;
    dot(g, bx, 4, C(boss ? 'global.ui.bossHp' : 'global.ui.barTrack'), 9, 8);
    dot(g, bx + 2, 6, C('global.outline'));
    dot(g, bx + 6, 6, C('global.outline'));
    dot(g, bx + 3, 9, C('global.outline'), 3, 1);
    if (!exitHint) return;
    for (let y = FLOOR_TOP + 10; y < FLOOR_TOP + 50; y++) {
      if (y % 2) dot(g, width - 10, y, C(y % 3 ? 'global.allyFx.gold' : 'global.allyFx.white'), 2, 1);
    }
    for (const [dx, dy] of ARROW) dot(g, width + dx, FLOOR_TOP + dy, C('global.allyFx.gold'));
  }
}
