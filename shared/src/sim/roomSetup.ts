// 방·웨이브 → 출현 위치, 웨이브 진행. 위치는 Tiled 맵(maps/<map>.json), 종류·수·웨이브는 rooms.json (docs/dungeon.md 10장)
// 클라이언트 로컬 던전과 서버 DungeonRoom이 같이 쓴다
import { COMBAT, MONSTERS, ROOMS } from '../data/load';
import { roomMap } from '../map/maps';
import type { RoomMap, SpawnPoint } from '../map/tiled';
import { TILE } from '../constants';
import type { Bounds, Vec2 } from '../movement';
import type { Spawn } from './room';

export type RoomDef = NonNullable<(typeof ROOMS)[string]>['rooms'][number];

/** 1층 n번 방 (1부터, 범위 밖이면 1번) */
export function floorRoom(floor: string, n: number): RoomDef {
  const rooms = ROOMS[floor]!.rooms;
  return rooms[Math.min(rooms.length, Math.max(1, n)) - 1]!;
}

export const mapOf = (room: RoomDef): RoomMap => roomMap(room.map);

/** 방 크기(px)와 이동 범위 (장애물 포함) */
export function roomBounds(room: RoomDef): { width: number; depth: number; bounds: Bounds } {
  const m = mapOf(room);
  return { width: m.width, depth: m.depth, bounds: { minX: TILE / 2, maxX: m.width - TILE / 2, minY: 0, maxY: m.depth, blocks: m.blocks } };
}

/** 들어온 플레이어가 우물에서 떨어지는 시간: wellDrop 방(층 첫 방)만, 아니면 0 (dungeon.md 2장) */
export const arriveSecOf = (room: RoomDef): number => (room.wellDrop ? COMBAT.arriveSec : 0);

/** 입장 위치: 맵 player_start (입장 순서). 모자라면 왼쪽 3타일 가운데 */
export function entryPos(room: RoomDef, index: number): Vec2 {
  const m = mapOf(room);
  return { ...(m.starts[index] ?? m.starts[0] ?? { x: 3 * TILE, y: m.depth / 2 }) };
}

/**
 * 웨이브 출현: 그 웨이브의 spawn 지점에 배치. 고정형(포자꽃)은 back, 보스는 boss, 나머지는 front 지점을 먼저 쓰고
 * 모자라면 남은 지점 아무 데나 (data-validate가 수를 검사)
 */
export function mapSpawns(map: RoomMap, wave: number, monsters: Record<string, number>): Spawn[] {
  const free = map.spawns.filter((s) => s.wave === wave);
  const take = (role: SpawnPoint['role']): Vec2 => {
    const i = Math.max(0, free.findIndex((s) => s.role === role));
    const [p] = free.splice(i, 1);
    if (!p) throw new Error(`맵에 웨이브 ${wave} 출현 지점이 모자람`);
    return p;
  };
  const kinds = Object.entries(monsters).flatMap(([kind, n]) => Array<string>(n).fill(kind));
  const roleOf = (k: string): SpawnPoint['role'] => (MONSTERS[k]!.rank === 'boss' ? 'boss' : MONSTERS[k]!.move === null ? 'back' : 'front');
  // 역할이 정해진 것(보스·고정형) 먼저
  const order = [...kinds].sort((a, b) => Number(roleOf(a) === 'front') - Number(roleOf(b) === 'front'));
  return order.map((kind) => {
    const p = take(roleOf(kind));
    return { kind, x: p.x, y: p.y };
  });
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
    return mapSpawns(mapOf(this.room), this.wave, w.monsters);
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
