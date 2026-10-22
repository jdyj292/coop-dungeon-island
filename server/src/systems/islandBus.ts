// 섬 방 ↔ 던전 방 알림 (같은 서버 프로세스 안, docs/network.md 3장)
// 출발하면 그 주민은 "탐험 중"(inDungeon), 던전이 끝나면(정산·이탈) 풀린다. 섬 방이 새로 만들어져도 이 표로 상태를 채운다
import { EventEmitter } from 'node:events';

/** users.id → 층 키 (floor1) */
const inDungeon = new Map<string, string>();
const bus = new EventEmitter();

export const islandBus = {
  /** 출발: 섬 주민 상태를 탐험 중으로 */
  departed(islandId: number, userIds: string[], floor: string): void {
    for (const id of userIds) inDungeon.set(id, floor);
    bus.emit(`island:${islandId}`, { userIds, floor });
  },
  /** 던전에서 나옴 (정산·이탈) */
  returned(islandId: number, userIds: string[]): void {
    for (const id of userIds) inDungeon.delete(id);
    bus.emit(`island:${islandId}`, { userIds, floor: null });
  },
  /** 지금 던전에 있는 층 (없으면 undefined) */
  floorOf(userId: string): string | undefined {
    return inDungeon.get(userId);
  },
  /** 섬 방이 구독 (floor null = 돌아옴). 해제 함수를 돌려준다 */
  watch(islandId: number, fn: (e: { userIds: string[]; floor: string | null }) => void): () => void {
    bus.on(`island:${islandId}`, fn);
    return () => bus.off(`island:${islandId}`, fn);
  },
};

/** 'floor1' → "dungeon:1" (주민 목록 표시) */
export const dungeonStatus = (floor: string): string => `dungeon:${floor.replace(/\D/g, '') || '1'}`;
