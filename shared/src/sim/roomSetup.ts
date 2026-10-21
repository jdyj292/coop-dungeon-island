// 방·웨이브 → 출현 위치, 웨이브 진행. Tiled 맵(roadmap 3장, docs/dungeon.md 10장)이 생기기 전까지 쓰는 임시 자동 배치
// 클라이언트 로컬 던전과 서버 DungeonRoom이 같이 쓴다
import { TILE } from '../constants';
import { MONSTERS, ROOMS } from '../data/load';
import type { Bounds, Vec2 } from '../movement';
import type { Spawn } from './room';

export type RoomDef = NonNullable<(typeof ROOMS)[string]>['rooms'][number];

/** 1층 n번 방 (1부터, 범위 밖이면 1번) */
export function floorRoom(floor: string, n: number): RoomDef {
  const rooms = ROOMS[floor]!.rooms;
  return rooms[Math.min(rooms.length, Math.max(1, n)) - 1]!;
}

/** 방 크기(px)와 이동 범위 */
export function roomBounds(room: RoomDef): { width: number; depth: number; bounds: Bounds } {
  const [tw, td] = room.size as [number, number];
  const width = tw * TILE, depth = td * TILE;
  return { width, depth, bounds: { minX: TILE / 2, maxX: width - TILE / 2, minY: 0, maxY: depth } };
}

/** 입장 위치: 왼쪽 3타일, 깊이는 인원 수로 나눔 (1인 = 가운데) */
export function entryPos(index: number, partySize: number, depth: number): Vec2 {
  return { x: 3 * TILE, y: (depth * (index + 1)) / (partySize + 1) };
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

/** 웨이브 진행: 몬스터를 모두 기절시키면 다음 웨이브, 마지막이면 방 클리어 (CLAUDE.md 핵심 게임 규칙) */
export class WaveRunner {
  /** 다음에 나올 웨이브 (모두 끝나면 waves.length) */
  wave = 0;
  cleared = false;

  constructor(readonly room: RoomDef) {}

  /** 다음 웨이브 출현 목록 (없으면 빈 목록) */
  next(): Spawn[] {
    const w = this.room.waves[this.wave];
    if (!w) return [];
    this.wave++;
    const { width, depth } = roomBounds(this.room);
    return waveSpawns(w.monsters, width, depth);
  }

  /** 남은 몬스터 수를 보고 진행. 새 웨이브면 출현 목록, 방금 클리어면 'clear' */
  check(alive: number): Spawn[] | 'clear' | null {
    if (this.cleared || alive) return null;
    const next = this.next();
    if (next.length) return next;
    this.cleared = true;
    return 'clear';
  }
}
