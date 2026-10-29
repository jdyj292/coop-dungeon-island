import Phaser from 'phaser';
import type { MeRes } from '@game/shared';
import { api } from '../net/api';
import { colorInt } from '../palette';
import { createLayer, fitLayer } from '../ui/dom/domStyle';
import { IslandPicker } from '../ui/dom/islandPicker';
import { LoginForm } from '../ui/dom/loginForm';

/** 로그인·가입 화면 → 섬이 없으면 섬 고르기 (docs/hud.md 9장, island.md 7장): 캔버스는 바탕만, 폼은 DOM 층 */
export class Title extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(colorInt('global.ui.panel'));
    const layer = createLayer(this.game.canvas.parentElement!, this.scale.zoom);
    const fit = () => fitLayer(layer, this.scale.zoom);
    let form: LoginForm | null = null, picker: IslandPicker | null = null, signedUp = false;
    const enter = (me: MeRes) => {
      this.registry.set('me', me);
      // 방금 가입: 섬에 처음 들어가면 설정 외형 탭을 연다 (art.md 3장 머리 모양)
      this.registry.set('chooseLook', signedUp);
      this.scene.start('Island');
    };
    const login = () => {
      picker?.destroy();
      picker = null;
      form = new LoginForm(layer, '협동 던전 섬', (me: MeRes, fresh: boolean) => {
        signedUp = fresh;
        form?.destroy();
        form = null;
        pick(me);
      }, fit);
    };
    const pick = (me: MeRes) => {
      if (me.island) return enter(me);
      picker = new IslandPicker(layer, me, enter, () => void api.logout().then(() => {
        this.registry.remove('me');
        login();
      }), fit);
    };
    // 세션은 있는데 섬이 없음 (Boot가 넣어 둠) → 바로 섬 고르기
    const me = this.registry.get('me') as MeRes | undefined;
    if (me && !me.island) pick(me);
    else login();
    const onResize = fit;
    this.scale.on('resize', onResize);
    this.events.once('shutdown', () => {
      this.scale.off('resize', onResize);
      form?.destroy();
      picker?.destroy();
      layer.remove();
    });
  }
}
