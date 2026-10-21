// 서버 스냅샷 → 그리기용 객체 (PlayerState·Monster 모양). 기존 PlayerView·MonsterView·HazardLayer를 그대로 쓰기 위해
// 행동 포즈는 actionId + actionStart와 데이터로 계산한다 (docs/network.md 5·8장)
import {
  COMBAT, newMonster, newPlayerState, PLAYER, skillDef, SKILLS, weaponDef,
  type ActionDef, type ActionRun, type Monster, type PlayerState, type WeaponDef,
} from '@game/shared';
import type { MonsterSnap, PlayerSnap, PrivateView } from './connection';

const sec = (ms: number) => Math.max(0, ms / 1000);

/** 행동 id → 정의와 종류 (평타 단계·대시·스킬) */
export function playerAction(weapon: WeaponDef, id: string): Pick<ActionRun, 'def' | 'kind' | 'step'> | null {
  const step = weapon.basic.findIndex((b) => b.id === id);
  if (step >= 0) return { def: weapon.basic[step]! as ActionDef, kind: 'basic', step };
  if (weapon.dash.id === id) return { def: weapon.dash as ActionDef, kind: 'dash', step: 0 };
  return SKILLS[id] ? { def: skillDef(id), kind: 'skill', step: 0 } : null;
}

/**
 * t = 그리는 서버 시각 (보간 지연 적용), now = 지금 서버 시각 (본인 쿨타임용)
 * 본인 전용 값(priv)이 있으면 MP·물약·쿨타임도 채운다
 */
export function mirrorPlayer(s: PlayerSnap, t: number, weaponId: string, priv?: PrivateView, now = t): PlayerState {
  const p = newPlayerState({ x: s.x, y: s.y });
  const el = sec(t - s.since);
  p.facing = s.facing;
  const act = s.actionId ? playerAction(weaponDef(weaponId), s.actionId) : null;
  if (act) p.fighter.run = { ...act, t: sec(t - s.actionStart) };
  p.run.running = s.state === 'run';
  if (s.state === 'backstep') p.backstep = { t: Math.min(el, PLAYER.backstep.sec) };
  if (s.state === 'hitstun') p.hurt = { kind: 'stun', left: Math.max(0, PLAYER.hurt.stunSec - el) };
  if (s.state === 'down') p.hurt = { kind: 'down', left: Math.max(0, PLAYER.hurt.downSec - el) };
  p.downed = s.state === 'knocked';
  Object.assign(p, { hp: s.hp, maxHp: s.maxHp, ult: s.ult });
  if (priv) {
    p.mp = priv.mp;
    p.potions = { hp: priv.potionHp, mp: priv.potionMp };
    p.feathers = priv.feathers;
    priv.cooldowns.forEach((end, id) => { p.cooldowns[id] = sec(end - now); });
  }
  return p;
}

const BODY_STATES = new Set(['hitstun', 'down', 'getup', 'stunned']);

/** prev가 있으면 그 객체를 고쳐 쓴다 (그리기 타이머·튀기 박자 유지) */
export function mirrorMonster(s: MonsterSnap, t: number, prev?: Monster): Monster {
  const m = prev ?? newMonster(Number(s.id), s.type, s.x, s.y);
  const b = m.body, el = sec(t - s.since);
  Object.assign(b, { x: s.x, y: s.y, z: s.z, armor: s.superArmor, hitDir: -s.facing });
  b.state = s.state === 'airborne' ? 'air' : BODY_STATES.has(s.state) ? (s.state as Monster['body']['state']) : 'idle';
  b.timer = s.state === 'getup' ? COMBAT.getupSec - el : s.state === 'stunned' ? COMBAT.stunExitSec - el
    : s.state === 'down' ? COMBAT.downSec - el : 0;
  b.ko = s.state === 'stunned';
  m.facing = s.facing;
  m.mode = s.state === 'action' ? 'attack' : s.state === 'dizzy' ? 'selfStun' : s.state === 'groggy' ? 'groggy' : 'idle';
  const def = s.actionId ? m.def.attacks.find((a) => a.id === s.actionId) : undefined;
  m.attack = def ? { def, t: sec(t - s.actionStart), dir: s.facing, struck: [] } : null;
  m.moving = s.state === 'chase';
  m.hopT = m.moving ? el : 0;
  m.hp = Math.round((s.hpRatio / 255) * m.def.hp);
  return m;
}
