// 놓인 장식 그리기 (docs/art.md 6장 섬): 서버 상태의 placements → 그림(회전 모습·순환 프레임), 돌길은 바닥 무늬 칸
// 발밑 = 차지하는 칸의 가로 가운데·맨 앞 줄 (시설과 같은 footOf), 깊이 정렬 = 로직 y
import type Phaser from 'phaser';
import { footOf, footprint, ITEMS, TILE } from '@game/shared';
import type { PlacementSnap } from '../net/islandNet';
import { islandObjects, islandView } from '../sprites/island';
import { islandTexture } from '../sprites/textures';
import { pathColor } from './islandGround';
import { FLOOR_TOP, project } from './layout';

const ROW_PX = 10;
/** 돌길 칸 텍스처는 위치마다 무늬가 달라(월드 좌표) 칸마다 하나 */
function stoneTexture(scene: Phaser.Scene, cx: number, cy: number): string {
  const key = `stonePath|${cx}|${cy}`;
  if (!scene.textures.exists(key)) {
    const c = document.createElement('canvas');
    c.width = TILE;
    c.height = ROW_PX;
    const g = c.getContext('2d')!;
    for (let y = 0; y < ROW_PX; y++) {
      for (let x = 0; x < TILE; x++) {
        g.fillStyle = pathColor(cx * TILE + x, FLOOR_TOP + cy * ROW_PX + y);
        g.fillRect(x, y, 1, 1);
      }
    }
    scene.textures.addCanvas(key, c);
  }
  return key;
}

interface Shown {
  sig: string;
  imgs: Phaser.GameObjects.Image[];
  p: PlacementSnap;
}

export class DecorLayer {
  private shown = new Map<string, Shown>();

  constructor(private scene: Phaser.Scene) {}

  /** 상태와 맞춘다. dimId = 옮기는 중이라 흐리게 보일 장식 */
  sync(list: PlacementSnap[], timeSec: number, dimId: string | null): void {
    const seen = new Set<string>();
    for (const p of list) {
      seen.add(p.id);
      const sig = `${p.itemId}|${p.x}|${p.y}|${p.rot}`;
      let s = this.shown.get(p.id);
      if (s && s.sig !== sig) {
        s.imgs.forEach((i) => i.destroy());
        s = undefined;
      }
      if (!s) {
        s = { sig, imgs: this.create(p), p };
        this.shown.set(p.id, s);
      }
      this.animate(s, timeSec);
      s.imgs.forEach((i) => i.setAlpha(p.id === dimId ? 0.4 : 1));
    }
    for (const [id, s] of this.shown) {
      if (seen.has(id)) continue;
      s.imgs.forEach((i) => i.destroy());
      this.shown.delete(id);
    }
  }

  private create(p: PlacementSnap): Phaser.GameObjects.Image[] {
    const r = footprint(p.itemId, p.x, p.y, p.rot);
    if (ITEMS.decorations[p.itemId]?.ground) {
      const out: Phaser.GameObjects.Image[] = [];
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) {
          out.push(this.scene.add.image(x * TILE, FLOOR_TOP + y * ROW_PX, stoneTexture(this.scene, x, y)).setOrigin(0, 0).setDepth(-999));
        }
      }
      return out;
    }
    return [this.scene.add.image(0, 0, '__DEFAULT').setOrigin(0, 0)];
  }

  /** 지금 회전 모습·순환 프레임으로 */
  private animate(s: Shown, t: number): void {
    const o = islandObjects()[s.p.itemId];
    if (!o || ITEMS.decorations[s.p.itemId]?.ground) return;
    const v = islandView(o, s.p.rot, t), tex = islandTexture(this.scene, s.p.itemId, v.frame, v.flip);
    const foot = footOf(footprint(s.p.itemId, s.p.x, s.p.y, s.p.rot));
    const { sx, sy } = project(foot.x, foot.y);
    s.imgs[0]!.setTexture(tex.key).setPosition(sx - tex.foot[0], sy - tex.foot[1]).setDepth(foot.y);
  }

  destroy(): void {
    for (const s of this.shown.values()) s.imgs.forEach((i) => i.destroy());
    this.shown.clear();
  }
}
