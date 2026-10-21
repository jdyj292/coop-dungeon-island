// 시뮬레이션 → 상태 스키마 (docs/network.md 5장). 매 틱 반영하고 전송은 20Hz 패치가 변경분만 보낸다
import { hasArmor, playerStateName, type Monster, type RoomSim, type SimPlayer, type ZoneArea } from '@game/shared';
import { MonsterState, ZoneState, type DungeonState, type PlayerState } from '../schema/DungeonState';

const int = (n: number) => Math.round(n);
/** 시각 값(쿨타임 끝·행동 시작)은 이만큼 이상 달라질 때만 갱신 (매 틱 바뀌는 값 전송 방지) */
const TIME_EPS_MS = 20;

/** moved = 이번 틱에 걸은 거리 (걷기·달리기 구분) */
export function syncPlayer(s: PlayerState, sp: SimPlayer, moved: number, now: number): void {
  const p = sp.state, run = p.fighter.run;
  s.x = int(p.pos.x);
  s.y = int(p.pos.y);
  s.facing = p.facing;
  s.state = playerStateName(p, moved);
  const actionId = run ? run.def.id : '';
  // 같은 행동이 이어지면 시작 시각을 다시 쓰지 않는다 (평타 연속은 id가 바뀜)
  if (actionId !== s.actionId || (run && Math.abs(now - run.t * 1000 - s.actionStart) > TIME_EPS_MS)) {
    s.actionId = actionId;
    s.actionStart = run ? now - run.t * 1000 : 0;
  }
  s.hp = int(p.hp);
  s.maxHp = p.maxHp;
  s.ultGauge = int(p.ult);
  const v = s.priv;
  v.mp = int(p.mp);
  v.potionHp = p.potions.hp;
  v.potionMp = p.potions.mp;
  v.feathers = p.feathers;
  for (const [id, left] of Object.entries(p.cooldowns)) {
    if (left <= 0) {
      if (v.cooldowns.has(id)) v.cooldowns.delete(id);
      continue;
    }
    const end = now + left * 1000;
    if (Math.abs((v.cooldowns.get(id) ?? 0) - end) > TIME_EPS_MS) v.cooldowns.set(id, end);
  }
}

function monsterStateName(m: Monster): string {
  const b = m.body;
  if (b.state === 'air') return 'airborne';
  if (b.state !== 'idle') return b.state;
  if (m.mode === 'attack') return 'action';
  if (m.mode === 'selfStun') return 'dizzy';
  if (m.mode === 'groggy') return 'groggy';
  return m.moving ? 'chase' : 'idle';
}

export function syncMonster(s: MonsterState, m: Monster, now: number): void {
  s.x = int(m.body.x);
  s.y = int(m.body.y);
  s.z = int(m.body.z);
  s.facing = m.facing;
  s.state = monsterStateName(m);
  const id = m.attack?.def.id ?? '';
  if (id !== s.actionId || (m.attack && Math.abs(now - m.attack.t * 1000 - s.actionStart) > TIME_EPS_MS)) {
    s.actionId = id;
    s.actionStart = m.attack ? now - m.attack.t * 1000 : 0;
  }
  s.hpRatio = Math.ceil((255 * m.hp) / m.maxHp);
  s.superArmor = hasArmor(m);
}

/** 몬스터·장판 목록 맞추기 (새로 생기면 추가, 퇴장하면 삭제) */
export function syncWorld(state: DungeonState, sim: RoomSim, now: number): void {
  const alive = new Set<string>();
  for (const m of sim.alive) {
    const key = String(m.id);
    alive.add(key);
    let s = state.monsters.get(key);
    if (!s) state.monsters.set(key, (s = new MonsterState().assign({ id: key, type: m.kind })));
    syncMonster(s, m, now);
  }
  for (const key of [...state.monsters.keys()]) if (!alive.has(key)) state.monsters.delete(key);
  syncZones(state, sim.zones, now);
}

function syncZones(state: DungeonState, zones: ZoneArea[], now: number): void {
  const live = new Set(zones.map((z) => String(z.id)));
  for (const z of zones) {
    const key = String(z.id);
    if (!state.zones.has(key)) {
      state.zones.set(key, new ZoneState().assign({ id: key, attackId: z.attackId, x: int(z.x), y: int(z.y), endsAt: now + z.left * 1000 }));
    }
  }
  for (const key of [...state.zones.keys()]) if (!live.has(key)) state.zones.delete(key);
}
