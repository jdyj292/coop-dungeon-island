import Phaser from 'phaser';
import { api } from '../net/api';
import { loadFonts } from '../ui/fonts';

/**
 * 시작 씬: 글꼴을 불러오고, 세션이 있으면 섬(섬이 없으면 Title의 섬 고르기), 없으면 로그인 (docs/hud.md 9장)
 * 개발 경로: ?room=N(로컬 전투) · ?online=1(서버 던전 바로)은 로그인 없이 던전으로
 */
export class Boot extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    void this.route();
  }

  private async route(): Promise<void> {
    await loadFonts();
    const p = new URLSearchParams(location.search);
    if (p.has('room') || p.get('online') === '1') return void this.scene.start('Dungeon');
    const me = await api.me();
    if (me.ok) this.registry.set('me', me.value.me);
    this.scene.start(me.ok && me.value.me.island ? 'Island' : 'Title');
  }
}
