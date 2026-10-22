// 정산 화면 (hud.md 6장): 화면 가운데 도트 패널에 결과 → 코인(보너스·지갑·금고) → 재료 → 경험치·레벨 → 파티원별 줄 순서로 등장
// 한글 글꼴(갈무리)이 아직 없어 3×5 글꼴·아이콘·얼굴로만 표시 (이름 대신 플레이어 색 막대 + 얼굴). 첫 처치 보상은 M4
import type Phaser from 'phaser';
import { expToNext, type S2C } from '@game/shared';
import fx from '../../data/fx.json';
import { dot } from '../fx/layer';
import { colorInt } from '../palette';
import { setFace } from './hudFace';
import { bar, coinIcon, materialIcon, panel } from './hudParts';
import { drawText } from './pixelFont';
import { koText, wrapKo, type KoText } from './koText';

type Result = S2C['result'];
const C = (p: string) => colorInt(p);
const W = 160;
const ROW = 10;
/** 위쪽 줄: 제목, 코인, 지갑·금고, 재료, 경험치 */
const HEAD_ROWS = 5;
const TITLE: Record<Result['kind'], { text: string; color: string }> = {
  clear: { text: 'CLEAR!', color: 'global.allyFx.gold' },
  return: { text: 'RETURN', color: 'global.ui.hp' },
  wipe: { text: 'WIPE', color: 'global.semantic.danger' },
};

/** 금고 아이콘 6×5 (작은 상자: 나무 + 금테) */
function treasuryIcon(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
  dot(g, x, y, C('global.materials.wood'), 6, 5);
  dot(g, x, y + 2, C('global.materials.gold'), 6, 1);
  dot(g, x + 2, y + 2, C('global.fx.flash'), 2, 1);
}

/** 파티원 이름 칸 폭 (px) */
const NAME_W = 44;

export class ResultPanel {
  private g: Phaser.GameObjects.Graphics;
  private faces: Phaser.GameObjects.Image[] = [];
  /** 파티원 이름 (갈무리7, 길면 말줄임) */
  private names: KoText[] = [];
  private t = 0;

  /** colorOf = pid → 플레이어 색 번호, myId = 내 줄 (위쪽 줄은 내 정산) */
  constructor(private scene: Phaser.Scene, depth: number, private r: Result, private myId: string, private colorOf: (pid: string) => number) {
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(depth);
    for (let i = 0; i < r.lines.length; i++) {
      this.faces.push(scene.add.image(0, 0, '__DEFAULT').setOrigin(0, 0).setScrollFactor(0).setDepth(depth + 1).setVisible(false));
      const name = wrapKo(r.lines[i]!.name, NAME_W, 1, 'koSmall')[0] ?? '';
      this.names.push(koText(scene, 0, 0, name, { font: 'koSmall', color: 'global.fx.flash' }).setScrollFactor(0).setDepth(depth + 1).setVisible(false));
    }
  }

  /** 다 보였으면 true (그 뒤 아무 키로 넘어감) */
  get done(): boolean {
    return this.t >= (HEAD_ROWS + this.r.lines.length) * fx.hud.resultStepSec;
  }

  draw(dt: number, width: number, height: number): void {
    this.t += dt;
    const g = this.g, r = this.r, step = Math.floor(this.t / fx.hud.resultStepSec);
    const me = r.lines.find((l) => l.pid === this.myId) ?? r.lines[0]!;
    const h = 14 + HEAD_ROWS * ROW + r.lines.length * 13 + 8;
    const x0 = Math.round((width - W) / 2), y0 = Math.max(4, Math.round((height - h) / 2));
    const cx = x0 + W / 2, lx = x0 + 12;
    g.clear();
    panel(g, x0, y0, W, h);
    const t = TITLE[r.kind];
    drawText(g, t.text, cx, y0 + 6, { color: t.color, scale: 2, align: 'center' });
    let y = y0 + 6 + 14;
    // 코인: 합계 (+보너스% 또는 −잃은 코인)
    if (step >= 1) {
      const total = me.wallet + me.treasury;
      coinIcon(g, lx, y);
      drawText(g, String(total), lx + 8, y, { color: 'global.allyFx.gold', outline: 'none' });
      if (me.bonusPct) drawText(g, `+${me.bonusPct}%`, x0 + W - 12, y, { color: 'global.allyFx.gold', outline: 'none', align: 'right' });
      if (me.lost) drawText(g, `-${me.lost}`, x0 + W - 12, y, { color: 'global.semantic.danger', outline: 'none', align: 'right' });
    }
    y += ROW;
    // 지갑 > 금고 (30%)
    if (step >= 2) {
      drawText(g, '>', lx + 1, y, { color: 'global.ui.textDim', outline: 'none' });
      coinIcon(g, lx + 8, y);
      drawText(g, String(me.wallet), lx + 16, y, { color: 'global.fx.flash', outline: 'none' });
      treasuryIcon(g, cx + 8, y);
      drawText(g, String(me.treasury), cx + 17, y, { color: 'global.fx.flash', outline: 'none' });
    }
    y += ROW;
    if (step >= 3) {
      materialIcon(g, lx, y);
      drawText(g, String(me.materials), lx + 8, y, { color: 'global.fx.flash', outline: 'none' });
    }
    y += ROW;
    // 경험치: 레벨 막대 + LV 전 > 후, 올랐으면 LV UP 깜빡임
    if (step >= 4) {
      drawText(g, 'EXP', lx, y, { color: 'global.ui.keyLabel', outline: 'none' });
      bar(g, lx + 15, y + 1, 50, 3, me.levelExp / expToNext(me.levelAfter), 'global.ui.mp', 'global.ui.mpDark');
      const lv = me.levelAfter > me.levelBefore ? `LV${me.levelBefore}>${me.levelAfter}` : `LV${me.levelAfter}`;
      drawText(g, lv, lx + 70, y, { color: 'global.fx.flash', outline: 'none' });
      const blink = Math.floor(this.t / fx.hud.resultBlinkSec) % 2 === 0;
      if (me.levelAfter > me.levelBefore && blink) drawText(g, 'LV UP!', x0 + W - 12, y, { color: 'global.allyFx.gold', outline: 'none', align: 'right' });
    }
    y += ROW + 4;
    // 파티원별 한 줄: 색 막대 + 얼굴 + 이름 + 지갑 코인 + 재료
    r.lines.forEach((l, i) => {
      const face = this.faces[i]!, name = this.names[i]!, show = step >= HEAD_ROWS + i, ly = y + i * 13;
      face.setVisible(show);
      name.setVisible(show);
      if (!show) return;
      const color = this.colorOf(l.pid);
      dot(g, lx - 4, ly, C(`global.playerColors.${color}`), 2, 11);
      setFace(this.scene, face, r.kind === 'wipe', color, lx, ly);
      name.moveTo(lx + 15, ly);
      coinIcon(g, lx + 15 + NAME_W + 3, ly + 3);
      drawText(g, String(l.wallet), lx + 15 + NAME_W + 11, ly + 3, { color: 'global.allyFx.gold', outline: 'none' });
      materialIcon(g, x0 + W - 34, ly + 3);
      drawText(g, String(l.materials), x0 + W - 26, ly + 3, { color: 'global.fx.flash', outline: 'none' });
    });
    // 다 보이면 아무 키 (오른쪽 아래 깜빡이는 >)
    if (this.done && Math.floor(this.t / fx.hud.resultBlinkSec) % 2 === 0) drawText(g, '>', x0 + W - 10, y0 + h - 9, { color: 'global.allyFx.gold', outline: 'none' });
  }

  destroy(): void {
    this.g.destroy();
    this.faces.forEach((f) => f.destroy());
    this.names.forEach((n) => n.destroy());
  }
}
