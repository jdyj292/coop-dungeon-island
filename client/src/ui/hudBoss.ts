// 보스 HP 바 (hud.md 2장, 위치·모양은 승인 데모 floor1_room_hud_mockup.html hudTop(boss)과 같음): 위 가운데 패널
// 보스 아이콘 8×8 + 막대 82×5(윗줄 밝은 1px) + 남은 줄 "x12" + 그로기 중 "ZZ"
// 한 줄 = 최대 체력 1/12 (fx.json hud.bossLines). 줄마다 색이 바뀜: 주황(데모) ↔ 분홍(포자꽃 색 램프), 다음 줄 색이 막대 뒤에 깔린다
import type Phaser from 'phaser';
import fx from '../../data/fx.json';
import { dot } from '../fx/layer';
import { color, colorInt } from '../palette';
import { ramp } from '../sprites/shade';
import { panel } from './hudParts';
import { drawText } from './pixelFont';

const C = (p: string) => colorInt(p);
const hex = (h: string) => parseInt(h.slice(1), 16);
/** 데모: x0 = 86 (폭 288의 가운데 − 58), 폭 118, 막대 = x0 + 11, 폭 − 36 */
const HALF = 58;
const W = 118;
const BAR = { dx: 11, y: 9, w: W - 36, h: 5 };

/** 줄 색 [밝은, 어두운] (번갈아) */
function lineColors(): [number, number][] {
  const pink = ramp(color('floors.1.monster.sporeFlower'));
  return [[C('global.ui.bossHp'), C('global.ui.bossHpDark')], [hex(pink[1]), hex(pink[2])]];
}

/** 체력 비율 → 남은 줄 수와 지금 줄의 남은 비율 */
export function bossLines(ratio: number, lines = fx.hud.bossLines): { left: number; frac: number } {
  if (ratio <= 0) return { left: 0, frac: 0 };
  const v = ratio * lines, left = Math.ceil(v - 1e-9);
  return { left, frac: v - (left - 1) };
}

export class HudBoss {
  private g: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, depth: number) {
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(depth);
  }

  /** ratio = 체력 비율 0~1, null이면 숨김 */
  draw(ratio: number | null, groggy: boolean, width: number): void {
    const g = this.g;
    g.clear();
    if (ratio === null) return;
    const x0 = Math.round(width / 2) - HALF;
    panel(g, x0 - 4, 2, W + 8, 16);
    dot(g, x0, 6, C('global.ui.bossIcon'), 8, 8);
    dot(g, x0 + 1, 7, C('floors.1.env.moss'), 6, 3);
    dot(g, x0 + 2, 11, C('global.outline'));
    dot(g, x0 + 5, 11, C('global.outline'));
    const { left, frac } = bossLines(ratio), cols = lineColors();
    const bx = x0 + BAR.dx, { y, w, h } = BAR;
    dot(g, bx - 1, y - 1, C('global.ui.panelInner'), w + 2, h + 2);
    // 첫 줄(체력 가득)이 데모 주황, 줄이 하나 줄 때마다 번갈아. 뒤에는 다음 줄 색 (마지막 줄이면 빈 막대)
    const lines = fx.hud.bossLines, idx = (lines - left) % 2;
    const next = left > 1 ? cols[(idx + 1) % 2]! : null;
    if (next) {
      dot(g, bx, y, next[0], w, Math.ceil(h / 2));
      dot(g, bx, y + Math.ceil(h / 2), next[1], w, Math.floor(h / 2));
    } else dot(g, bx, y, C('global.ui.barTrack'), w, h);
    const [light, dark] = cols[idx]!, fw = Math.round(w * frac);
    if (left > 0 && fw > 0) {
      dot(g, bx, y, light, fw, Math.ceil(h / 2));
      dot(g, bx, y + Math.ceil(h / 2), dark, fw, Math.floor(h / 2));
      dot(g, bx, y, C('global.ui.bossHpLight'), fw, 1);
    }
    drawText(g, `x${left}`, x0 + W - 4, 9, { color: 'global.fx.flash', align: 'right' });
    if (groggy) drawText(g, 'ZZ', x0 + W - 24, 3, { color: 'global.ui.groggy' });
  }
}
