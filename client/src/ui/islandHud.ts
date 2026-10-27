// 섬 HUD (hud.md 8장, 아래 띠는 승인 데모 island_hud_cluster.html islandDraft, 주민 목록은 island_screen_hud_mockup.html hudTop과 같음. y는 띠 위 = 140 기준)
// 아래 끝에 붙은 묶음 3개: 얼굴·LV 배지 / 단축 버튼 B(배치) I(가방) M(게시판) / 지갑·공동 금고. 오른쪽 위: 주민 목록 (색 막대·얼굴·상태)
import type Phaser from 'phaser';
import { dot } from '../fx/layer';
import { colorInt } from '../palette';
import { islandTexture } from '../sprites/textures';
import type { Hair } from '../view/look';
import { setFace } from './hudFace';
import { cluster } from './hudParts';
import { drawText } from './pixelFont';

const C = (p: string) => colorInt(p);
const TOP = 140;
/** B·I·M 버튼 x와 간격 */
const BUTTON_X = 116, BUTTON_STEP = 19;
const MONEY_X = 254;
/** 버튼 그림 칸: 키 글자(왼쪽 위 3×5) 오른쪽 아래, 슬롯 안쪽 아래 끝까지 */
const ICON_X = 5, ICON_W = 11, ICON_H = 10;
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
    const bottom = Y(162);
    // 얼굴 (테두리 = 내 플레이어 색) + LV 배지
    cluster(g, 2, Y(142), 26, bottom);
    dot(g, 5, Y(144), C(`global.playerColors.${st.colorIndex}`), 16, 16);
    dot(g, 6, Y(145), C('global.ui.islandFaceBg'), 14, 14);
    setFace(this.scene, this.face, false, st.colorIndex, 7, Y(147), st.hair);
    dot(g, 15, Y(154), C('global.ui.panelBorder'), 9, 7);
    dot(g, 16, Y(155), C('global.ui.panel'), 7, 5);
    drawText(g, String(st.level), 19.5, Y(155), { color: 'global.ui.textDim', outline: 'none', align: 'center' });
    // B I M: 그림은 키 글자를 가리지 않게 오른쪽 아래 칸(ICON_X~, 11×10)에
    cluster(g, BUTTON_X - 3, Y(141), 62, bottom);
    (['B', 'I', 'M'] as const).forEach((k, i) => {
      const x = BUTTON_X + i * BUTTON_STEP, y = Y(143);
      dot(g, x, y, C(st.selected === k ? 'global.ui.coin' : 'global.ui.panelBorder'), 18, 18);
      dot(g, x + 1, y + 1, C('global.ui.panelInner'), 16, 16);
      dot(g, x + 2, y + 2, C('global.ui.panel'), 14, 14);
      drawText(g, k, x + 2, Y(145), { color: 'global.ui.keyLabel', outline: 'none' });
      if (k === 'B') {
        // 울타리 그림이 칸보다 넓어 왼쪽 위만 잘라 아래 끝에 맞춤
        const f = this.fence.frame, w = Math.min(ICON_W, f.width), h = Math.min(ICON_H, f.height);
        this.fence.setCrop(0, f.height - h, w, h).setPosition(x + ICON_X, y + 16 - f.height);
      }
      if (k === 'I') {
        dot(g, x + 6, Y(150), C('global.outline'), 9, 8);
        dot(g, x + 7, Y(151), C('island.wood'), 7, 6);
        dot(g, x + 7, Y(151), C('global.ui.bagLight'), 7, 2);
        dot(g, x + 9, Y(149), C('island.woodDark'), 3, 2);
      }
      if (k === 'M') {
        dot(g, x + 5, Y(149), C('global.outline'), 11, 9);
        dot(g, x + 6, Y(150), C('island.wood'), 9, 7);
        dot(g, x + 7, Y(151), C('island.awningB'), 3, 3);
        dot(g, x + 11, Y(152), C('island.awningB'), 3, 3);
      }
    });
    // 지갑(동전) · 공동 금고(상자): 오른쪽 낮은 묶음
    cluster(g, MONEY_X - 4, Y(147), 36, bottom);
    const cx = MONEY_X, cy = Y(149), vy = Y(156);
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
    const i = Math.floor((x - BUTTON_X) / BUTTON_STEP);
    return i >= 0 && i < 3 && x - BUTTON_X - i * BUTTON_STEP < 18 ? (['B', 'I', 'M'] as const)[i]! : null;
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
