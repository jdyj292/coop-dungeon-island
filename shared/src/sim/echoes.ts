// RoomSim 특수 판정 연결 (room.ts에서 분리): 예약 판정(반복·후속·연발·해제·벽꿍, skillExtras.ts)과
// SK-4 1차b 새 판정 — 투사체 왕복·끝 폭발·분열(bolts.ts), 검흔 터짐(scar.ts), 번개 연쇄(chain.ts), 가속장(아군 버프)
import type { ActionDef } from '../actions';
import { knockDown } from '../body';
import { PLAYER } from '../data/load';
import type { Monster } from '../monster/state';
import { hastePlayer } from '../player';
import { actionHits } from '../shapes';
import { blastDef, shardDef, spawnBolt, stepBolt, type Bolt } from './bolts';
import { chainTarget } from './chain';
import type { RoomSim } from './room';
import { hopTarget, markScar, scarBurstDef, takeScars } from './scar';
import { echoesOf, placeEcho, shatterDef, strikeEcho, thawed, wallDef, type Echo } from './skillExtras';
import { hitMonster } from './strike';
import type { SimEvent, SimPlayer } from './types';

/** 스킬 active 순간: 예약 판정, 연쇄 첫 판정 예약, 아군 버프 */
export function skillActive(room: RoomSim, sp: SimPlayer, def: ActionDef): void {
  const p = sp.state;
  room.echoes.push(...echoesOf(sp.pid, def, p, room.time));
  if (def.chain) room.echoes.push({ pid: sp.pid, kind: 'chain', def, x: p.pos.x, y: p.pos.y, facing: p.facing, at: room.time, chain: { left: def.chain.count, hit: [] } });
  const buff = def.allyBuff;
  if (buff) {
    const o = { x: p.pos.x, y: p.pos.y, facing: p.facing };
    for (const other of room.players.values()) {
      if (other.away) continue;
      const q = other.state.pos;
      if (other === sp || actionHits(o, def, { x: q.x, y: q.y, airborne: false, hurtbox: PLAYER.hurtbox })) hastePlayer(other.state, buff.time, buff.cooldownMul);
    }
  }
}

/** 이 플레이어의 투사체 한 틱: 적중·검흔 터짐, 돌아서면 다시 알림, 끝나면 폭발·분열. 적중 수 */
export function stepPlayerBolts(room: RoomSim, sp: SimPlayer, dt: number, events: SimEvent[]): number {
  let hits = 0;
  const p = sp.state;
  for (const b of room.bolts) {
    if (b.pid !== sp.pid || b.done) continue;
    const ms = stepBolt(b, dt, room.bounds, room.alive, p.pos.x);
    if (b.turned) events.push({ type: 'bolt', bolt: b });
    hits += room.landHits(sp, b.def, ms.map((m) => hitMonster(p, b.def, m, b.dir)), events);
    hits += burstScars(room, sp, ms, events);
    if (b.done && b.def.projectile?.blast) hits += blast(room, sp, b, events);
  }
  return hits;
}

/** 끝 판정: 그 자리 원형 판정 (repeat면 나머지를 예약), 분열 조각 발사 */
function blast(room: RoomSim, sp: SimPlayer, b: Bolt, events: SimEvent[]): number {
  const bl = b.def.projectile!.blast!, def = blastDef(b.def);
  const at = { pid: sp.pid, def, x: b.x, y: b.y, facing: b.dir };
  for (let k = 1; k < (bl.repeat?.count ?? 1); k++) room.echoes.push({ ...at, kind: 'repeat', at: room.time + k * bl.repeat!.interval });
  if (bl.shards) {
    const sd = shardDef(b.def);
    for (const dy of bl.shards.lanes) {
      for (const dir of [b.dir, -b.dir]) {
        const s = spawnBolt(room.nextId(), sp.pid, sd, b.x, b.y + dy, dir, 0);
        room.bolts.push(s);
        events.push({ type: 'bolt', bolt: s });
      }
    }
  }
  const e: Echo = { ...at, kind: 'after', at: room.time };
  events.push({ type: 'echo', echo: { ...e, kind: 'after' } });
  return room.landHits(sp, def, strikeEcho(e, sp.state, room.alive), events, true);
}

/** 내 투사체에 맞은 적의 내 검흔이 터짐 (hop이면 옮겨감) */
function burstScars(room: RoomSim, sp: SimPlayer, ms: Monster[], events: SimEvent[]): number {
  let hits = 0;
  for (const { m, scar } of takeScars(sp.pid, ms)) {
    if (m.body.ko) continue;
    const def = scarBurstDef(scar.def);
    events.push({ type: 'echo', echo: { pid: sp.pid, kind: 'shatter', def, x: m.body.x, y: m.body.y, facing: sp.state.facing, at: room.time } });
    hits += room.landHits(sp, def, [hitMonster(sp.state, def, m, sp.state.facing)], events, true);
    const to = scar.hops > 0 ? hopTarget(m, scar.def, room.alive) : null;
    if (to) markScar(sp.pid, scar.def, to, scar.hops - 1);
  }
  return hits;
}

/** 때가 된 예약 판정(반복·후속·연발·연쇄), 빙결이 풀린 몬스터의 해제 판정. 연출은 echo 사건 */
export function stepEchoes(room: RoomSim, events: SimEvent[]): void {
  const due = room.echoes.filter((e) => e.at <= room.time);
  room.echoes = room.echoes.filter((e) => e.at > room.time);
  for (const e of due) {
    const sp = room.players.get(e.pid);
    if (!sp || sp.away) continue;
    if (e.kind === 'shot') {
      room.shoot(sp, e.def, events);
      continue;
    }
    if (e.kind === 'chain') {
      chainHop(room, sp, e, events);
      continue;
    }
    placeEcho(e, room.alive);
    events.push({ type: 'echo', echo: { ...e, kind: e.kind } });
    room.countCombo(sp, room.landHits(sp, e.def, strikeEcho(e, sp.state, room.alive), events, true), events);
  }
  for (const m of thawed(room.alive)) {
    const by = m.frozenBy!, sp = room.players.get(by.pid);
    delete m.frozenBy;
    if (!sp || sp.away) continue;
    const def = shatterDef(by.def);
    events.push({ type: 'echo', echo: { pid: by.pid, kind: 'shatter', def, x: m.body.x, y: m.body.y, facing: sp.state.facing, at: room.time } });
    room.countCombo(sp, room.landHits(sp, def, [hitMonster(sp.state, def, m, sp.state.facing)], events, true), events);
  }
}

/** 연쇄 한 번: 다음 대상을 맞히고 (연출은 해제와 같은 적중 섬광) 남았으면 그 자리에서 다음을 예약 */
function chainHop(room: RoomSim, sp: SimPlayer, e: Echo, events: SimEvent[]): void {
  const c = e.chain!, m = chainTarget(e, e.def, room.alive, c.hit);
  if (!m) return;
  c.hit.push(m.id);
  events.push({ type: 'echo', echo: { ...e, kind: 'shatter', x: m.body.x, y: m.body.y } });
  room.countCombo(sp, room.landHits(sp, e.def, [hitMonster(sp.state, e.def, m, e.facing)], events, true), events);
  if (c.left > 1) room.echoes.push({ ...e, x: m.body.x, y: m.body.y, at: e.at + e.def.chain!.interval, chain: { left: c.left - 1, hit: c.hit } });
}

/** 벽꿍 (변형 onWall): 밀려 벽에 닿은 몬스터를 다운시키고 추가 판정 (연출은 후속 판정과 같은 echo) */
export function slam(room: RoomSim, m: Monster, events: SimEvent[]): void {
  const by = m.wallBy!, sp = room.players.get(by.pid);
  delete m.wallBy;
  if (!sp || sp.away || m.body.ko) return;
  const def = wallDef(by.def);
  events.push({ type: 'echo', echo: { pid: by.pid, kind: 'after', def, x: m.body.x, y: m.body.y, facing: sp.state.facing, at: room.time } });
  const hit = hitMonster(sp.state, def, m, sp.state.facing);
  knockDown(m.body);
  room.countCombo(sp, room.landHits(sp, def, [hit], events, true), events);
}
