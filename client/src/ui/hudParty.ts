// 파티원 프레임 (hud.md 2장, 위치·모양은 승인 데모 floor1_room_hud_mockup.html hudTop과 같음): 왼쪽 위에 세로로 최대 3명
// 플레이어 색 막대 2×11 + 반투명 패널 40×11 + 얼굴 12×11 + HP 바 22×2. 쓰러지면 흐리게 + 빨강 X, 접속 끊김이면 흐리게 + 점 세 개
import type Phaser from 'phaser';
import { dot } from '../fx/layer';
import { colorInt } from '../palette';
import { setFace } from './hudFace';
import { bar } from './hudParts';

export interface PartyMember {
  id: string;
  colorIndex: number;
  /** HP 비율 0~1 */
  hp: number;
  down: boolean;
  disconnected: boolean;
}

const MAX = 3;
const ROW = 13;
/** 데모 패널 rgba(29,24,48,.7) = global.ui.panel 70% */
const PANEL_ALPHA = 0.7;
/** 데모 face(): 흐리게 */
const DIM = 0.45;
/** 데모 빨강 X 픽셀 (줄 왼쪽 위 기준) */
const X_MARK = [[8, 3], [9, 4], [10, 5], [11, 6], [12, 7], [12, 3], [11, 4], [9, 6], [8, 7]] as const;
/** 접속 끊김 점 세 개 (얼굴 아래쪽 가운데) */
const DOTS = [[8, 8], [11, 8], [14, 8]] as const;

export class HudParty {
  private g: Phaser.GameObjects.Graphics;
  private faces: Phaser.GameObjects.Image[] = [];
  /** 표시(빨강 X·점)는 얼굴 위에 */
  private marks: Phaser.GameObjects.Graphics;

  constructor(private scene: Phaser.Scene, depth: number) {
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(depth);
    for (let i = 0; i < MAX; i++) {
      this.faces.push(scene.add.image(0, 0, '__DEFAULT').setOrigin(0, 0).setScrollFactor(0).setDepth(depth + 1).setVisible(false));
    }
    this.marks = scene.add.graphics().setScrollFactor(0).setDepth(depth + 2);
  }

  draw(members: PartyMember[]): void {
    const g = this.g, k = this.marks;
    g.clear();
    k.clear();
    this.faces.forEach((f, i) => f.setVisible(i < Math.min(MAX, members.length)));
    members.slice(0, MAX).forEach((m, i) => {
      const y = 3 + i * ROW, dim = m.down || m.disconnected;
      dot(g, 3, y, colorInt(`global.playerColors.${m.colorIndex}`), 2, 11);
      dot(g, 5, y, colorInt('global.ui.panel'), 40, 11, PANEL_ALPHA);
      const face = this.faces[i]!;
      setFace(this.scene, face, m.down, m.colorIndex, 6, y);
      face.setAlpha(dim ? DIM : 1);
      bar(g, 20, y + 4, 22, 2, m.hp, 'global.ui.hp', 'global.ui.hpDark');
      if (m.down) X_MARK.forEach(([x, dy]) => dot(k, x, y + dy, colorInt('global.semantic.danger')));
      else if (m.disconnected) DOTS.forEach(([x, dy]) => dot(k, x, y + dy, colorInt('global.ui.textDim')));
    });
  }
}
