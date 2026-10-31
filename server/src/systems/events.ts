// 시뮬레이션 사건 → 이벤트 메시지 (docs/network.md 6장). 계속되는 것(위치·HP·행동)은 상태로 가므로 여기서 보내지 않는다
import { gradeTiming, type Projectile, type S2C, type SimEvent } from '@game/shared';

export type Outgoing = { [K in keyof S2C]: { type: K; msg: S2C[K] } }[keyof S2C];

const int = (n: number) => Math.round(n);

/** combos = 이번 틱 적중한 플레이어의 콤보 수 */
export function eventsFor(events: SimEvent[], now: number, combos: Map<string, number>): Outgoing[] {
  const out: Outgoing[] = [];
  const comboPids = new Set<string>();
  for (const e of events) {
    if (e.type === 'hit') {
      const grade = e.def.fx?.grade ?? 'light', b = e.m.body;
      out.push({ type: 'hit', msg: {
        attacker: e.pid, target: e.m.id, damage: e.damage, strength: e.def.strength ?? 'light', flags: e.def.flags ?? [],
        hitstop: gradeTiming(grade).hitstop, recoil: e.recoil, act: e.act, actT: e.actT, x: int(b.x), y: int(b.y), z: int(b.z), t: now,
      } });
      comboPids.add(e.pid);
    } else if (e.type === 'teamMilestone') {
      out.push({ type: 'teamMilestone', msg: { count: e.count } });
    } else if (e.type === 'bolt') {
      const b = e.bolt;
      out.push({ type: 'bolt', msg: { id: b.id, kind: b.def.id, pid: b.pid, x: int(b.x), y: int(b.y), dir: b.dir, t0: now, speed: b.def.projectile!.speed, r: b.def.projectile!.radius, ...(b.dy ? { dy: b.dy } : {}), ...(b.ghost ? { ghost: true } : {}) } });
    } else if (e.type === 'boltEnd') {
      const b = e.bolt;
      out.push({ type: 'boltEnd', msg: { id: b.id, reason: b.hit.length ? 'hit' : 'range', x: int(b.x), y: int(b.y) } });
    } else if (e.type === 'echo') {
      const c = e.echo;
      const extra = c.look ? { look: c.look, ...(c.from ? { fx: int(c.from.x), fy: int(c.from.y) } : {}) } : {};
      out.push({ type: 'echo', msg: { pid: c.pid, kind: c.kind, act: c.def.id, x: int(c.x), y: int(c.y), facing: c.facing, t: now, ...extra } });
    } else if (e.type === 'playerHit') {
      out.push({ type: 'playerHit', msg: { pid: e.pid, damage: e.damage, strength: e.def.strength ?? 'light', from: e.from?.id ?? null } });
    }
  }
  for (const pid of comboPids) out.push({ type: 'combo', msg: { pid, count: combos.get(pid) ?? 0 } });
  return out;
}

/** 투사체 생김·사라짐: 틱 전후 목록 비교 (before는 같은 객체라 사라진 위치·맞힌 사람이 남아 있다) */
export function projectileEvents(before: Map<number, Projectile>, after: Projectile[], now: number): Outgoing[] {
  const out: Outgoing[] = [];
  const live = new Set(after.map((p) => p.id));
  for (const p of after) {
    if (!before.has(p.id)) {
      out.push({ type: 'projSpawn', msg: { id: p.id, kind: p.def.id, owner: p.ownerId, x: int(p.x), y: int(p.y), z: 0, dir: p.dir, dy: Math.round(p.dy * 1000) / 1000, t0: now } });
    }
  }
  for (const [id, p] of before) {
    if (!live.has(id)) out.push({ type: 'projEnd', msg: { id, reason: p.hitPids.length ? 'hit' : 'range', x: int(p.x), y: int(p.y) } });
  }
  return out;
}
