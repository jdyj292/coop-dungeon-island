// 던전 첫 방 도착 (?drafts=1 초안, 3단계에서 서버 판정으로): 위에서 떨어져 착지, 잠든 몬스터 Zzz → 깨어남. 그림 값 fx.json wellHop
import fx from '../../data/fx.json';
import { colorInt } from '../palette';
import { dot } from './layer';

/** 초안 판정 값 (3단계에서 shared/data로): 첫 착지부터 몬스터가 깨어나기까지 */
const WAKE_SEC = 1.5;

/** 입장 후 t초 → 높이, 모션 (공중: 다리 접기, 착지 직후: 웅크림) */
export function dropAt(t: number): { z: number; motion: string | undefined; landed: boolean } {
  const { dropSec, dropFrom, landSec } = fx.wellHop;
  if (t < dropSec) return { z: Math.round(dropFrom * (1 - (t / dropSec) ** 2)), motion: 'backstepAir', landed: false };
  return { z: 0, motion: t < dropSec + landSec ? 'backstepLand' : undefined, landed: true };
}

/** 첫 방 도착 (로컬 전투): 떨어지는 동안 입력 막힘, 첫 착지부터 WAKE_SEC 뒤(또는 맞으면) 몬스터가 깨어남 */
export class ArrivalDraft {
  t = 0;
  awake = false;
  private landed = false;
  private g: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, depth: number) {
    this.g = scene.add.graphics().setDepth(depth);
  }

  /** 프레임마다. justLanded = 이번 프레임에 착지 */
  step(dt: number): { z: number; motion: string | undefined; locked: boolean; justLanded: boolean; justWoke: boolean } {
    this.t += dt;
    const d = dropAt(this.t), justLanded = d.landed && !this.landed;
    this.landed = d.landed;
    const wake = !this.awake && this.t >= fx.wellHop.dropSec + WAKE_SEC;
    if (wake) this.awake = true;
    return { z: d.z, motion: d.motion, locked: !d.landed, justLanded, justWoke: wake };
  }

  /** 맞으면 바로 깨어남. 이번에 깨었으면 true */
  wake(): boolean {
    if (this.awake) return false;
    this.awake = true;
    return true;
  }

  /** heads = 잠든 몬스터 머리 위 화면 좌표 */
  draw(heads: { x: number; y: number }[], clock: number): void {
    this.g.clear();
    if (!this.awake) heads.forEach((h, i) => drawZzz(this.g, h.x, h.y, clock + i * 0.37));
  }

  destroy(): void {
    this.g.destroy();
  }
}

/** 잠든 몬스터 머리 위 z 글자 (3×3 도트, 두 개가 번갈아 떠오름) */
export function drawZzz(g: Phaser.GameObjects.Graphics, x: number, y: number, clock: number): void {
  const col = colorInt('floors.1.monster.sleepCloud');
  for (let i = 0; i < 2; i++) {
    const k = (clock * 0.8 + i * 0.5) % 1, zx = x + 2 + i * 3 + Math.round(k * 2), zy = y - Math.round(k * 6) - i * 2;
    if (k > 0.85) continue;
    dot(g, zx, zy, col, 3, 1);
    dot(g, zx + 1, zy + 1, col);
    dot(g, zx, zy + 2, col, 3, 1);
  }
}
