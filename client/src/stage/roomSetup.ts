// 방·웨이브 → 출현 위치. Tiled 맵(roadmap 3장, docs/dungeon.md 10장)이 생기기 전까지 쓰는 임시 자동 배치
import { MONSTERS, ROOMS, TILE, type Spawn } from '@game/shared';

export type RoomDef = NonNullable<(typeof ROOMS)[string]>['rooms'][number];

/** 1층 n번 방 (1부터, 범위 밖이면 1번) */
export function floorRoom(floor: string, n: number): RoomDef {
  const rooms = ROOMS[floor]!.rooms;
  return rooms[Math.min(rooms.length, Math.max(1, n)) - 1]!;
}

/**
 * 방 오른쪽 2/3에 고르게, 깊이는 앞뒤 번갈아. 고정형(포자꽃)은 뒤쪽 구석, 보스는 오른쪽 가운데
 * (dungeon.md 5장 "포자꽃 2(뒤쪽 구석)")
 */
export function waveSpawns(monsters: Record<string, number>, roomW: number, roomD: number): Spawn[] {
  const kinds = Object.entries(monsters).flatMap(([kind, n]) => Array<string>(n).fill(kind));
  const fixed = kinds.filter((k) => MONSTERS[k]!.move === null);
  const boss = kinds.filter((k) => MONSTERS[k]!.rank === 'boss');
  const rest = kinds.filter((k) => !fixed.includes(k) && !boss.includes(k));
  const out: Spawn[] = [];
  fixed.forEach((kind, i) => out.push({ kind, x: roomW - TILE * (1.5 + i * 3), y: roomD * (i % 2 ? 0.85 : 0.15) }));
  boss.forEach((kind) => out.push({ kind, x: roomW * 0.7, y: roomD / 2 }));
  rest.forEach((kind, i) => out.push({
    kind,
    x: roomW / 3 + ((i + 0.5) * (roomW * 2 / 3 - TILE * 2)) / rest.length,
    y: roomD * (i % 2 ? 0.3 : 0.7),
  }));
  return out;
}
