// 맵 목록: maps/<map>.json (Tiled 원본을 그대로 읽는다, 방마다 rooms.json map 키)
import { parseTiledMap, type RoomMap } from './tiled';
import f1r1 from '../../../maps/floor1/room1.json';
import f1r2 from '../../../maps/floor1/room2.json';
import f1r3 from '../../../maps/floor1/room3.json';
import f1r4 from '../../../maps/floor1/room4.json';
import f1r5 from '../../../maps/floor1/room5.json';
import f1boss from '../../../maps/floor1/boss.json';

const RAW: Record<string, unknown> = {
  'floor1/room1': f1r1, 'floor1/room2': f1r2, 'floor1/room3': f1r3, 'floor1/room4': f1r4, 'floor1/room5': f1r5, 'floor1/boss': f1boss,
};

const cache = new Map<string, RoomMap>();

/** 맵 이름 목록 (data-validate용) */
export const MAP_NAMES = Object.keys(RAW);

export function roomMap(name: string): RoomMap {
  let m = cache.get(name);
  if (!m) {
    const raw = RAW[name];
    if (!raw) throw new Error(`맵 '${name}' 없음 (shared/src/map/maps.ts에 추가)`);
    cache.set(name, (m = parseTiledMap(raw, name)));
  }
  return m;
}
