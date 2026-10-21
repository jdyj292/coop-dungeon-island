// 전투 화면 안 고정 표시: 콤보 (오른쪽 가운데, hud.md 3장) · 방 클리어 띠 (hud.md 5장). 모양은 승인 데모 render()와 같음
import type Phaser from 'phaser';
import fx from '../../data/fx.json';
import { dot } from '../fx/layer';
import { colorInt } from '../palette';
import { drawText } from './pixelFont';

/** 승인 데모 기준 위치 (내부 해상도 288 너비, 오른쪽 끝에서 잰 거리) */
const COMBO_CX = 288 - 19;
const COMBO_Y = 62;
const HIT_Y = 79;
const BANNER = { y: 64, h: 26, textY: 69 };
/** 콤보 코인 보너스 "+5%" (HIT 아래, hud.md 5장 "콤보 단계 달성") */
const BONUS_Y = 87;

export class HudOverlay {
  private g: Phaser.GameObjects.Graphics;
  private clearLeft = 0;
  private bonus = { text: '', left: 0 };

  constructor(scene: Phaser.Scene, depth: number) {
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(depth);
  }

  /** 콤보 단계 달성: 코인 보너스 비율을 bonusSec 동안 */
  showBonus(rate: number): void {
    this.bonus = { text: `+${Math.round(rate * 100)}%`, left: fx.hud.bonusSec };
  }

  /** 방 클리어 띠를 clearSec 동안 */
  showClear(): void {
    this.clearLeft = fx.hud.clearSec;
  }

  draw(combo: number, dt: number, width: number): void {
    const g = this.g;
    g.clear();
    const right = width - 288;
    // 콤보: 2 이상일 때 금색 3배 숫자 + HIT
    if (combo >= 2) {
      drawText(g, String(combo), COMBO_CX + right, COMBO_Y, { color: 'global.allyFx.gold', scale: 3, align: 'center' });
      drawText(g, 'HIT', COMBO_CX + right + 1, HIT_Y, { color: 'global.fx.flash', align: 'center' });
    }
    this.bonus.left = Math.max(0, this.bonus.left - dt);
    if (this.bonus.left > 0) drawText(g, this.bonus.text, COMBO_CX + right + 1, BONUS_Y, { color: 'global.allyFx.gold', align: 'center' });
    this.clearLeft = Math.max(0, this.clearLeft - dt);
    if (this.clearLeft > 0) {
      dot(g, 0, BANNER.y, colorInt('global.ui.panel'), width, BANNER.h, fx.hud.bannerAlpha);
      dot(g, 0, BANNER.y, colorInt('global.allyFx.gold'), width, 1);
      dot(g, 0, BANNER.y + BANNER.h - 1, colorInt('global.allyFx.gold'), width, 1);
      drawText(g, 'CLEAR!', width / 2, BANNER.textY, { color: 'global.allyFx.gold', scale: 3, align: 'center' });
    }
  }
}
