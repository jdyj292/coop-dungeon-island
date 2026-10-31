// RoomSim 특수 판정 연결 (room.ts에서 분리): 예약 판정(반복·후속·연발·해제·벽꿍, skillExtras.ts)과
// SK-4 1차b 새 판정 — 투사체 왕복·끝 폭발·분열(bolts.ts), 검흔 터짐(scar.ts), 번개 연쇄(chain.ts), 가속장(아군 버프),
// SK-4 3차 보조 — 여진·올려 검기·검기 순환·과열·구슬 확장 끝 폭발·역장 (효과 값은 PlayerState.perks)
import { skillDef, type ActionDef } from '../actions';
import { knockDown } from '../body';
import { PLAYER } from '../data/load';
import { slowMonster, type Monster } from '../monster/state';
import { hastePlayer, type PlayerState } from '../player';
import { actionHits } from '../shapes';
import { blastDef, shardDef, spawnBolt, stepBolt, type Bolt, type Cast } from './bolts';
import { chainTarget } from './chain';
import type { RoomSim } from './room';
import { hopTarget, markScar, scarBurstDef, takeScars } from './scar';
import { echoesOf, placeEcho, shatterDef, strikeEcho, thawed, wallDef, type Echo } from './skillExtras';
import { hitMonster, type StrikeHit } from './strike';
import type { SimEvent, SimPlayer } from './types';

/** 스킬 active 순간: 예약 판정(연발은 같은 시전), 연쇄 첫 판정 예약, 아군 버프, 보조 올려 검기·역장 */
export function skillActive(room: RoomSim, sp: SimPlayer, def: ActionDef, cast: Cast, events: SimEvent[]): void {
  const p = sp.state;
  room.echoes.push(...echoesOf(sp.pid, def, p, room.time).map((e) => (e.kind === 'shot' ? { ...e, cast } : e)));
  const lw = p.perks?.launchWave;
  if (lw && def.id === lw.skill) {
    const wave = skillDef('gs_wave');
    room.shoot(sp, { ...wave, coef: lw.coef, projectile: { speed: lw.speed, range: lw.range * (p.perks?.projectileRangeMul ?? 1), radius: lw.radius, pierce: true } }, events, cast);
  }
  const ag = p.perks?.aegis;
  if (ag && !((p.aegisCd ?? 0) > 0)) {
    p.aegisCd = ag.cooldown;
    for (const other of room.players.values()) {
      const q = other.state.pos;
      if (!other.away && Math.hypot(q.x - p.pos.x, q.y - p.pos.y) <= ag.radius) other.state.shield = ag.time;
    }
  }
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
    if (ms.length) cycle(sp, b.cast);
    hits += room.landHits(sp, b.def, ms.map((m) => hitMonster(p, b.def, m, b.dir)), events);
    hits += burstScars(room, sp, ms, events);
    if (b.done && b.def.projectile?.blast) hits += blast(room, sp, b, events);
  }
  return hits;
}

/** 검기 순환: 스킬 투사체가 맞으면 시전 한 번에 한 번, 그 스킬을 뺀 쿨을 줄인다 */
function cycle(sp: SimPlayer, cast: Cast | undefined): void {
  const c = sp.state.perks?.cycle;
  if (!c || !cast || sp.cycled === cast.n) return;
  sp.cycled = cast.n;
  const cds = sp.state.cooldowns;
  for (const id of Object.keys(cds)) if (id !== cast.skill) cds[id] = Math.max(0, cds[id]! - c.sec);
}

/** 전장 장악: 내 둘레 radius 안 적을 짧게 감속 (매 틱 다시 걸어 둘레에 있는 동안만) */
export function auraSlow(room: RoomSim, sp: SimPlayer): void {
  const a = sp.state.perks?.aura;
  if (!a || sp.away) return;
  const p = sp.state.pos;
  for (const m of room.alive) {
    if (!m.body.ko && Math.hypot(m.body.x - p.x, m.body.y - p.y) <= a.radius) slowMonster(m, AURA_SEC, a.amount);
  }
}

/** 전장 장악 감속이 둘레를 벗어난 뒤 남는 초 */
export const AURA_SEC = 0.2;

/** 보조 노드 시간 (과열·보호막·역장 내부 쿨) */
export function tickPerkTimers(p: PlayerState, dt: number): void {
  if (p.overheat) p.overheat = Math.max(0, p.overheat - dt);
  if (p.shield) p.shield = Math.max(0, p.shield - dt);
  if (p.aegisCd) p.aegisCd = Math.max(0, p.aegisCd - dt);
}

/** 적중 뒤 보조 노드: 여진(down 판정이 맞힌 적 자리 충격파 예약), 과열(스킬 적중이면 시간 채움) */
export function afterLand(room: RoomSim, sp: SimPlayer, def: ActionDef, hits: StrikeHit[]): void {
  const perks = sp.state.perks;
  if (!hits.length || !perks) return;
  if (perks.overheat && def.mp !== undefined) sp.state.overheat = perks.overheat.time;
  const as = perks.aftershock;
  if (!as || !def.flags?.includes('down')) return;
  const { hitbox, area, projectile, repeat, after, onWall, onStatusEnd, mark, chain, status, ...rest } = def;
  const wave: ActionDef = { ...rest, coef: as.coef, area: { shape: 'circle', at: [0, 0], radius: as.radius, z: 'both' }, flags: ['downhit'] };
  for (const h of hits) room.echoes.push({ pid: sp.pid, kind: 'after', def: wave, x: h.m.body.x, y: h.m.body.y, facing: sp.state.facing, at: room.time, look: 'quake' });
}

/** 과열: 평타 투사체 뒤 delay초에 한 발 더 */
export function overheatShot(room: RoomSim, sp: SimPlayer, def: ActionDef): void {
  const oh = sp.state.perks?.overheat;
  if (!oh || !((sp.state.overheat ?? 0) > 0)) return;
  const p = sp.state;
  room.echoes.push({ pid: sp.pid, kind: 'shot', def, x: p.pos.x, y: p.pos.y, facing: p.facing, at: room.time + oh.delay });
}

/** 끝 판정: 그 자리 원형 판정 (repeat면 나머지를 예약), 분열 조각 발사 */
function blast(room: RoomSim, sp: SimPlayer, b: Bolt, events: SimEvent[]): number {
  const bl = b.def.projectile!.blast!, def = blastDef(b.def);
  const at = { pid: sp.pid, def, x: b.x, y: b.y, facing: b.dir, look: bl.repeat ? 'stick' as const : 'blast' as const };
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
    events.push({ type: 'echo', echo: { pid: sp.pid, kind: 'shatter', def, x: m.body.x, y: m.body.y, facing: sp.state.facing, at: room.time, look: 'scar' } });
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
      room.shoot(sp, e.def, events, e.cast);
      continue;
    }
    if (e.kind === 'chain') {
      chainHop(room, sp, e, events);
      continue;
    }
    placeEcho(e, room.alive);
    events.push({ type: 'echo', echo: { ...e, kind: e.kind } });
    room.countCombo(sp, room.landHits(sp, e.def, strikeEcho(e, sp.state, room.alive), events, true), events);
    // 구슬 확장·솟구침: 반복 묶음의 마지막 판정 뒤 그 자리에서 한 번 더 (감속·다운 유지 없이, 솟구침은 다운된 적까지 띄움)
    const end = e.def.repeatEnd;
    if (end && e.rep && e.k === e.rep.count - 1) {
      const { repeatEnd, status, keepDown, ...rest } = e.def;
      const def: ActionDef = end.launch ? { ...rest, coef: end.coef, flags: ['launch', 'downhit'], area: rest.area && { ...rest.area, z: 'both' } } : { ...rest, coef: end.coef };
      const burst: Echo = { ...e, kind: 'after', def, look: end.launch ? 'rise' : 'orbEnd' };
      events.push({ type: 'echo', echo: { ...burst, kind: 'after' } });
      room.countCombo(sp, room.landHits(sp, burst.def, strikeEcho(burst, sp.state, room.alive), events, true), events);
    }
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
  events.push({ type: 'echo', echo: { ...e, kind: 'shatter', x: m.body.x, y: m.body.y, look: 'chain', from: { x: e.x, y: e.y } } });
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
