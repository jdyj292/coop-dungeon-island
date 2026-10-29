// 설정 패널 (hud.md 8장 패널): Esc로 열기. 탭 소리 = 전체·효과음·음악 볼륨 0~100 (10씩, audio.md 4장),
// 외형 = 머리 모양 3·머리색 4 (섬에서만, art.md 3장. 가입 직후 처음 한 번 자동으로 열림), 도움말 = 지금 있는 곳(섬·던전)의 조작 키 목록
// 키: ↑↓ 고르기(도움말은 넘기기), ←→ 조절, Q·E·Tab 탭, Esc 닫기. 마우스: 탭·줄·버튼 클릭, 바깥 클릭 닫기. 바꾸면 바로 적용·저장
import type Phaser from 'phaser';
import { LOOK } from '@game/shared';
import { sfx, type Volumes } from '../audio/player';
import { spriteData } from '../sprites/data';
import { characterTexture } from '../sprites/textures';
import { markDone } from '../ui/firstVisit';
import { ListPanel, PANEL, type PanelRow, type PanelView } from '../ui/listPanel';
import { HUD_HEIGHT } from '../view/layout';
import { HAIR_NAMES, hairColorPath, hairName, type Hair } from '../view/look';

const ROWS: { key: keyof Volumes; label: string }[] = [
  { key: 'master', label: '전체' },
  { key: 'sfx', label: '효과음' },
  { key: 'music', label: '음악' },
];
const STEP = 10;
const LOOK_TAB = 1, HELP_TAB = 2, TAB_COUNT = 3;

/** 도움말 탭: 곳마다 조작 키 (섬 = Island.onKey, 던전 = combat.md 1장 조작 표) */
export type HelpPlace = 'island' | 'dungeon';
const HELP: Record<HelpPlace, [key: string, text: string][]> = {
  island: [['방향키', '이동'], ['E', '시설 이용 (가까이에서)'], ['I', '가방'], ['K', '스킬'], ['M', '게시판'], ['B', '섬 꾸미기'], ['Enter', '채팅'], ['1~4', '이모트'], ['Esc', '설정 닫기']],
  dungeon: [['방향키', '이동 (좌우 두 번 = 달리기)'], ['J', '평타 (달리며 = 대시 공격)'], ['U I O P', '스킬'], ['K', '회피'], ['L', '필살기'], ['Z X', 'HP · MP 물약'], ['E', '부활 · 줍기'], ['Enter', '채팅'], ['1~4', '이모트']],
};
const PLACE_NAME: Record<HelpPlace, string> = { island: '섬 조작', dungeon: '던전 조작' };
/** 외형 미리보기 배율 (정수) */
const PREVIEW_SCALE = 2;

/** 외형 탭이 읽고 쓰는 곳 (섬: 주민 상태 → look 메시지) */
export interface LookControl {
  /** 지금 머리 + 플레이어 색 번호 (미리보기 스카프) */
  get: () => { hair: Hair; color: number };
  set: (hair: Hair) => void;
}

export class SettingsPanel {
  open = false;
  private tab = 0;
  private sel = 0;
  private panel: ListPanel;
  private preview: Phaser.GameObjects.Image;
  /** 보낸 뒤 서버 상태가 오기 전까지 보일 값 */
  private draft: Hair | null = null;

  /** look = 외형 탭 (없으면 흐린 탭: 던전), place = 도움말 탭에 보일 조작 */
  constructor(private scene: Phaser.Scene, depth: number, private look: LookControl | null = null, private place: HelpPlace = 'dungeon') {
    this.panel = new ListPanel(scene, depth);
    this.preview = scene.add.image(0, 0, '__DEFAULT').setOrigin(0.5, 1).setScrollFactor(0).setDepth(depth + 2).setScale(PREVIEW_SCALE).setVisible(false);
  }

  show(tab = 0): void {
    this.open = true;
    this.setTab(tab === LOOK_TAB && !this.look ? 0 : tab);
  }

  close(): void {
    this.open = false;
    this.panel.hide();
    this.preview.setVisible(false);
  }

  destroy(): void {
    this.panel.destroy();
    this.preview.destroy();
  }

  private setTab(t: number): void {
    this.tab = t;
    this.sel = 0;
    this.draft = null;
    if (t === HELP_TAB) markDone('helpSeen');
  }

  /** 다음·이전 탭 (흐린 외형 탭은 건너뜀) */
  private nextTab(d: number): void {
    let t = this.tab;
    do t = (t + d + TAB_COUNT) % TAB_COUNT; while (t === LOOK_TAB && !this.look);
    this.setTab(t);
  }

  private hair(): Hair {
    return this.draft ?? this.look!.get().hair;
  }

  /** 고른 줄을 d만큼. 소리: 0~100, 음악은 바로 들리고 전체·효과음은 확인음. 외형: 한 바퀴 돌기 */
  private change(d: number): void {
    if (this.tab === LOOK_TAB) {
      const h = this.hair(), wrap = (v: number, n: number) => (v + Math.sign(d) + n) % n;
      this.draft = this.sel === 0 ? { ...h, style: wrap(h.style, LOOK.hairStyles) } : { ...h, color: wrap(h.color, LOOK.hairColors) };
      this.look!.set(this.draft);
      return;
    }
    const key = ROWS[this.sel]!.key, v = Math.max(0, Math.min(100, sfx.volumes[key] + d));
    if (v === sfx.volumes[key]) return;
    sfx.setVolumes({ [key]: v });
    if (key !== 'music') sfx.play('coin');
  }

  onKey(code: string): void {
    const n = this.tab === LOOK_TAB ? 2 : this.tab === HELP_TAB ? HELP[this.place].length : ROWS.length;
    if (code === 'Escape') this.close();
    else if (code === 'ArrowUp' || code === 'KeyW') this.sel = Math.max(0, this.sel - 1);
    else if (code === 'ArrowDown' || code === 'KeyS') this.sel = Math.min(n - 1, this.sel + 1);
    else if (this.tab === HELP_TAB) {
      if (code === 'KeyQ') this.nextTab(-1);
      else if (code === 'KeyE' || code === 'Tab') this.nextTab(1);
    }
    else if (code === 'ArrowLeft' || code === 'KeyA') this.change(-STEP);
    else if (code === 'ArrowRight' || code === 'KeyD') this.change(STEP);
    else if (code === 'KeyQ') this.nextTab(-1);
    else if (code === 'KeyE' || code === 'Tab') this.nextTab(1);
  }

  /** 마우스 (화면 좌표). 패널이 열려 있으면 true */
  onPointer(x: number, y: number): boolean {
    if (!this.open) return false;
    const h = this.panel.hit(x, y);
    if (h.kind === 'outside') this.close();
    else if (h.kind === 'tab') this.setTab(h.i);
    else if (h.kind === 'row') this.sel = h.i;
    else if (h.kind === 'button' && this.tab !== HELP_TAB) this.change(h.id === 'plus' ? STEP : -STEP);
    return true;
  }

  private view(): PanelView {
    const base = { title: '설정', tabs: [{ label: '소리' }, { label: '외형', disabled: !this.look }, { label: '도움말' }], tab: this.tab, sel: this.sel, empty: '' };
    if (this.tab === HELP_TAB) {
      return { ...base, rows: HELP[this.place].map(([key, label]) => ({ key, label })), footer: `↑↓ 넘기기 · ${PLACE_NAME[this.place]}`, buttons: [] };
    }
    if (this.tab !== LOOK_TAB) {
      return {
        ...base, rows: ROWS.map((r) => ({ label: r.label, right: `${sfx.volumes[r.key]}%` })),
        footer: '←→ 10씩 조절', buttons: [{ id: 'minus', label: '-' }, { id: 'plus', label: '+' }],
      };
    }
    const h = this.hair(), color = this.look!.get().color;
    const rows: PanelRow[] = [
      { icon: { kind: 'face', color, hair: h }, label: `머리 모양  ${HAIR_NAMES[h.style] ?? ''}`, right: `${h.style + 1}/${LOOK.hairStyles}` },
      { label: '머리색', right: `${h.color + 1}/${LOOK.hairColors}` },
    ];
    return { ...base, rows, footer: '←→ 바꾸기', buttons: [{ id: 'minus', label: '<' }, { id: 'plus', label: '>' }] };
  }

  update(width: number, fieldH: number): void {
    if (!this.open) return;
    this.panel.render(this.view(), width, fieldH);
    const on = this.tab === LOOK_TAB;
    this.preview.setVisible(on);
    if (!on) return;
    // 미리보기: 패널 오른쪽 아래 (ListPanel.render와 같은 위치 계산), 전신 2배
    const h = this.hair(), data = spriteData();
    const tex = characterTexture(this.scene, { hair: hairName(h), face: 'normal', outfit: data.outfits.sets.beginner! },
      { hairColor: hairColorPath(h), playerColor: `global.playerColors.${this.look!.get().color}` });
    const x = Math.floor((width - PANEL.w) / 2), y = Math.max(2, Math.floor((fieldH - PANEL.h) / 2));
    this.preview.setTexture(tex.key).setPosition(x + PANEL.w - 36, y + 20 + PANEL.rows * PANEL.rowH - 4);
  }

  /** 던전: Esc로 열기 (canOpen이 false면 안 열림: 정산 화면·채팅 입력 중), 열려 있으면 키·마우스를 패널로, 매 프레임 그리기 */
  static forDungeon(scene: Phaser.Scene, depth: number, canOpen: () => boolean): SettingsPanel {
    const p = new SettingsPanel(scene, depth, null, 'dungeon');
    const onKey = (e: KeyboardEvent) => {
      if (p.open) p.onKey(e.code);
      else if (e.code === 'Escape' && !e.repeat && canOpen()) p.show();
    };
    const onDown = (ptr: Phaser.Input.Pointer) => p.onPointer(ptr.x, ptr.y);
    const draw = () => p.update(scene.scale.gameSize.width, scene.scale.gameSize.height - HUD_HEIGHT);
    scene.input.keyboard!.on('keydown', onKey);
    scene.input.on('pointerdown', onDown);
    scene.events.on('update', draw);
    scene.events.once('shutdown', () => {
      scene.input.keyboard!.off('keydown', onKey);
      scene.input.off('pointerdown', onDown);
      scene.events.off('update', draw);
      p.destroy();
    });
    return p;
  }
}
