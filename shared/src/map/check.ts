// 맵 검사 (data-validate, docs/data.md 5장): 방 크기, 필수 오브젝트, 웨이브별 출현 지점 수, 장애물 겹침, 길 막힘
import { TILE } from '../constants';
import type { Issue } from '../data/crossCheck';
import type { MonsterDef, Rooms } from '../data/schema';
import { playerHalf } from '../movement';
import { hitsBlock, type Half } from './collision';
import type { RoomMap } from './tiled';

export function checkMaps(rooms: Rooms, monsters: Record<string, MonsterDef>, mapOf: (name: string) => RoomMap): Issue[] {
  const out: Issue[] = [];
  for (const [floor, f] of Object.entries(rooms)) {
    f.rooms.forEach((room, i) => {
      const where = `maps/${room.map}.json`, err = (message: string) => out.push({ level: 'error', where, message });
      let m: RoomMap;
      try {
        m = mapOf(room.map);
      } catch (e) {
        return err(String((e as Error).message));
      }
      const [tw, td] = room.size as [number, number];
      if (m.width !== tw * TILE || m.depth !== td * TILE) err(`크기 ${m.width / TILE}×${m.depth / TILE} ≠ rooms.json ${floor} ${room.id} ${tw}×${td}`);
      const bounds = { minX: 0, maxX: m.width, minY: 0, maxY: m.depth, blocks: m.blocks };
      if (m.starts.length < 4) err(`player_start ${m.starts.length}개 (4개 필요)`);
      if (!m.doorIn) err('door_in 없음');
      const last = i === f.rooms.length - 1;
      if (!last && !m.doorOut) err('door_out 없음 (보스 방 말고는 필요)');
      for (const need of room.onClear ?? []) {
        if (need === 'return_point' && !m.returnPoint) err('return_point 없음 (rooms.json onClear)');
        if (need === 'chest' && !m.chest) err('chest 없음 (rooms.json onClear)');
      }
      room.waves.forEach((w, wi) => {
        const need = Object.values(w.monsters).reduce((s, n) => s + n, 0);
        const have = m.spawns.filter((s) => s.wave === wi + 1);
        if (have.length < need) err(`웨이브 ${wi + 1} 출현 지점 ${have.length}개 < 몬스터 ${need}마리`);
        // 가장 큰 몬스터 크기로 출현 지점이 장애물과 겹치는지
        const half: Half = Object.keys(w.monsters).reduce((h, k) => {
          const hb = monsters[k]!.hurtbox;
          return { x: Math.max(h.x, hb.width / 2), y: Math.max(h.y, hb.depth / 2) };
        }, { x: 0, y: 0 });
        for (const s of have) if (hitsBlock(s, half, bounds)) err(`웨이브 ${wi + 1} 출현 지점 (${s.x}, ${s.y})이 장애물과 겹침`);
      });
      for (const s of m.starts) if (hitsBlock(s, playerHalf(), bounds)) err(`player_start (${s.x}, ${s.y})이 장애물과 겹침`);
      // 장애물이 한 세로줄(깊이 전체)을 막으면 지나갈 수 없음 (장애물은 낮게, 깊이 이동을 막지 않는다)
      for (let x = 0; x < m.width; x += TILE) {
        const cut = m.blocks.filter((b) => b.x0 <= x && x < b.x1).reduce((s, b) => s + (b.y1 - b.y0), 0);
        if (cut >= m.depth) err(`x ${x}의 세로줄이 장애물로 막힘`);
      }
      if (m.blocks.length > 3) out.push({ level: 'warn', where, message: `장애물 ${m.blocks.length}칸 (방마다 0~3개 권장, dungeon.md 10장)` });
    });
  }
  return out;
}
