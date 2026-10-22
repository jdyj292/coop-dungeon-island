import Phaser from 'phaser';
import type { MeRes } from '@game/shared';
import { colorInt } from '../palette';
import { createLayer, fitLayer } from '../ui/dom/domStyle';
import { LoginForm } from '../ui/dom/loginForm';

/** 로그인·가입 화면 (docs/hud.md 9장): 캔버스는 바탕만, 폼은 DOM 층 */
export class Title extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(colorInt('global.ui.panel'));
    const layer = createLayer(this.game.canvas.parentElement!, this.scale.zoom);
    const fit = () => fitLayer(layer, this.scale.zoom);
    const form = new LoginForm(layer, '협동 던전 섬', (me: MeRes) => {
      this.registry.set('me', me);
      this.scene.start('Island');
    }, fit);
    const onResize = fit;
    this.scale.on('resize', onResize);
    this.events.once('shutdown', () => {
      this.scale.off('resize', onResize);
      form.destroy();
      layer.remove();
    });
  }
}
