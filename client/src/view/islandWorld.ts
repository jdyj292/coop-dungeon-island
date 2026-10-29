// 섬 월드 그리기 (docs/art.md 6장 섬): 바닥(물 2프레임) + 구름 그림자 + 시설(땅 그림자 포함, 옮기면 자리만 바꿈)·가장자리 나무 + 상호작용 [E] + 나비
// 투영은 던전과 같다 (layout.project: 깊이 0 = 화면 FLOOR_TOP). 사물·캐릭터 깊이 정렬 = 로직 y
import type Phaser from 'phaser';
import { defaultFacilities, footOf, ISLAND, TILE, type Facility, type Vec2 } from '@game/shared';
import { dot } from '../fx/layer';
import { colorInt } from '../palette';
import { islandObjects, islandView } from '../sprites/island';
import { islandShadowTexture, islandTexture } from '../sprites/textures';
import { drawText } from '../ui/pixelFont';
import { paintGround } from './islandGround';
import { IslandSky } from './islandSky';
import { FLOOR_TOP, project } from './layout';

/** 화면에서 한 칸 깊이 (16 × 10/16) */
const ROW_PX = 10;
const WATER_FRAME_MS = 500;
/** 데모 [E] 상자 (승인 데모 render()의 우물): 발밑 x − 6, 발밑 y − 38. 모든 시설에 같은 자리 (낮은 시설은 그림 위로 뜸) */
const PROMPT_DY = 38, PROMPT_DX = 6;
/** 사물 땅 그림자 깊이: 바닥(−1000)·바닥 사물(−999)·구름 그림자(−998) 위, 사물·캐릭터 아래 */
export const SHADOW_DEPTH = -997;

/** 월드 화면 크기 (px) */
export const islandScreenSize = (): { w: number; h: number } => ({
  w: ISLAND.grid.w * TILE, h: FLOOR_TOP + ISLAND.grid.h * ROW_PX,
});

/** 사물 그림 + 땅 그림자 (ground면 그림자 없음). at = 발밑 화면 좌표 ([E] 위치) */
interface ObjectSprite {
  img: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image | null;
  foot: readonly [number, number];
  shadowFoot: readonly [number, number];
  ground: boolean;
  at: { sx: number; sy: number };
}

/** 잔디 무늬: 얼룩 (개발 중 ?grass=checker로 예전 바둑판과 비교) */
const GRASS = import.meta.env.DEV && new URLSearchParams(location.search).get('grass') === 'checker' ? 'checker' : 'patches';

/** 길(칸 사각형) 위의 화면 픽셀인지 */
function onPath(x: number, y: number): boolean {
  const cx = Math.floor(x / TILE), cy = Math.floor((y - FLOOR_TOP) / ROW_PX);
  return y >= FLOOR_TOP && ISLAND.paths.some((r) => cx >= r.x && cx < r.x + r.w && cy >= r.y && cy < r.y + r.h);
}

function groundCanvas(frame: number): HTMLCanvasElement {
  const { w, h } = islandScreenSize();
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const grassH = h - ISLAND.shoreRows * ROW_PX;
  paintGround({ width: w, grassH, seed: 3, path: onPath, grass: GRASS }, (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); }, frame);
  return c;
}

export class IslandWorld {
  private ground: Phaser.GameObjects.Image;
  private prompt: Phaser.GameObjects.Graphics;
  private butterflies: Phaser.GameObjects.Graphics;
  private sky: IslandSky;
  /** 시설 id → 그림 */
  private facilities = new Map<string, ObjectSprite>();
  private facilitySig = '';

  constructor(private scene: Phaser.Scene) {
    for (const f of [0, 1]) if (!scene.textures.exists(`islandGround${f}`)) scene.textures.addCanvas(`islandGround${f}`, groundCanvas(f));
    this.ground = scene.add.image(0, 0, 'islandGround0').setOrigin(0, 0).setDepth(-1000);
    for (const f of defaultFacilities()) this.facilities.set(f.id, this.addObject(f.id, footOf(f)));
    for (const s of ISLAND.scenery) this.addObject(s.id, { x: (s.x + 0.5) * TILE, y: (s.y + 1) * TILE - 1 }, s.ground);
    this.prompt = scene.add.graphics().setDepth(5000);
    this.butterflies = scene.add.graphics().setDepth(4000);
    const { w, h } = islandScreenSize();
    this.sky = new IslandSky(scene, w, h);
  }

  /** 사물 하나 (첫 회전 모습) + 땅 그림자. ground면 바닥 바로 위 (깊이 정렬 없이 캐릭터 아래, 그림자 없음) */
  private addObject(id: string, foot: Vec2, ground = false): ObjectSprite {
    const o = islandObjects()[id];
    if (!o) throw new Error(`섬 사물 '${id}' 없음 (client/data/sprites/island.json)`);
    const v = islandView(o, 0);
    const tex = islandTexture(this.scene, id, v.frame, v.flip);
    const img = this.scene.add.image(0, 0, tex.key).setOrigin(0, 0).setDepth(-999);
    const sh = ground ? null : islandShadowTexture(this.scene, id, v.frame, v.flip);
    const shadow = sh ? this.scene.add.image(0, 0, sh.key).setOrigin(0, 0).setDepth(SHADOW_DEPTH) : null;
    const s: ObjectSprite = { img, shadow, foot: tex.foot, shadowFoot: sh?.foot ?? [0, 0], ground, at: { sx: 0, sy: 0 } };
    this.moveObject(s, foot);
    return s;
  }

  private moveObject(s: ObjectSprite, foot: Vec2): void {
    const { sx, sy } = project(foot.x, foot.y);
    s.img.setPosition(sx - s.foot[0], sy - s.foot[1]);
    if (!s.ground) s.img.setDepth(foot.y);
    s.shadow?.setPosition(sx - s.shadowFoot[0], sy - s.shadowFoot[1]);
    s.at = { sx, sy };
  }

  /** 이 섬의 시설 위치로 (옮긴 시설). hidden = 배치 모드에서 들고 있는 시설 (원래 자리에서 감춤) */
  setFacilities(facs: readonly Facility[], hidden: string | null): void {
    const sig = `${facs.map((f) => `${f.id}:${f.x}:${f.y}`).join('|')}/${hidden}`;
    if (sig === this.facilitySig) return;
    this.facilitySig = sig;
    for (const f of facs) {
      const s = this.facilities.get(f.id);
      if (!s) continue;
      this.moveObject(s, footOf(f));
      s.img.setVisible(f.id !== hidden);
      s.shadow?.setVisible(f.id !== hidden);
    }
  }

  /** 프레임마다: 물 반짝임, 가까운 시설 위 [E], 나비 */
  update(timeMs: number, near: string | null): void {
    this.ground.setTexture(`islandGround${Math.floor(timeMs / WATER_FRAME_MS) % 2}`);
    const g = this.prompt;
    g.clear();
    const at = near ? this.facilities.get(near)?.at : undefined;
    if (at) {
      const x = at.sx - PROMPT_DX, y = at.sy - PROMPT_DY;
      dot(g, x, y, colorInt('global.outline'), 9, 9);
      dot(g, x + 1, y + 1, colorInt('island.lampCore'), 7, 7);
      drawText(g, 'E', x + 3, y + 2, { color: 'global.outline', outline: 'none' });
    }
    this.drawButterflies(timeMs);
    this.sky.update(timeMs);
  }

  /** 나비 3마리 (승인 데모: 날개 두 점 + 몸 두 점, 색 하늘·노랑·흰): 천천히 맴돌며 날갯짓 */
  private drawButterflies(t: number): void {
    const g = this.butterflies, s = t / 1000;
    g.clear();
    const { w } = islandScreenSize();
    const wings = ['island.sky', 'island.yellow', 'island.foam'];
    wings.forEach((c, i) => {
      const cx = (w * (i + 1)) / 4 + Math.sin(s * 0.3 + i * 2) * 60, cy = FLOOR_TOP + 40 + i * 50 + Math.sin(s * 0.7 + i) * 12;
      const x = Math.round(cx), y = Math.round(cy), open = Math.floor(s * 6 + i) % 2 === 0;
      dot(g, x, y, colorInt(c));
      dot(g, x + 2, y, colorInt(c));
      if (!open) {
        dot(g, x, y + 1, colorInt(c));
        dot(g, x + 2, y + 1, colorInt(c));
      }
      dot(g, x + 1, y, colorInt('global.outline'), 1, 2);
    });
  }
}
