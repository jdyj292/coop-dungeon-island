// 방 소품 그리기 (sprites.md 11장, 데이터 props.json): 장애물(바위·그루터기), 뒤쪽 벽의 문, 귀환 고리, 보물상자
// 위치는 맵(maps/<map>.json). 승인된 그림이 없는 장애물은 임시 판으로 (roadmap 3-2 전 표시)
import type Phaser from 'phaser';
import type { Block, RoomMap } from '@game/shared';
import { colorInt } from '../palette';
import { spriteData } from '../sprites/data';
import { propTexture } from '../sprites/textures';
import { drawText } from '../ui/pixelFont';
import { project } from './layout';

/** 바닥에 깔린 것(귀환 고리)은 그림자 높이, 문은 벽 높이 — 캐릭터보다 항상 뒤 */
const DEPTH_FLOOR = -450;
const DEPTH_WALL = -900;
const TEMP: Record<string, { body: string; top: string }> = {
  rock: { body: 'floors.1.bg.wallDark', top: 'floors.1.bg.wall' },
  stump: { body: 'floors.1.env.trunkDark', top: 'floors.1.env.trunk' },
};
const TEMP_RISE = 6;
/** 출구 인원 글자: 문(24px) 위 */
const EXIT_TEXT_ABOVE = 31;

export class PropLayer {
  private doorOut: Phaser.GameObjects.Image | null = null;
  private ring: Phaser.GameObjects.Image | null = null;
  private chest: Phaser.GameObjects.Image | null = null;
  private cleared = false;
  private clock = 0;
  /** 출구 앞에 모인 인원 "1/2" (문 위, 파티일 때) */
  private exitText: Phaser.GameObjects.Graphics;
  private doorOutAt: { x: number } | null;
  private lastExit = '';

  constructor(private scene: Phaser.Scene, map: RoomMap) {
    for (const b of map.blocks) this.block(b);
    if (map.doorIn) this.put('door', 'closed', map.doorIn.x, 0, DEPTH_WALL);
    if (map.doorOut) this.doorOut = this.put('door', 'closed', map.doorOut.x, 0, DEPTH_WALL);
    if (map.returnPoint) this.ring = this.put('returnRing', 'off', map.returnPoint.x, map.returnPoint.y, DEPTH_FLOOR);
    if (map.chest) this.chest = this.put('chest', 'closed', map.chest.x, map.chest.y, map.chest.y);
    this.doorOutAt = map.doorOut;
    this.exitText = scene.add.graphics().setDepth(DEPTH_WALL + 1);
  }

  /** 출구 앞 인원 (need 2 이상일 때만 보임) */
  setExit(at: number, need: number): void {
    const s = this.cleared && need >= 2 && this.doorOutAt ? `${at}/${need}` : '';
    if (s === this.lastExit) return;
    this.lastExit = s;
    this.exitText.clear();
    if (!s) return;
    const { sx, sy } = project(this.doorOutAt!.x, 0);
    drawText(this.exitText, s, sx, sy - EXIT_TEXT_ABOVE, { color: at === need ? 'global.allyFx.gold' : 'global.allyFx.white', align: 'center' });
  }

  /** 방 클리어: 출구 문 열림, 귀환 고리 켜짐 (상자 열기는 3-4 보상) */
  setCleared(on: boolean): void {
    this.cleared = on;
    if (this.doorOut) this.frame(this.doorOut, 'door', on ? 'open' : 'closed');
  }

  /** 순환 그림 (귀환 고리 반짝임) */
  update(dt: number): void {
    this.clock += dt;
    const p = spriteData().props.returnRing;
    if (!this.ring || !p) return;
    const lit = [p.states[this.cleared ? 'lit' : 'off'] ?? 'off'].flat();
    this.frame(this.ring, 'returnRing', lit[Math.floor(this.clock / p.idleSec) % lit.length]!);
  }

  private has(id: string): boolean {
    return !!spriteData().props[id];
  }

  /** 발밑(foot)을 로직 위치 (x, 깊이 y)에 맞춘다 */
  private put(id: string, frame: string, x: number, y: number, depth: number): Phaser.GameObjects.Image | null {
    if (!this.has(id)) return null;
    const img = this.scene.add.image(0, 0, '__DEFAULT').setDepth(depth);
    img.setData('at', { x, y });
    this.frame(img, id, frame);
    return img;
  }

  private frame(img: Phaser.GameObjects.Image, id: string, frame: string): void {
    const tex = propTexture(this.scene, id, frame), at = img.getData('at') as { x: number; y: number };
    const { sx, sy } = project(at.x, at.y);
    img.setTexture(tex.key).setOrigin(tex.foot[0] / img.width, (tex.foot[1] + 1) / img.height).setPosition(sx, sy);
  }

  /** 장애물: 칸 가운데 아래(가장 앞 줄)에 발밑, 깊이 정렬은 캐릭터와 같은 기준 (y) */
  private block(b: Block): void {
    if (this.put(b.kind, 'idle', (b.x0 + b.x1) / 2, b.y1, b.y1)) return;
    const s = TEMP[b.kind] ?? TEMP.rock!, a = project(b.x0, b.y0), c = project(b.x1, b.y1);
    const g = this.scene.add.graphics().setDepth(b.y1);
    g.fillStyle(colorInt(s.body), 1).fillRect(a.sx, a.sy - TEMP_RISE, c.sx - a.sx, c.sy - a.sy + TEMP_RISE);
    g.fillStyle(colorInt(s.top), 1).fillRect(a.sx, a.sy - TEMP_RISE, c.sx - a.sx, 2);
  }
}
