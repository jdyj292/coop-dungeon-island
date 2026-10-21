// 맵 초기 오브젝트 배치 (map-gen 전용). M1~M2의 자동 배치와 같은 자리에 출현 지점을 둔다:
// 방 오른쪽 2/3에 고르게(front), 고정형(포자꽃)은 뒤쪽 구석(back), 보스는 오른쪽 가운데(boss)
import { TILE, type MonsterDef } from '../../shared/src';
import type { RoomDef } from '../../shared/src/sim/roomSetup';

export interface MapObject {
  name: string;
  x: number;
  y: number;
  props?: Record<string, string | number>;
}

/** 문 앞 바닥 깊이 (px) */
const DOOR_Y = 4;

/** 입장 순서별 깊이 비율 (1명이면 가운데) */
const START_Y = [0.5, 0.3, 0.7, 0.15];

export function roomObjects(room: RoomDef, isBoss: boolean, monsters: Record<string, MonsterDef>): MapObject[] {
  const [tw, td] = room.size as [number, number];
  const W = tw * TILE, D = td * TILE, out: MapObject[] = [];
  const r = Math.round;
  START_Y.forEach((k, i) => out.push({ name: 'player_start', x: 3 * TILE, y: r(D * k), props: { index: i } }));
  // 문은 뒤쪽 벽에 붙은 아치 (art.md 6장). 오브젝트는 문 바로 앞 바닥 (깊이 4px)
  out.push({ name: 'door_in', x: 2 * TILE, y: DOOR_Y });
  if (!isBoss) out.push({ name: 'door_out', x: W - 2 * TILE, y: DOOR_Y });
  room.waves.forEach((w, wi) => {
    const kinds = Object.entries(w.monsters).flatMap(([k, n]) => Array<string>(n).fill(k));
    const back = kinds.filter((k) => monsters[k]!.move === null).length;
    const boss = kinds.filter((k) => monsters[k]!.rank === 'boss').length;
    const front = kinds.length - back - boss;
    const wave = wi + 1;
    for (let i = 0; i < back; i++) out.push({ name: 'spawn', x: r(W - TILE * (1.5 + i * 3)), y: r(D * (i % 2 ? 0.85 : 0.15)), props: { wave, role: 'back' } });
    for (let i = 0; i < boss; i++) out.push({ name: 'spawn', x: r(W * 0.7), y: r(D / 2), props: { wave, role: 'boss' } });
    for (let i = 0; i < front; i++) {
      out.push({ name: 'spawn', x: r(W / 3 + ((i + 0.5) * (W * 2 / 3 - TILE * 2)) / front), y: r(D * (i % 2 ? 0.3 : 0.7)), props: { wave, role: 'front' } });
    }
  });
  if (room.onClear?.includes('return_point')) out.push({ name: 'return_point', x: r(W / 2), y: r(D / 2) });
  if (room.onClear?.includes('chest')) out.push({ name: 'chest', x: r(W / 2 + 3 * TILE), y: r(D * 0.3) });
  return out;
}
