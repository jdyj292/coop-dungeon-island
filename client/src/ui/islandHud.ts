// 섬 HUD (hud.md 8장, 위치·모양은 승인 데모 island_screen_hud_mockup.html hudBase·hudTop과 같음. y는 띠 위 = 140 기준)
// 아래 띠: 얼굴·LV / 단축 버튼 B(배치) I(가방) M(게시판) / 지갑·공동 금고. 오른쪽 위: 주민 목록 (색 막대·얼굴·상태)
import type Phaser from 'phaser';
import { dot } from '../fx/layer';
import { colorInt } from '../palette';
import { islandTexture } from '../sprites/textures';
import type { Hair } from '../view/look';
import { setFace } from './hudFace';
import { drawText } from './pixelFont';

const C = (p: string) => colorInt(p);
const TOP = 140;
/** 데모 B·I·M 버튼 x (24 간격) */
const BUTTON_X = 106;
const MONEY_X = 222;
/** 주민 칸 폭, 패널 rgba(29,24,48,.75) = global.ui.panel 75%, 접속 안 한 얼굴 40% */
const CELL = 14, PANEL_ALPHA = 0.75, AWAY_ALPHA = 0.4;

export interface IslandHudInput {
  colorIndex: number;
  hair?: Hair;
  level: number;
  wallet: number;
  treasury: number;
  /** 선택된 버튼 (배치 모드 등, 4-6) */
  selected?: 'B' | 'I' | 'M' | null;
  residents: { id: string; color: number; status: string; hair?: number; hairColor?: number }[];
  /** 배치 모드: 아래 띠는 PlaceTray가 그린다 (주민 목록만) */
  placing?: boolean;
}

export class IslandHud {
  private g: Phaser.GameObjects.Graphics;
  private face: Phaser.GameObjects.Image;
  private fence: Phaser.GameObjects.Image;
  private top: Phaser.GameObjects.Graphics;
  private faces: Phaser.GameObjects.Image[] = [];

  constructor(private scene: Phaser.Scene, depth: number) {
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(depth);
    this.face = scene.add.image(0, 0, '__DEFAULT').setOrigin(0, 0).setScrollFactor(0).setDepth(depth + 1);
    const fence = islandTexture(scene, 'fence', 'front');
    this.fence = scene.add.image(0, 0, fence.key).setOrigin(0, 0).setScrollFactor(0).setDepth(depth + 1);
    this.top = scene.add.graphics().setScrollFactor(0).setDepth(depth);
    for (let i = 0; i < 4; i++) this.faces.push(scene.add.image(0, 0, '__DEFAULT').setOrigin(0, 0).setScrollFactor(0).setDepth(depth + 1).setVisible(false));
  }

  draw(st: IslandHudInput, width: number, bandTop: number): void {
    const g = this.g, Y = (y: number) => y + bandTop - TOP;
    g.clear();
    this.face.setVisible(!st.placing);
    this.fence.setVisible(!st.placing);
    this.drawResidents(st.residents, width);
    if (st.placing) return;
    dot(g, 0, Y(140), C('global.ui.panelBorder'), width, 1);
    dot(g, 0, Y(141), C('global.ui.panelInner'), width, 1);
    dot(g, 0, Y(142), C('global.ui.panel'), width, 20);
    // 얼굴·LV
    dot(g, 3, Y(143), C('global.ui.panelBorder'), 16, 16);
    dot(g, 4, Y(144), C('global.ui.islandFaceBg'), 14, 14);
    setFace(this.scene, this.face, false, st.colorIndex, 5, Y(146), st.hair);
    drawText(g, `LV${st.level}`, 23, Y(148), { color: 'global.ui.textDim', outline: 'none' });
    // B I M
    (['B', 'I', 'M'] as const).forEach((k, i) => {
      const x = BUTTON_X + i * 24, y = Y(143);
      dot(g, x, y, C(st.selected === k ? 'global.ui.coin' : 'global.ui.panelBorder'), 18, 18);
      dot(g, x + 1, y + 1, C('global.ui.panelInner'), 16, 16);
      dot(g, x + 2, y + 2, C('global.ui.panel'), 14, 14);
      drawText(g, k, x + 2, Y(145), { color: 'global.ui.keyLabel', outline: 'none' });
      if (k === 'B') this.fence.setPosition(x + 3, Y(149));
      if (k === 'I') {
        dot(g, x + 5, Y(149), C('global.outline'), 9, 8);
        dot(g, x + 6, Y(150), C('island.wood'), 7, 6);
        dot(g, x + 6, Y(150), C('global.ui.bagLight'), 7, 2);
        dot(g, x + 8, Y(148), C('island.woodDark'), 3, 2);
      }
      if (k === 'M') {
        dot(g, x + 4, Y(148), C('global.outline'), 11, 9);
        dot(g, x + 5, Y(149), C('island.wood'), 9, 7);
        dot(g, x + 6, Y(150), C('island.awningB'), 3, 3);
        dot(g, x + 10, Y(151), C('island.awningB'), 3, 3);
      }
    });
    // 지갑(동전) · 공동 금고(상자)
    const cx = MONEY_X, cy = Y(145), vy = Y(154);
    dot(g, cx, cy, C('global.ui.coinShade'), 6, 6);
    dot(g, cx, cy, C('global.ui.coin'), 5, 5);
    dot(g, cx + 1, cy + 1, C('global.allyFx.gold'), 2, 2);
    drawText(g, String(st.wallet), cx + 9, cy, { color: 'global.allyFx.gold', outline: 'none' });
    dot(g, cx - 1, vy - 1, C('global.outline'), 9, 8);
    dot(g, cx, vy, C('island.wood'), 7, 6);
    dot(g, cx, vy, C('global.ui.bagLight'), 7, 2);
    dot(g, cx + 3, vy + 2, C('global.ui.coin'), 1, 2);
    drawText(g, String(st.treasury), cx + 9, vy, { color: 'global.ui.coin', outline: 'none' });
  }

  /** 누른 단축 버튼 B·I·M (화면 좌표, 없으면 null) */
  static hitButton(x: number, y: number, bandTop: number): 'B' | 'I' | 'M' | null {
    if (y < bandTop + 3 || y >= bandTop + 21) return null;
    const i = Math.floor((x - BUTTON_X) / 24);
    return i >= 0 && i < 3 && x - BUTTON_X - i * 24 < 18 ? (['B', 'I', 'M'] as const)[i]! : null;
  }

  /** 오른쪽 위 주민 목록: 섬 = 연두 점, 탐험 중 = 검 + 층 숫자, 접속 안 함 = 흐린 얼굴 + 점 세 개 */
  private drawResidents(list: IslandHudInput['residents'], width: number): void {
    const g = this.top, n = Math.min(4, list.length), x0 = width - n * CELL - 2;
    g.clear();
    this.faces.forEach((f, i) => f.setVisible(i < n));
    if (!n) return;
    dot(g, x0 - 2, 2, C('global.ui.panel'), n * CELL + 2, 20, PANEL_ALPHA);
    list.slice(0, n).forEach((r, i) => {
      const x = x0 + i * CELL, away = r.status === 'away';
      dot(g, x, 4, C(`global.playerColors.${r.color}`), 12, 1);
      const face = this.faces[i]!;
      setFace(this.scene, face, false, r.color, x, 5, { style: r.hair ?? 0, color: r.hairColor ?? 0 });
      face.setAlpha(away ? AWAY_ALPHA : 1);
      if (r.status === 'island') dot(g, x + 4, 18, C('global.ui.hp'), 3, 2);
      else if (r.status.startsWith('dungeon:')) {
        dot(g, x + 3, 17, C('global.materials.steel'), 1, 3);
        dot(g, x + 2, 18, C('global.materials.steel'), 3, 1);
        drawText(g, r.status.slice(8), x + 6, 16, { color: 'global.allyFx.gold', outline: 'none' });
      } else [2, 5, 8].forEach((dx) => dot(g, x + dx, 18, C('global.ui.offline')));
    });
  }
}
