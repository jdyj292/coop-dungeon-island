import Phaser from 'phaser';
import { Boot } from './scenes/Boot';
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
  scene: [Boot],
});

window.addEventListener('resize', () => applyView(game));
