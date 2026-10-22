import Phaser from 'phaser';
import type { MeRes } from '@game/shared';
import { api } from '../net/api';
import { colorInt } from '../palette';
import { koText } from '../ui/koText';

/**
 * 섬 씬 — 임시 화면 (4-3): 로그인 결과(섬 이름·닉네임·지갑·금고·초대 코드)와 로그아웃만
 * 섬 화면·HUD·주민 이동은 roadmap 4-5에서 이 씬을 채운다
 */
export class Island extends Phaser.Scene {
  constructor() {
    super('Island');
  }

  create(): void {
    const me = this.registry.get('me') as MeRes | undefined;
    if (!me) return void this.scene.start('Title');
    this.cameras.main.setBackgroundColor(colorInt('global.ui.panel'));
    const cx = Math.round(this.scale.width / 2);
    koText(this, cx, 20, me.island.name, { size: 2, color: 'global.ui.coin', align: 'center' });
    koText(this, cx, 52, `${me.nickname} 님, 어서 오세요`, { color: 'global.ui.steelLight', align: 'center' });
    koText(this, cx, 68, `지갑 ${me.wallet} · 금고 ${me.island.treasury}`, { color: 'global.ui.textDim', align: 'center' });
    koText(this, cx, 84, `초대 코드 ${me.island.inviteCode}`, { color: 'global.ui.textDim', align: 'center' });
    koText(this, cx, 116, '섬 화면은 준비 중 (4-5) · L 로그아웃', { color: 'global.ui.keyLabel', align: 'center' });
    this.input.keyboard?.once('keydown-L', () => {
      void api.logout().then(() => {
        this.registry.remove('me');
        this.scene.start('Title');
      });
    });
  }
}
