import Phaser from 'phaser';
import { Boot } from './scenes/Boot';
import { Dungeon } from './scenes/Dungeon';
import { computeView } from './scale';

const parent = document.getElementById('game')!;

function applyView(game: Phaser.Game): void {
  const { scale, width, height } = computeView(window.innerWidth, window.innerHeight);
  game.scale.resize(width, height);
  game.scale.setZoom(scale);
}

const initial = computeView(window.innerWidth, window.innerHeight);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent,
  width: initial.width,
  height: initial.height,
  pixelArt: true,
  roundPixels: true,
  backgroundColor: '#000000',
  scale: { mode: Phaser.Scale.NONE, zoom: initial.scale },
  scene: [Boot, Dungeon],
});

window.addEventListener('resize', () => applyView(game));

// 개발 중 브라우저 콘솔에서 상태를 볼 수 있게
if (import.meta.env.DEV) (window as unknown as { game: Phaser.Game }).game = game;
