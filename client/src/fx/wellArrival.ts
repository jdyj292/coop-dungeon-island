// 던전 첫 방 도착 연출 (docs/dungeon.md 2·5장, motion.md 6장): 우물에서 떨어지는 높이, 잠든 몬스터 Zzz와 깨어남. 판정은 서버(shared) — 여기는 그리기만
import { COMBAT, type Monster, type RoomDef } from '@game/shared';
import fx from '../../data/fx.json';
import { colorInt } from '../palette';
import type { MonsterView } from '../view/monsterView';
import { dot } from './layer';

/** 방에 들어갈 때 화면이 밝아지는 시간 */
const ROOM_FADE_MS = 300;

/** 방 입장 밝아지기: 우물에서 떨어지는 방은 섬에서 어두워진 만큼 천천히 (art.md 0장) */
export const enterFadeMs = (room: RoomDef): number => (room.wellDrop ? fx.wellHop.fadeSec * 1000 : ROOM_FADE_MS);

/** 떨어지는 중 높이: arrive = 남은 시간 (COMBAT.arriveSec → 0). 가만히 놓은 물체처럼 점점 빨라짐 */
export function dropZ(arrive: number): number {
  const T = COMBAT.arriveSec, t = Math.min(T, Math.max(0, T - arrive));
  return Math.round(fx.wellHop.dropFrom * (1 - (t / T) ** 2));
}

/** 잠든 몬스터 머리 위 Zzz. 잠에서 깨는 순간을 알려 준다 (움찔·효과음) */
export class SleepMarks {
  private g: Phaser.GameObjects.Graphics;
  private asleep = new Set<number>();

  constructor(scene: Phaser.Scene, depth: number) {
    this.g = scene.add.graphics().setDepth(depth);
  }

  /** 그린 뒤 부른다 (머리 위치 = 그려진 그림 위 끝). 이번에 깨어난 몬스터 수 */
  draw(list: { m: Monster; v: MonsterView }[], clock: number): number {
    this.g.clear();
    let woke = 0;
    const now = new Set<number>();
    list.forEach(({ m, v }, i) => {
      if (m.sleep > 0) {
        now.add(m.id);
        const img = v.view.img;
        drawZzz(this.g, Math.round(img.x), Math.round(img.y - img.displayHeight * img.originY), clock + i * 0.37);
      } else if (this.asleep.has(m.id)) {
        // 깨어나는 순간: 움찔 (피격 반응 그림)
        v.hurt = fx.reaction.hurtSec;
        woke++;
      }
    });
    this.asleep = now;
    return woke;
  }

  destroy(): void {
    this.g.destroy();
  }
}

/** z 글자 (3×3 도트, 두 개가 번갈아 떠오름) */
function drawZzz(g: Phaser.GameObjects.Graphics, x: number, y: number, clock: number): void {
  const col = colorInt('floors.1.monster.sleepCloud');
  for (let i = 0; i < 2; i++) {
    const k = (clock * 0.8 + i * 0.5) % 1, zx = x + 2 + i * 3 + Math.round(k * 2), zy = y - Math.round(k * 6) - i * 2;
    if (k > 0.85) continue;
    dot(g, zx, zy, col, 3, 1);
    dot(g, zx + 1, zy + 1, col);
    dot(g, zx, zy + 2, col, 3, 1);
  }
}
