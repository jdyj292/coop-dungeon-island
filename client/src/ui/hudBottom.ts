// 아래 HUD 띠 (hud.md 1장, 위치는 승인 데모 floor1_room_hud_mockup.html hudBottom과 같음. y는 띠 위 = 140 기준)
// 얼굴·깃털 / HP·MP·지구력 막대·LV / 슬롯 J U I O P / 필살기 L / 물약 Z X / 이번 판 코인·재료
import type Phaser from 'phaser';
import { COMBAT, PLAYER, type ActionDef, type PlayerState } from '@game/shared';
import icons from '../../data/sprites/hud_icons.json';
import fx from '../../data/fx.json';
import { dot } from '../fx/layer';
import { colorInt } from '../palette';
import type { Hair } from '../view/look';
import { setFace } from './hudFace';
import { bar, coinIcon, icon, materialIcon, panel, slot } from './hudParts';
import { drawText } from './pixelFont';

const C = (p: string) => colorInt(p);
/** 띠 위쪽 줄 (내부 해상도 기준) */
const TOP = 140;
const SLOT_X = 86;
const POTION_X = 222;

export interface HudInput {
  player: PlayerState;
  /** 무기 id (J 아이콘) */
  weapon: string;
  /** U I O P에 장착한 스킬 (없으면 null) */
  skills: (ActionDef | null)[];
  level: number;
  coins: number;
  materials: number;
  /** 내 플레이어 색 번호 (온라인은 입장 순서, 솔로 0) */
  colorIndex?: number;
  /** 내 머리 (없으면 기본) */
  hair?: Hair;
}

/** 줄어든 부분을 trailSec 동안 흰색으로 남김 */
class Trail {
  value = 1;
  private hold = 1;
  private left = 0;
  update(v: number, dt: number): number {
    if (v < this.value) {
      this.hold = Math.max(this.hold, this.value);
      this.left = fx.hud.trailSec;
    }
    this.value = v;
    this.left = Math.max(0, this.left - dt);
    if (this.left === 0) this.hold = v;
    return this.hold;
  }
}

/** 값이 오를 때 한 번 튐 */
class Pop {
  private prev = 0;
  private left = 0;
  update(v: number, dt: number): number {
    if (v > this.prev) this.left = fx.hud.countPopSec;
    this.prev = v;
    this.left = Math.max(0, this.left - dt);
    return this.left > 0 ? -1 : 0;
  }
}

export class HudBottom {
  private g: Phaser.GameObjects.Graphics;
  private face: Phaser.GameObjects.Image;
  private hp = new Trail();
  private mp = new Trail();
  private stamina = new Trail();
  private coinPop = new Pop();
  private matPop = new Pop();
  private wasReady = new Map<string, boolean>();
  private flash = new Map<string, number>();
  private clock = 0;

  constructor(private scene: Phaser.Scene, depth: number) {
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(depth);
    this.face = scene.add.image(0, 0, '__DEFAULT').setOrigin(0, 0).setScrollFactor(0).setDepth(depth + 1);
  }

  /** bandTop = 띠 위쪽 화면 y (창이 세로로 길면 화면 맨 아래에 붙음) */
  draw(st: HudInput, dt: number, width: number, bandTop: number): void {
    const g = this.g, p = st.player, oy = bandTop - TOP, Y = (y: number) => y + oy;
    this.clock += dt;
    g.clear();
    dot(g, 0, Y(140), C('global.ui.panelBorder'), width, 1);
    dot(g, 0, Y(141), C('global.ui.panelInner'), width, 1);
    dot(g, 0, Y(142), C('global.ui.panel'), width, 20);

    // 얼굴 (지금 표정) + 부활의 깃털
    dot(g, 3, Y(143), C('global.ui.panelBorder'), 16, 16);
    dot(g, 4, Y(144), C('global.ui.faceBg'), 14, 14);
    setFace(this.scene, this.face, !!(p.hurt || p.downed), st.colorIndex ?? 0, 5, Y(146), st.hair);
    if (p.feathers > 0) icon(g, 'feather', 15, Y(153));

    // HP·MP·지구력·LV
    const hpF = p.hp / p.maxHp, mpF = p.mp / PLAYER.mp.max, stF = p.stamina / PLAYER.stamina.max;
    bar(g, 23, Y(145), 52, 4, hpF, 'global.ui.hp', 'global.ui.hpDark', this.hp.update(hpF, dt));
    bar(g, 23, Y(150), 52, 3, mpF, 'global.ui.mp', 'global.ui.mpDark', this.mp.update(mpF, dt));
    bar(g, 23, Y(154), 52, 2, stF, 'global.ui.stamina', 'global.ui.staminaDark', this.stamina.update(stF, dt));
    drawText(g, `LV${st.level}`, 23, Y(157), { color: 'global.ui.textDim', outline: 'none' });

    // 슬롯
    const run = p.fighter.run;
    const slotIcons = icons.slots as Record<string, string>;
    slot(g, SLOT_X, Y(143), { icon: slotIcons[st.weapon] ?? 'empty', key: 'J', casting: !!run && run.kind !== 'skill' });
    ['U', 'I', 'O', 'P'].forEach((key, i) => {
      const s = st.skills[i] ?? null, x = SLOT_X + (i + 1) * 20;
      if (!s) return slot(g, x, Y(143), { icon: 'empty', key, dim: true });
      const cd = p.cooldowns[s.id] ?? 0, total = (s.cooldown ?? 0) * COMBAT.cooldownScale;
      const ready = cd <= 0;
      if (ready && this.wasReady.get(s.id) === false) this.flash.set(s.id, fx.hud.readyFlashSec);
      this.wasReady.set(s.id, ready);
      const fl = Math.max(0, (this.flash.get(s.id) ?? 0) - dt);
      this.flash.set(s.id, fl);
      slot(g, x, Y(143), {
        icon: slotIcons[s.id] ?? 'empty', key, casting: run?.kind === 'skill' && run.def.id === s.id,
        cover: total ? cd / total : 0, gray: p.mp < (s.mp ?? 0), ready: fl > 0,
      });
    });
    const full = p.ult >= PLAYER.ultimate.max;
    slot(g, SLOT_X + 5 * 20 + 6, Y(143), {
      icon: slotIcons.ultimate!, key: 'L', fill: p.ult / PLAYER.ultimate.max,
      glow: full && Math.floor(this.clock / fx.hud.ultBlinkSec) % 2 === 0,
    });

    // 물약 Z·X: 남은 개수, 쿨 중엔 어둡게
    ([['Z', 'hp', 'global.ui.hp'], ['X', 'mp', 'global.ui.mp']] as const).forEach(([key, kind, col], i) => {
      const x = POTION_X + i * 16;
      dot(g, x, Y(146), C('global.ui.panelBorder'), 14, 14);
      dot(g, x + 1, Y(147), C('global.ui.panel'), 12, 12);
      dot(g, x + 4, Y(150), C('global.outline'), 6, 7);
      dot(g, x + 5, Y(152), C(col), 4, 4);
      dot(g, x + 5, Y(152), C('global.fx.flash'), 1, 1);
      dot(g, x + 6, Y(149), C('global.materials.leather'), 2, 1);
      drawText(g, key, x + 1, Y(147), { color: 'global.ui.keyLabel', outline: 'none' });
      drawText(g, String(p.potions[kind]), x + 10, Y(155), { color: 'global.fx.flash', outline: 'none' });
      if (p.potionCd[kind] > 0 || p.potions[kind] === 0) dot(g, x + 1, Y(147), C('global.ui.panel'), 12, 12, fx.hud.dimAlpha);
    });

    // 이번 판 코인·재료
    coinIcon(g, 257, Y(145));
    drawText(g, String(st.coins), 266, Y(145) + this.coinPop.update(st.coins, dt), { color: 'global.allyFx.gold', outline: 'none' });
    materialIcon(g, 257, Y(153));
    drawText(g, String(st.materials), 266, Y(153) + this.matPop.update(st.materials, dt), { color: 'global.fx.flash', outline: 'none' });
  }
}
