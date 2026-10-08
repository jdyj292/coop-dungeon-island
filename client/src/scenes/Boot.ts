import Phaser from 'phaser';
import { colorInt } from '../palette';
import { spriteData } from '../sprites/data';
import { characterTexture } from '../sprites/textures';

/** 시작 씬. 임시: 기본 세트 4종 표시 (0-4 sprite-preview가 생기면 지운다) */
export class Boot extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(colorInt('floors.1.bg.floor'));
    const { sets } = spriteData().outfits;
    ['beginner', 'wizard', 'rogue', 'knight'].forEach((set, i) => {
      const tex = characterTexture(
        this,
        { hair: 'short', face: 'normal', outfit: sets[set]!, weapon: 'greatsword_basic', pose: 'idle' },
        { hairColor: `global.hairColors.${i}`, playerColor: `global.playerColors.${i}` },
      );
      const img = this.add.image(40 + i * 56, 90, tex.key);
      img.setOrigin((tex.foot[0] + 0.5) / img.width, (tex.foot[1] + 1) / img.height);
    });
  }
}
