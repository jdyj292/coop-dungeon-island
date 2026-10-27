// 배치 모드 아래 띠 (hud.md 8장 배치 모드, 위치·모양은 승인 데모 island_hud_cluster.html placeDraft와 같음)
// 아래 끝에 붙은 묶음 3개: 가방 속 장식 목록(아이콘 + 개수, 선택은 금색 테두리) / 조작 안내 R 회전·X 치우기·ESC / 지갑
import type Phaser from 'phaser';
import { dot } from '../fx/layer';
import { colorInt } from '../palette';
import { islandObjects, islandView } from '../sprites/island';
import { islandTexture } from '../sprites/textures';
import { cluster } from './hudParts';
import { drawText } from './pixelFont';

const C = (p: string) => colorInt(p);
const TOP = 140;
/** 칸 x = 5 + i × 19, 한 번에 7칸 */
export const TRAY = { x: 5, step: 19, size: 18, max: 7 } as const;
/** 조작 안내·지갑 묶음 x */
const KEYS_X = 151, WALLET_X = 254;
/** 데모 회전 화살표 (R 오른쪽) */
const ROTATE = [[1, 0], [2, 0], [3, 0], [0, 1], [4, 1], [0, 2], [0, 3], [3, 3], [4, 3], [1, 4], [2, 4], [3, 4], [4, 2]] as const;

export interface TrayItem {
  itemId: string;
  count: number;
  /** 공용 창고 것 (금색 점) */
  from: 'mine' | 'storage';
}

export class PlaceTray {
  private g: Phaser.GameObjects.Graphics;
  private top: Phaser.GameObjects.Graphics;
  private icons: Phaser.GameObjects.Image[] = [];

  constructor(private scene: Phaser.Scene, depth: number) {
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(depth);
    for (let i = 0; i < TRAY.max; i++) this.icons.push(scene.add.image(0, 0, '__DEFAULT').setOrigin(0, 0).setScrollFactor(0).setDepth(depth + 1).setVisible(false));
    this.top = scene.add.graphics().setScrollFactor(0).setDepth(depth + 2);
  }

  /** 보이는 칸의 첫 번호 (선택이 보이도록 넘김) */
  static firstShown(sel: number, count: number): number {
    return Math.max(0, Math.min(sel - TRAY.max + 1, count - TRAY.max, sel));
  }

  draw(items: TrayItem[], sel: number, wallet: number, width: number, bandTop: number): void {
    const g = this.g, t = this.top, Y = (y: number) => y + bandTop - TOP;
    g.clear();
    t.clear();
    const bottom = Y(162);
    cluster(g, TRAY.x - 3, Y(141), TRAY.max * TRAY.step + 5, bottom);
    const first = PlaceTray.firstShown(sel, items.length);
    this.icons.forEach((img, i) => {
      const it = items[first + i], x = TRAY.x + i * TRAY.step, y = Y(143);
      img.setVisible(!!it);
      if (!it) return;
      const on = first + i === sel;
      dot(g, x, y, C(on ? 'global.ui.coin' : 'global.ui.panelBorder'), 18, 18);
      dot(g, x + 1, y + 1, C('global.ui.panelInner'), 16, 16);
      dot(g, x + 2, y + 2, C('global.ui.panel'), 14, 14);
      this.icon(img, it.itemId, x + 2, Y(145));
      drawText(t, String(it.count), x + 12, Y(154), { color: 'global.fx.flash', outline: 'four' });
      if (it.from === 'storage') dot(t, x + 14, y + 2, C('global.ui.coin'), 2, 2);
    });
    // 조작 안내 R(회전) X(치우기) ESC
    cluster(g, KEYS_X - 4, Y(146), 64, bottom);
    let kx = KEYS_X;
    for (const k of ['R', 'X', 'ESC']) {
      const w = k.length * 4 + 3, ix = kx + w + 2;
      dot(g, kx, Y(149), C('global.ui.panelBorder'), w, 9);
      dot(g, kx + 1, Y(150), C('global.ui.panel'), w - 2, 7);
      drawText(g, k, kx + 2, Y(151), { color: 'global.fx.flash', outline: 'none' });
      if (k === 'R') ROTATE.forEach(([a, b]) => dot(g, ix + a, Y(151) + b, C('global.ui.textDim')));
      if (k === 'X') {
        dot(g, ix, Y(151), C('island.stone'), 5, 5);
        dot(g, ix + 1, Y(152), C('global.ui.panel'), 3, 3);
      }
      kx = ix + (k === 'ESC' ? 0 : 8);
    }
    // 지갑
    cluster(g, WALLET_X - 4, Y(147), 36, bottom);
    dot(g, WALLET_X, Y(151), C('global.ui.coinShade'), 6, 6);
    dot(g, WALLET_X, Y(151), C('global.ui.coin'), 5, 5);
    dot(g, WALLET_X + 1, Y(152), C('global.allyFx.gold'), 2, 2);
    drawText(g, String(wallet), WALLET_X + 9, Y(151), { color: 'global.allyFx.gold', outline: 'none' });
  }

  /** 장식 그림을 14×14 칸에 맞춰 줄임 (데모 mini(): 비율 유지, 가운데) */
  private icon(img: Phaser.GameObjects.Image, itemId: string, x: number, y: number): void {
    const o = islandObjects()[itemId];
    if (!o) {
      // 돌길: 바닥 무늬 대신 흙길 색 네모
      img.setVisible(false);
      dot(this.top, x + 3, y + 4, C('island.path'), 8, 6);
      return;
    }
    const v = islandView(o, 0), tex = islandTexture(this.scene, itemId, v.frame, v.flip);
    img.setTexture(tex.key);
    const s = Math.min(1, 14 / img.width, 14 / img.height), w = Math.floor(img.width * s), h = Math.floor(img.height * s);
    img.setDisplaySize(w, h).setPosition(x + Math.floor((14 - w) / 2), y + Math.floor((14 - h) / 2));
  }

  setVisible(on: boolean): void {
    this.g.setVisible(on);
    this.top.setVisible(on);
    if (!on) this.icons.forEach((i) => i.setVisible(false));
  }
}
