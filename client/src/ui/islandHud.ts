// 섬 HUD (hud.md 8장, 승인 데모 island_hud_help.html helpDraft + 버튼 그림 island_hud_icons.html A. y는 띠 위 = 140 기준)
// 아래 가운데 묶음 하나: 단축 버튼 B(꾸미기·망치) I(가방·배낭) K(스킬·별) M(게시판) 16×16, 그림 12×12, 키는 왼쪽 아래 꼬리표 (알림 점은 승인 뒤 뺌).
// 얼굴·LV는 없음(레벨은 가방 장비 탭), 돈은 가방 아래 상자, 주민 목록은 게시판 주민 탭. 처음 하는 사람에게 왼쪽 위 "Esc · 도움말" 안내
import type Phaser from 'phaser';
import { dot } from '../fx/layer';
import { colorInt } from '../palette';
import { cluster } from './hudParts';
import { koText, type KoText } from './koText';
import { drawText } from './pixelFont';

const C = (p: string) => colorInt(p);
const TOP = 140;
export type HudButton = 'B' | 'I' | 'K' | 'M';
export const HUD_BUTTONS: readonly HudButton[] = ['B', 'I', 'K', 'M'];
/** 단축 버튼: 간격, 한 변, 위쪽 y, 묶음 판 위쪽 y (마우스 판정 hitButton도 같은 값). 묶음은 화면 가운데 */
const BUTTON = { step: 19, size: 16, y: 145, top: 144 } as const;
/** 묶음 판 = 버튼 왼쪽 3px ~ 마지막 버튼 오른쪽 끝 */
const CLUSTER_W = HUD_BUTTONS.length * BUTTON.step + 2;
/** 첫 버튼 x: 묶음 판이 화면 가운데에 오게 */
const firstX = (width: number) => Math.floor((width - CLUSTER_W) / 2) + 3;
/** 첫 접속 안내 깜빡임 (초) */
const HINT_BLINK = 0.5;

export interface IslandHudInput {
  /** 선택된 버튼 (열린 패널·배치 모드·마우스 올림) */
  selected?: HudButton | null;
  /** 왼쪽 위 "Esc · 도움말" (도움말 탭을 열어 본 적 없을 때) */
  hint: boolean;
  /** 깜빡임용 시간 (초) */
  time: number;
  /** 배치 모드: 아래 띠는 PlaceTray가 그린다 */
  placing?: boolean;
}

export class IslandHud {
  private g: Phaser.GameObjects.Graphics;
  private hint: KoText;
  private hintOn = '';

  constructor(private scene: Phaser.Scene, private depth: number) {
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(depth);
    this.hint = this.hintText('global.fx.flash');
  }

  private hintText(color: string): KoText {
    return koText(this.scene, 4, 4, 'Esc · 도움말', { color, font: 'koSmall', outline: 'four' }).setScrollFactor(0).setDepth(this.depth + 1);
  }

  draw(st: IslandHudInput, width: number, bandTop: number): void {
    const g = this.g, Y = (y: number) => y + bandTop - TOP;
    g.clear();
    this.drawHint(st);
    if (st.placing) return;
    const bottom = Y(162);
    // B I K M: 그림 12×12 가운데, 키 꼬리표 왼쪽 아래 모서리
    const x0 = firstX(width);
    cluster(g, x0 - 3, Y(BUTTON.top), CLUSTER_W, bottom);
    HUD_BUTTONS.forEach((k, i) => {
      const x = x0 + i * BUTTON.step, y = Y(BUTTON.y), S = BUTTON.size;
      const R = (a: number, b: number, w: number, h: number, c: string) => dot(g, x + a, y + b, C(c), w, h);
      R(0, 0, S, S, st.selected === k ? 'global.ui.coin' : 'global.ui.panelBorder');
      R(1, 1, S - 2, S - 2, 'global.ui.panelInner');
      R(2, 2, S - 4, S - 4, 'global.ui.panel');
      buttonIcon(k, (a, b, w, h, c) => R(2 + a, 2 + b, w, h, c));
      R(-1, 10, 6, 7, 'global.ui.panelBorder');
      R(0, 11, 4, 5, 'global.ui.panel');
      drawText(g, k, x + 1, y + 11, { color: 'global.fx.flash', outline: 'none' });
    });
  }

  /** 첫 접속 안내: 흰색 ↔ 금색 깜빡임 */
  private drawHint(st: IslandHudInput): void {
    const on = st.hint && !st.placing;
    const color = Math.floor(st.time / HINT_BLINK) % 2 ? 'global.ui.coin' : 'global.fx.flash';
    if (on && color !== this.hintOn) {
      this.hint.destroy();
      this.hint = this.hintText(color);
      this.hintOn = color;
    }
    this.hint.setVisible(on);
  }

  /** 누른 단축 버튼 (화면 좌표, 없으면 null) */
  static hitButton(x: number, y: number, bandTop: number, width: number): HudButton | null {
    const top = bandTop + BUTTON.y - TOP;
    if (y < top || y >= top + BUTTON.size) return null;
    const x0 = firstX(width), i = Math.floor((x - x0) / BUTTON.step);
    return i >= 0 && i < HUD_BUTTONS.length && x - x0 - i * BUTTON.step < BUTTON.size ? HUD_BUTTONS[i]! : null;
  }

  /** 버튼 가운데 x·위쪽 y (마우스 올림 이름표 자리) */
  static buttonTop(k: HudButton, bandTop: number, width: number): { x: number; y: number } {
    return { x: firstX(width) + HUD_BUTTONS.indexOf(k) * BUTTON.step + BUTTON.size / 2, y: bandTop + BUTTON.y - TOP - 2 };
  }

  destroy(): void {
    this.g.destroy();
    this.hint.destroy();
  }
}

/** 별 (K = 스킬) 12×12 안 픽셀: 위 절반 밝은 금색, 아래 금색, 외곽선은 둘레에 */
const STAR: readonly (readonly [number, number])[] = [
  [5, 0], [5, 1], [4, 2], [5, 2], [6, 2], [4, 3], [5, 3], [6, 3],
  ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((x) => [x, 4] as const), ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((x) => [x, 5] as const),
  ...[2, 3, 4, 5, 6, 7, 8].map((x) => [x, 6] as const), ...[3, 4, 5, 6, 7].map((x) => [x, 7] as const), ...[2, 3, 4, 5, 6, 7, 8].map((x) => [x, 8] as const),
  [2, 9], [3, 9], [7, 9], [8, 9], [1, 10], [2, 10], [8, 10], [9, 10],
];
const STAR_SET = new Set(STAR.map(([x, y]) => x * 16 + y));

/** 버튼 그림 12×12 (승인 데모 island_hud_icons.html A): B 망치, I 배낭, K 반짝이는 별, M 게시판 */
function buttonIcon(k: HudButton, R: (a: number, b: number, w: number, h: number, c: string) => void): void {
  if (k === 'B') {
    // 쇠 머리 + 나무 손잡이
    R(2, 1, 9, 5, 'global.outline');
    R(3, 2, 7, 3, 'global.materials.steel');
    R(3, 2, 7, 1, 'global.ui.steelLight');
    R(9, 2, 1, 3, 'global.materials.gauntlet');
    R(5, 6, 3, 6, 'global.outline');
    R(6, 6, 1, 6, 'island.wood');
    R(6, 6, 1, 1, 'global.ui.bagLight');
  } else if (k === 'I') {
    // 멜빵 고리·덮개·버클·주머니
    R(4, 0, 4, 3, 'global.outline');
    R(5, 1, 2, 1, 'island.wood');
    R(1, 2, 10, 10, 'global.outline');
    R(2, 3, 8, 8, 'island.wood');
    R(2, 3, 8, 3, 'global.ui.bagLight');
    R(2, 6, 8, 1, 'island.woodDark');
    R(5, 5, 2, 2, 'global.ui.coin');
    R(3, 8, 6, 3, 'island.woodDark');
    R(4, 8, 4, 2, 'island.wood');
  } else if (k === 'K') {
    for (const [x, y] of STAR) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        if (!STAR_SET.has((x + dx) * 16 + y + dy)) R(x + dx, y + dy, 1, 1, 'global.outline');
      }
    }
    for (const [x, y] of STAR) R(x, y, 1, 1, y < 5 ? 'global.allyFx.gold' : 'global.ui.coin');
    R(5, 3, 1, 1, 'global.allyFx.white');
    R(11, 0, 1, 1, 'global.allyFx.white');
    R(10, 1, 1, 1, 'global.allyFx.gold');
  } else {
    // 나무 판 + 종이 두 장 + 다리 둘
    R(0, 0, 12, 8, 'global.outline');
    R(1, 1, 10, 6, 'island.wood');
    R(1, 1, 10, 1, 'global.ui.bagLight');
    R(2, 2, 3, 4, 'island.awningB');
    R(6, 2, 4, 3, 'global.allyFx.white');
    R(3, 3, 1, 1, 'island.ink');
    R(7, 3, 2, 1, 'island.ink');
    for (const x of [3, 7]) {
      R(x, 8, 2, 4, 'global.outline');
      R(x, 8, 1, 4, 'island.wood');
    }
  }
}
