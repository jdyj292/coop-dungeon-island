import Phaser from 'phaser';
import { Boot } from './scenes/Boot';
import { Dungeon } from './scenes/Dungeon';
import { Island } from './scenes/Island';
import { Title } from './scenes/Title';
import { addDraftSounds, sfx } from './audio/player';
import { computeView } from './scale';
import { setUseDrafts } from './sprites/data';

// 개발 모드: ?drafts=1이면 검토 중인 그림·효과음 초안을 겹쳐 본다 (docs/sprites.md 10장)
if (import.meta.env.DEV && new URLSearchParams(location.search).get('drafts') === '1') {
  setUseDrafts(true);
  addDraftSounds();
}

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
  scene: [Boot, Title, Island, Dungeon],
});

window.addEventListener('resize', () => applyView(game));

// 첫 키·클릭에서 오디오 시작 (로그인·섬부터 시작해도 섬 곡이 나오게, audio.md 4장)
sfx.unlockOnFirstInput();

// 개발 중 브라우저 콘솔에서 상태를 볼 수 있게
if (import.meta.env.DEV) (window as unknown as { game: Phaser.Game }).game = game;
