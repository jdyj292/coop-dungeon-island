// 한 판 돌리기: DungeonGame(서버와 같은 규칙) + 봇 → 방별 시간·피해·보상 (roadmap 3-9)
import { TICK, type S2C } from '../../shared/src';
import { floorRooms } from '../../server/src/systems/roomFlow';
import { DungeonGame } from '../../server/src/systems/dungeonGame';
import { Bot } from './bot';

export interface RoomLog {
  id: string;
  /** 방에 들어와서 클리어까지 (초) */
  fight: number;
  /** 클리어부터 다음 방까지 (출구까지 이동·상자) */
  walk: number;
  /** 봇이 STUCK_SEC 안에 못 깨서 개발 명령으로 넘김 (봇 실력 한계, 시간에서 빼고 본다) */
  stuck: boolean;
}

export interface RunLog {
  result: S2C['result']['kind'] | 'timeout';
  sec: number;
  rooms: RoomLog[];
  damageTaken: number;
  downs: number;
  coins: number;
  exp: number;
}

/** 한 판이 이 시간을 넘으면 막힌 것으로 본다 */
const MAX_SEC = 30 * 60;
/** 방 하나가 이만큼 넘게 안 끝나면 봇 막힘 → 개발 명령 clear */
const STUCK_SEC = 5 * 60;

/** invincible = 봇 HP를 매 틱 채움 (규칙이 끝까지 도는지·시간만 볼 때, 받은 피해는 그대로 셈) */
export function runOnce(party: number, seed: number, invincible = false): RunLog {
  let s = seed >>> 0;
  const rng = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  let result: S2C['result'] | null = null;
  let damageTaken = 0, downs = 0;
  const g = new DungeonGame({ room: 1, partySize: party, rng, dev: true }, {
    broadcast: (type, msg) => {
      if (type === 'result') result = msg as S2C['result'];
      if (type === 'playerHit') damageTaken += (msg as S2C['playerHit']).damage;
    },
    send: () => {},
  });
  const bots: Bot[] = [];
  for (let i = 0; i < party; i++) {
    g.join(`bot${i + 1}`, `봇${i + 1}`);
    bots.push(new Bot(g, `bot${i + 1}`));
  }
  const rooms: RoomLog[] = [];
  let roomStart = 0, clearAt: number | null = null, roomIndex = g.state.roomIndex, stuck = false;
  const wasDown = new Set<string>();
  const maxTicks = MAX_SEC / TICK;
  for (let i = 0; i < maxTicks && !result; i++) {
    const room = floorRooms()[g.state.roomIndex]!;
    for (const b of bots) b.step(room);
    if (invincible) for (const sp of g.sim.players.values()) sp.state.hp = sp.state.maxHp;
    g.tick();
    const t = g.now / 1000;
    if (g.state.doorOpen && clearAt === null) clearAt = t;
    if (clearAt === null && t - roomStart > STUCK_SEC && i % 60 === 0) {
      stuck = true;
      g.onMessage(bots[0]!.pid, 'dev', { cmd: 'clear' });
    }
    if (g.state.roomIndex !== roomIndex) {
      rooms.push({ id: floorRooms()[roomIndex]!.id, fight: (clearAt ?? t) - roomStart, walk: t - (clearAt ?? t), stuck });
      roomIndex = g.state.roomIndex;
      roomStart = t;
      clearAt = null;
      stuck = false;
    }
    for (const sp of g.sim.players.values()) {
      if (sp.state.downed && !wasDown.has(sp.pid)) downs++;
      if (sp.state.downed) wasDown.add(sp.pid);
      else wasDown.delete(sp.pid);
    }
  }
  const t = g.now / 1000;
  rooms.push({ id: floorRooms()[roomIndex]!.id, fight: (clearAt ?? t) - roomStart, walk: 0, stuck });
  const r = result as S2C['result'] | null;
  const line = r?.lines[0];
  return {
    result: r?.kind ?? 'timeout', sec: t, rooms, damageTaken, downs,
    coins: line ? line.coins : 0, exp: line ? line.exp : 0,
  };
}
