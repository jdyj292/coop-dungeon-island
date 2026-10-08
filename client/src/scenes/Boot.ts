import Phaser from 'phaser';

/** 시작 씬. 지금은 던전 테스트 씬으로 바로 넘어간다 (roadmap 0-5) */
export class Boot extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    this.scene.start('Dungeon');
  }
}
