import Phaser from 'phaser';

/** 빈 시작 씬. 이후 텍스처 생성·씬 전환을 여기서 시작한다 */
export class Boot extends Phaser.Scene {
  constructor() {
    super('Boot');
  }
}
