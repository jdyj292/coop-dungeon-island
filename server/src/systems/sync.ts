// 시뮬레이션 → 상태 스키마 (docs/network.md 5장). 매 틱 반영하고 전송은 20Hz 패치가 변경분만 보낸다
import { chargeLevel, hasArmor, playerStateName, type Monster, type RoomSim, type SimPlayer, type ZoneArea } from '@game/shared';
import { MonsterState, ZoneState, type DungeonState, type PlayerState } from '../schema/DungeonState';

const int = (n: number) => Math.round(n);
/** 시각 값(쿨타임 끝·행동 시작)은 이만큼 이상 달라질 때만 갱신 (매 틱 바뀌는 값 전송 방지) */
const TIME_EPS_MS = 20;
/**
 * 플레이어 행동·회피 시작 시각은 본인 예측을 다시 계산하는 기준이라 거의 정확히 (히트스톱으로 멈춘 동안만 바뀐다).
 * 20ms로 두면 대시처럼 빠른 이동은 약 5px 앞서 계산됐다가 뒤로 당겨짐 (network.md 5장)
 */
const PLAYER_TIME_EPS_MS = 1;

/** moved = 이번 틱에 걸은 거리 (걷기·달리기 구분) */
export function syncPlayer(s: PlayerState, sp: SimPlayer, moved: number, now: number): void {
  const p = sp.state, run = p.fighter.run;
  s.x = int(p.pos.x);
  s.y = int(p.pos.y);
  s.facing = p.facing;
  s.dodgeDir = p.backstep?.dir ?? 0;
  s.dodgeDy = p.backstep?.dy ?? 0;
  const dodgeStart = p.backstep ? now - p.backstep.t * 1000 : 0;
  if (!dodgeStart || !s.dodgeStart || Math.abs(dodgeStart - s.dodgeStart) > PLAYER_TIME_EPS_MS) s.dodgeStart = dodgeStart;
  s.state = sp.away ? 'disconnected' : playerStateName(p, moved);
  const actionId = run ? run.def.id : '';
  // 같은 행동이 이어지면 시작 시각을 다시 쓰지 않는다 (평타 연속은 id가 바뀜).
  // 대검 충전 중에는 run.t가 멈추고 충전 시간이 늘어나므로 둘을 더한 흐른 시간으로 (충전 중에도 시작 시각이 그대로, mirror.ts가 chargeMs로 되돌림)
  const chargeSec = run?.charge?.t ?? 0;
  const start = run ? now - (run.t + chargeSec) * 1000 : 0;
  if (actionId !== s.actionId || (run && Math.abs(start - s.actionStart) > PLAYER_TIME_EPS_MS)) {
    s.actionId = actionId;
    s.actionStart = start;
  }
  s.chargeMs = int(chargeSec * 1000);
  const lv = run?.charge ? chargeLevel(p, sp.weapon) : 0;
  s.chargeLv = lv > 0 ? Math.max(1, int(lv * 255)) : 0;
  s.hp = int(p.hp);
  s.maxHp = p.maxHp;
  s.ultGauge = int(p.ult);
  s.hasted = !!p.haste;
  s.shielded = (p.shield ?? 0) > 0;
  s.aura = int(p.perks?.aura?.radius ?? 0);
  const v = s.priv;
  v.mp = int(p.mp);
  v.stamina = int(p.stamina);
  v.tired = p.tired;
  v.potionHp = p.potions.hp;
  v.potionMp = p.potions.mp;
  v.feathers = p.feathers;
  const re = p.reinput;
  v.reinputId = re?.id ?? '';
  v.reinputLeft = re?.left ?? 0;
  const reEnd = re ? now + re.window * 1000 : 0;
  if (!reEnd || Math.abs(reEnd - v.reinputEnd) > TIME_EPS_MS) v.reinputEnd = reEnd;
  const hasteEnd = p.haste ? now + p.haste.left * 1000 : 0;
  if (!hasteEnd || Math.abs(hasteEnd - v.hasteEnd) > TIME_EPS_MS) v.hasteEnd = hasteEnd;
  v.hasteMul = p.haste?.mul ?? 1;
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
  if (m.sleep > 0) return 'sleep';
  if (m.frozen > 0) return 'frozen';
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
  s.aimY = int(m.attack?.dy ?? 0);
  s.hpRatio = Math.ceil((255 * m.hp) / m.maxHp);
  s.superArmor = hasArmor(m);
  s.slowed = m.slow.left > 0;
  s.burning = m.burn.left > 0;
  s.pressed = m.pressed > 0 && m.slow.left > 0;
  s.scarred = !!m.scar && m.scar.left > 0;
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
