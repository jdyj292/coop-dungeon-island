// 우물 입장·복귀 연출 (docs/art.md 0장, motion.md 7장): 섬에서 우물로 뛰어들기, 던전에서 돌아와 우물에서 튀어나오기. 값 fx.json wellHop
import { DEPTH_RATIO, footOf, ISLAND, type Vec2 } from '@game/shared';
import fx from '../../data/fx.json';
import { colorInt } from '../palette';
import { dot, type Effect } from './layer';

const W = fx.wellHop;

/** 우물 구멍 (로직 좌표): 시설 발밑에서 그림 holeUp px 위. 시설보다 깊이가 작아 우물 그림 뒤에 그려진다 */
export function wellHole(): Vec2 {
  const foot = footOf(ISLAND.facilities.find((f) => f.id === 'well')!);
  return { x: foot.x, y: foot.y - Math.round(W.holeUp / DEPTH_RATIO) };
}

/** 우물 그림의 깊이 (이보다 크면 우물 앞에 그려짐) */
export const wellDepth = (): number => footOf(ISLAND.facilities.find((f) => f.id === 'well')!).y;

export interface HopPose {
  x: number;
  y: number;
  /** 높이 (음수 = 구멍 속으로 가라앉는 중) */
  z: number;
  /** 우물 앞에 그릴지 (공중), 뒤에 그릴지 (구멍 속) */
  front: boolean;
  /** 다 끝남 (뛰어들기는 사라짐, 튀어나오기는 착지) */
  done: boolean;
}

/** 뛰어들기: t초 → 위치·높이. 앞 sinkAt 비율은 from에서 구멍 위까지 포물선, 나머지는 구멍 속으로 */
export function jumpAt(from: Vec2, t: number): HopPose {
  const hole = wellHole(), k = Math.min(1, t / W.jumpSec), m = Math.min(1, k / W.sinkAt);
  const z = k < W.sinkAt ? W.jumpPeak * Math.sin(m * Math.PI) : -((k - W.sinkAt) / (1 - W.sinkAt)) * W.sinkPx;
  return { x: from.x + (hole.x - from.x) * m, y: from.y + (hole.y - from.y) * m, z: Math.round(z), front: z > 0, done: k >= 1 };
}

/** 튀어나오기: 뛰어들기를 거꾸로 (구멍 속에서 솟아 to에 착지) */
export function popAt(to: Vec2, t: number): HopPose {
  const hole = wellHole(), k = Math.min(1, t / W.popSec), rise = 1 - W.sinkAt;
  if (k < rise) return { x: hole.x, y: hole.y, z: Math.round(-(1 - k / rise) * W.sinkPx), front: false, done: false };
  const m = (k - rise) / W.sinkAt;
  return { x: hole.x + (to.x - hole.x) * m, y: hole.y + (to.y - hole.y) * m, z: Math.round(W.popPeak * Math.sin(m * Math.PI)), front: true, done: k >= 1 };
}

/** 구멍에서 올라오는 버섯빛 점 (사라질 때·튀어나올 때) */
export function glowPuff(x: number, y: number, rand = Math.random): Effect[] {
  const g = W.glow, cols = ['floors.1.monster.sporeGlow', 'floors.1.env.glow'].map(colorInt);
  return Array.from({ length: g.count }, (_, i) => {
    let px = x + (rand() - 0.5) * g.spread, py = y;
    const vy = -(g.rise[0]! + rand() * (g.rise[1]! - g.rise[0]!));
    const e: Effect = {
      life: g.sec, total: g.sec,
      update(dt) {
        py += vy * dt;
        px += Math.sin(py * 0.3) * 0.2;
      },
      draw(gr) {
        dot(gr, Math.round(px), Math.round(py), cols[i % 2]!);
      },
    };
    return e;
  });
}
