// 배치 모드 월드 표시 (docs/art.md 6장 "배치 모드 표시", 모양은 승인 데모 배치 모드와 같음)
// 칸마다 점선 테두리(흰 45%), 놓을 수 없는 칸 회색 빗금(45%), 놓을 자리 연두 55% + 테두리, 미리보기 75%, 흰 화살표 커서
import type Phaser from 'phaser';
import { canPlace, footOf, footprint, ISLAND, TILE, type CellRect, type Placed } from '@game/shared';
import { dot } from '../fx/layer';
import { colorInt } from '../palette';
import { islandObjects, islandView } from '../sprites/island';
import { islandTexture } from '../sprites/textures';
import { koText, type KoText } from '../ui/koText';
import { FLOOR_TOP, project } from './layout';

const ROW_PX = 10;
const GRID_ALPHA = 0.45, BLOCKED_ALPHA = 0.45, FOOT_ALPHA = 0.55, PREVIEW_ALPHA = 0.75;
/** 데모 커서: 외곽선 픽셀과 흰 속 픽셀 (왼쪽 위 기준) */
const ARROW_OL = [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [1, 1], [1, 6], [2, 2], [2, 5], [3, 3], [3, 5], [4, 4], [4, 6], [5, 5], [1, 7], [2, 7]] as const;
const ARROW_IN = [[1, 2], [1, 3], [1, 4], [1, 5], [2, 3], [2, 4], [3, 4]] as const;

/** 칸의 화면 사각형 */
const cellScreen = (r: CellRect) => ({ x: r.x * TILE, y: FLOOR_TOP + r.y * ROW_PX, w: r.w * TILE, h: r.h * ROW_PX });

export interface OverlayInput {
  /** 보이는 화면 영역 (월드 좌표) */
  view: { x: number; y: number; w: number; h: number };
  placed: Placed[];
  cursor: { x: number; y: number };
  /** 들고 있는 장식 (없으면 null) */
  holding: { itemId: string; rot: number; ignoreId?: string } | null;
  /** 커서 화살표 위치 (월드 화면 좌표) */
  pointer: { x: number; y: number };
  /** 커서 아래 장식 설명 (이름 · 놓은 사람) */
  tip: string | null;
  timeSec: number;
}

export class PlaceOverlay {
  private grid: Phaser.GameObjects.Graphics;
  private top: Phaser.GameObjects.Graphics;
  private preview: Phaser.GameObjects.Image;
  private tip: KoText | null = null;
  private tipText = '';

  constructor(private scene: Phaser.Scene) {
    this.grid = scene.add.graphics().setDepth(4800);
    this.preview = scene.add.image(0, 0, '__DEFAULT').setOrigin(0, 0).setAlpha(PREVIEW_ALPHA).setVisible(false);
    this.top = scene.add.graphics().setDepth(5600);
  }

  draw(o: OverlayInput): void {
    const g = this.grid, t = this.top;
    g.clear();
    t.clear();
    const x0 = Math.max(0, Math.floor(o.view.x / TILE)), x1 = Math.min(ISLAND.grid.w, Math.ceil((o.view.x + o.view.w) / TILE));
    const y0 = Math.max(0, Math.floor((o.view.y - FLOOR_TOP) / ROW_PX)), y1 = Math.min(ISLAND.grid.h - ISLAND.shoreRows, Math.ceil((o.view.y + o.view.h - FLOOR_TOP) / ROW_PX));
    const white = colorInt('global.ui.gridDot'), gray = colorInt('global.ui.placeBlocked');
    for (let cy = y0; cy < y1; cy++) {
      for (let cx = x0; cx < x1; cx++) {
        const s = cellScreen({ x: cx, y: cy, w: 1, h: 1 });
        // 놓을 수 없는 칸: 1×1 걸을 수 있는 장식으로 검사 (시설·우물 주변·영역 밖·다른 장식)
        if (canPlace('flowerBed', cx, cy, 0, o.placed, [], o.holding?.ignoreId)) {
          for (let j = 0; j < ROW_PX; j++) for (let i = 0; i < TILE; i++) if ((i + j) % 4 === 0) dot(g, s.x + i, s.y + j, gray, 1, 1, BLOCKED_ALPHA);
        }
        for (let i = 0; i < TILE; i += 2) dot(g, s.x + i, s.y, white, 1, 1, GRID_ALPHA);
        for (let j = 0; j < ROW_PX; j += 2) dot(g, s.x, s.y + j, white, 1, 1, GRID_ALPHA);
      }
    }
    this.drawHolding(o);
    // 커서 화살표
    const ol = colorInt('global.outline'), fill = colorInt('global.ui.gridDot');
    ARROW_OL.forEach(([a, b]) => dot(t, o.pointer.x + a, o.pointer.y + b, ol));
    ARROW_IN.forEach(([a, b]) => dot(t, o.pointer.x + a, o.pointer.y + b, fill));
    this.drawTip(o.tip, o.pointer);
  }

  /** 놓을 자리(연두 또는 회색) + 반투명 미리보기 */
  private drawHolding(o: OverlayInput): void {
    const h = o.holding;
    this.preview.setVisible(!!h);
    if (!h) return;
    const r = footprint(h.itemId, o.cursor.x, o.cursor.y, h.rot), s = cellScreen(r);
    const ok = !canPlace(h.itemId, r.x, r.y, h.rot, o.placed, [], h.ignoreId);
    const c = colorInt(ok ? 'global.ui.placeOk' : 'global.ui.placeBlocked'), g = this.grid;
    dot(g, s.x, s.y, c, s.w, s.h, FOOT_ALPHA);
    dot(g, s.x, s.y, c, s.w, 1);
    dot(g, s.x, s.y + s.h - 1, c, s.w, 1);
    dot(g, s.x, s.y, c, 1, s.h);
    dot(g, s.x + s.w - 1, s.y, c, 1, s.h);
    const obj = islandObjects()[h.itemId];
    if (!obj) {
      // 돌길: 그림 없이 칸 표시만
      this.preview.setVisible(false);
      return;
    }
    const v = islandView(obj, h.rot, o.timeSec), tex = islandTexture(this.scene, h.itemId, v.frame, v.flip);
    const foot = footOf(r), { sx, sy } = project(foot.x, foot.y);
    this.preview.setTexture(tex.key).setPosition(sx - tex.foot[0], sy - tex.foot[1]).setDepth(5500);
  }

  private drawTip(text: string | null, at: { x: number; y: number }): void {
    if (text !== this.tipText) {
      this.tip?.destroy();
      this.tip = text ? koText(this.scene, 0, 0, text, { font: 'koSmall', color: 'global.fx.flash', outline: 'four', align: 'center' }).setDepth(5700) : null;
      this.tipText = text ?? '';
    }
    this.tip?.moveTo(at.x + 3, at.y - 12);
  }

  destroy(): void {
    this.grid.destroy();
    this.top.destroy();
    this.preview.destroy();
    this.tip?.destroy();
  }
}
