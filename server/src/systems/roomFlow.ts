// 방 진행 (docs/dungeon.md 2장): 출구가 열린 뒤 살아 있는 파티원 전원이 출구 앞 구역에 서면 다음 방
// 다음 방은 새 RoomSim (플레이어 자원은 그대로, 위치는 시작 지점)
import { COMBAT, entryPos, mapOf, roomBounds, ROOMS, RoomSim, type RoomDef, type SimOptions } from '@game/shared';

export const FLOOR = 'floor1';

/** 이 층의 방 목록 (마지막 = 보스 방) */
export const floorRooms = (): RoomDef[] => ROOMS[FLOOR]!.rooms;

/** 출구 앞에 선 인원 / 필요한 인원 (쓰러진 사람 제외). 출구가 없는 방(보스)은 need 0 */
export function exitCount(sim: RoomSim, room: RoomDef): { at: number; need: number } {
  const door = mapOf(room).doorOut;
  if (!door) return { at: 0, need: 0 };
  const { halfWidth, depth } = COMBAT.exit;
  let at = 0, need = 0;
  for (const { state: p } of sim.players.values()) {
    if (p.downed) continue;
    need++;
    if (Math.abs(p.pos.x - door.x) <= halfWidth && p.pos.y <= door.y + depth) at++;
  }
  return { at, need };
}

/** 새 방 시뮬레이션. prev = 이전 방 (플레이어를 데려옴), order = pid → 입장 순서 (시작 지점 번호) */
export function buildRoom(room: RoomDef, weapon: RoomSim['weapon'], opts: SimOptions, prev: RoomSim | null, order: (pid: string) => number): RoomSim {
  const sim = new RoomSim(weapon, roomBounds(room).bounds, null, opts);
  if (prev) for (const sp of prev.players.values()) sim.adoptPlayer(sp, entryPos(room, order(sp.pid) % 4));
  return sim;
}
