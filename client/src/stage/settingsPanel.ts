// 설정 패널 (hud.md 8장 패널, audio.md 4장 볼륨): Esc로 열기, 전체·효과음·음악 볼륨 0~100 (10씩)
// 키: ↑↓ 고르기, ←→ 조절, Esc 닫기. 마우스: 줄·버튼 클릭, 바깥 클릭 닫기. 바꾸면 바로 적용·로컬 저장 (sfx.setVolumes)
import type Phaser from 'phaser';
import { sfx, type Volumes } from '../audio/player';
import { ListPanel, type PanelView } from '../ui/listPanel';
import { HUD_HEIGHT } from '../view/layout';

const ROWS: { key: keyof Volumes; label: string }[] = [
  { key: 'master', label: '전체' },
  { key: 'sfx', label: '효과음' },
  { key: 'music', label: '음악' },
];
const STEP = 10;

export class SettingsPanel {
  open = false;
  private sel = 0;
  private panel: ListPanel;

  constructor(scene: Phaser.Scene, depth: number) {
    this.panel = new ListPanel(scene, depth);
  }

  show(): void {
    this.open = true;
    this.sel = 0;
  }

  close(): void {
    this.open = false;
    this.panel.hide();
  }

  destroy(): void {
    this.panel.destroy();
  }

  /** 고른 줄을 d만큼 (0~100). 음악은 바로 들리고, 전체·효과음은 확인음 한 번 */
  private change(d: number): void {
    const key = ROWS[this.sel]!.key, v = Math.max(0, Math.min(100, sfx.volumes[key] + d));
    if (v === sfx.volumes[key]) return;
    sfx.setVolumes({ [key]: v });
    if (key !== 'music') sfx.play('coin');
  }

  onKey(code: string): void {
    if (code === 'Escape') this.close();
    else if (code === 'ArrowUp' || code === 'KeyW') this.sel = Math.max(0, this.sel - 1);
    else if (code === 'ArrowDown' || code === 'KeyS') this.sel = Math.min(ROWS.length - 1, this.sel + 1);
    else if (code === 'ArrowLeft' || code === 'KeyA') this.change(-STEP);
    else if (code === 'ArrowRight' || code === 'KeyD') this.change(STEP);
  }

  /** 마우스 (화면 좌표). 패널이 열려 있으면 true */
  onPointer(x: number, y: number): boolean {
    if (!this.open) return false;
    const h = this.panel.hit(x, y);
    if (h.kind === 'outside') this.close();
    else if (h.kind === 'row') this.sel = h.i;
    else if (h.kind === 'button') this.change(h.id === 'plus' ? STEP : -STEP);
    return true;
  }

  private view(): PanelView {
    return {
      title: '설정', tabs: [{ label: '소리' }], tab: 0, sel: this.sel, empty: '',
      rows: ROWS.map((r) => ({ label: r.label, right: `${sfx.volumes[r.key]}%` })),
      footer: '←→ 10씩 조절', buttons: [{ id: 'minus', label: '-' }, { id: 'plus', label: '+' }],
    };
  }

  update(width: number, fieldH: number): void {
    if (this.open) this.panel.render(this.view(), width, fieldH);
  }

  /** 던전: Esc로 열기 (canOpen이 false면 안 열림: 정산 화면·채팅 입력 중), 열려 있으면 키·마우스를 패널로, 매 프레임 그리기 */
  static forDungeon(scene: Phaser.Scene, depth: number, canOpen: () => boolean): SettingsPanel {
    const p = new SettingsPanel(scene, depth);
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
