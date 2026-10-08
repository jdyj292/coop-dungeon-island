// 던전 테스트 씬 (roadmap 0-5): 1층 1번 방 배경, 벨트스크롤 투영, 걷기, 통통버섯 배치. 서버 없이 로컬
import Phaser from 'phaser';
import { PLAYER_MOVE, stepMove, TILE, type Vec2 } from '@game/shared';
import rooms from '../../../shared/data/rooms.json';
import { color, colorInt } from '../palette';
import { walkStep, type CharacterLook } from '../sprites/compose';
import { spriteData } from '../sprites/data';
import { stateFrames } from '../sprites/monster';
import { characterTexture, monsterTexture, type CharacterTexture } from '../sprites/textures';
import { FIELD_BOTTOM, followCamera, HUD_HEIGHT, project } from '../view/layout';
import { drawRoomBg } from '../view/roomBg';
import { shadowRadius, shadowTexture } from '../view/shadow';

const FLOOR = 1;
/** 카메라 데드존 ±2타일 (art.md 1장) */
const DEADZONE = 2 * TILE;
/** 배경을 화면 아래까지 채울 여유 (창이 세로로 길 때) */
const BG_EXTRA = 200;

interface Actor {
  pos: Vec2;
  /** 1 = 오른쪽, -1 = 왼쪽 */
  facing: number;
  img: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
}

/** 발밑 픽셀이 위치에 오도록 원점을 맞춘다. flipX는 프레임 안에서 좌우 반전되므로 반전된 발밑 열을 기준으로 */
function place(a: Actor, tex: CharacterTexture): void {
  const { img, shadow } = a;
  img.setTexture(tex.key);
  const flip = a.facing < 0;
  const w = img.width, h = img.height, [fx, fy] = tex.foot;
  img.setFlipX(flip);
  img.setOrigin((flip ? w - 1 - fx : fx) / w, (fy + 1) / h);
  const { sx, sy } = project(a.pos.x, a.pos.y);
  img.setPosition(sx, sy);
  img.setDepth(a.pos.y);
  const rx = shadowRadius(w);
  // 그림자 가운데 열과 셋째 줄(발밑 줄)이 발밑 픽셀과 겹치게 (정수 픽셀 정렬)
  shadow.setTexture(shadowTexture(img.scene, rx));
  shadow.setOrigin(rx / (rx * 2 + 1), 3 / 4).setPosition(sx, sy);
}

export class Dungeon extends Phaser.Scene {
  private room = rooms.floor1.rooms[0]!;
  private roomW = 0;
  private roomD = 0;
  private player!: Actor;
  private beat = 0;
  private mushrooms: Actor[] = [];
  private camCenter = 0;
  private hud!: Phaser.GameObjects.Rectangle;
  private keys!: Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>;

  constructor() {
    super('Dungeon');
  }

  create(): void {
    const [tw, td] = this.room.size as [number, number];
    this.roomW = tw * TILE;
    this.roomD = td * TILE;
    this.cameras.main.setBackgroundColor(color(`floors.${FLOOR}.env.void`));
    this.textures.addCanvas('room-bg', drawRoomBg(FLOOR, this.roomW, td, FIELD_BOTTOM + BG_EXTRA));
    this.add.image(0, 0, 'room-bg').setOrigin(0, 0).setDepth(-1000);

    const actor = (pos: Vec2): Actor => ({
      pos, facing: 1,
      img: this.add.image(0, 0, '__DEFAULT'),
      shadow: this.add.image(0, 0, '__DEFAULT').setDepth(-500),
    });
    this.player = actor({ x: 3 * TILE, y: this.roomD / 2 });
    // Tiled 맵(roadmap 3장) 전까지 임시 배치: 방 오른쪽 2/3에 고르게, 깊이는 번갈아
    const count = (this.room.waves[0]!.monsters as Record<string, number>).mushroom ?? 0;
    for (let i = 0; i < count; i++) {
      const x = this.roomW / 3 + ((i + 0.5) * (this.roomW * 2 / 3 - TILE)) / count;
      const y = this.roomD * (i % 2 ? 0.3 : 0.75);
      this.mushrooms.push(actor({ x, y }));
    }
    this.camCenter = this.player.pos.x;

    this.hud = this.add.rectangle(0, 0, 1, HUD_HEIGHT, colorInt('global.ui.panel')).setOrigin(0, 0).setScrollFactor(0).setDepth(10000);
    this.layoutHud();
    this.scale.on('resize', () => this.layoutHud());

    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = this.input.keyboard!.addKeys({
      up: K.UP, down: K.DOWN, left: K.LEFT, right: K.RIGHT, w: K.W, a: K.A, s: K.S, d: K.D,
    }) as typeof this.keys;
  }

  private layoutHud(): void {
    const { width, height } = this.scale.gameSize;
    this.hud.setPosition(0, height - HUD_HEIGHT).setSize(width, HUD_HEIGHT);
  }

  update(time: number, delta: number): void {
    const data = spriteData();
    const k = this.keys;
    const input = {
      x: (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0),
      y: (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0),
    };
    const p = this.player;
    const next = stepMove(p.pos, input, delta / 1000, PLAYER_MOVE.walk, {
      minX: TILE / 2, maxX: this.roomW - TILE / 2, minY: 0, maxY: this.roomD,
    });
    const moved = Math.hypot(next.x - p.pos.x, next.y - p.pos.y);
    p.pos = next;
    if (input.x) p.facing = input.x;
    // 걷기 박자는 이동 거리로 넘긴다 (발이 미끄러져 보이지 않게)
    this.beat = moved > 0 ? this.beat + moved / data.poses.walk.pxPerBeat : 0;
    const step = moved > 0 ? walkStep(data, Math.floor(this.beat)) : { frame: 'stand', bob: 0 };
    const look: CharacterLook = {
      hair: 'short', face: 'normal', outfit: data.outfits.sets.beginner!,
      weapon: 'greatsword_basic', pose: 'idle', frame: step.frame, bob: step.bob,
    };
    place(p, characterTexture(this, look, { hairColor: 'global.hairColors.0', playerColor: 'global.playerColors.0' }));

    const mush = data.monsters.mushroom!;
    const idle = stateFrames(data, 'mushroom', 'idle');
    this.mushrooms.forEach((m, i) => {
      m.facing = p.pos.x < m.pos.x ? -1 : 1;
      const frame = idle[Math.floor(time / 1000 / mush.idleSec + i * 0.5) % idle.length]!;
      place(m, monsterTexture(this, 'mushroom', frame));
    });

    const cam = followCamera(this.camCenter, p.pos.x, DEADZONE, this.scale.gameSize.width, this.roomW);
    this.camCenter = cam.center;
    this.cameras.main.setScroll(cam.scrollX, 0);
  }
}
