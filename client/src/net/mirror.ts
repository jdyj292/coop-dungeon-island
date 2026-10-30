// 서버 스냅샷 → 그리기용 객체 (PlayerState·Monster 모양). 기존 PlayerView·MonsterView·HazardLayer를 그대로 쓰기 위해
// 행동 포즈는 actionId + actionStart와 데이터로 계산한다 (docs/network.md 5·8장)
import {
  buildFrom, buildSkill, COMBAT, newMonster, newPlayerState, PLAYER, weaponDef,
  type ActionDef, type ActionRun, type Monster, type PlayerState, type SkillBuild, type WeaponDef,
} from '@game/shared';
import type { MonsterSnap, PlayerSnap, PrivateView } from './connection';

const sec = (ms: number) => Math.max(0, ms / 1000);

/** 행동 id → 정의와 종류 (평타 단계·대시·스킬). 스킬은 그 사람의 노드(변형·레벨 배율)로 */
export function playerAction(weapon: WeaponDef, id: string, skills: SkillBuild = {}): Pick<ActionRun, 'def' | 'kind' | 'step'> | null {
  const step = weapon.basic.findIndex((b) => b.id === id);
  if (step >= 0) return { def: weapon.basic[step]! as ActionDef, kind: 'basic', step };
  if (weapon.dash.id === id) return { def: weapon.dash as ActionDef, kind: 'dash', step: 0 };
  const skill = buildSkill(weapon, skills, id);
  return skill ? { def: skill, kind: 'skill', step: 0 } : null;
}

/**
 * t = 그리는 서버 시각 (보간 지연 적용), now = 지금 서버 시각 (본인 쿨타임용)
 * 본인 전용 값(priv)이 있으면 MP·물약·쿨타임도 채운다
 */
export function mirrorPlayer(s: PlayerSnap, t: number, weaponId: string, priv?: PrivateView, now = t): PlayerState {
  const p = newPlayerState({ x: s.x, y: s.y });
  const el = sec(t - s.since);
  p.facing = s.facing;
  const act = s.actionId ? playerAction(weaponDef(weaponId), s.actionId, buildFrom(s.skills ?? '')) : null;
  if (act) p.fighter.run = { ...act, t: sec(t - s.actionStart) };
  p.run.running = s.state === 'run';
  // 회피 방향은 서버 값 (본인 예측을 다시 계산할 때 앞회피가 뒤로 계산되지 않게)
  if (s.state === 'backstep') {
    const dy = s.dodgeDy ?? 0;
    // 진행 시간은 서버가 보낸 시작 시각으로 (받은 시각 since는 최대 한 패치 늦어 다시 계산한 회피가 더 물러났다가 끝에 앞으로 당겨짐)
    const bt = s.dodgeStart ? sec(t - s.dodgeStart) : el;
    p.backstep = { t: Math.min(bt, PLAYER.backstep.sec), dir: s.dodgeDir || dy ? s.dodgeDir : -s.facing, dy };
  }
  if (s.state === 'hitstun') p.hurt = { kind: 'stun', left: Math.max(0, PLAYER.hurt.stunSec - el) };
  if (s.state === 'down') p.hurt = { kind: 'down', left: Math.max(0, PLAYER.hurt.downSec - el) };
  p.downed = s.state === 'knocked';
  // 우물에서 떨어지는 중: 그 상태가 시작된 뒤 흐른 시간으로 남은 시간 (본인 예측도 입력을 받지 않게)
  if (s.state === 'arrive') p.arrive = Math.max(0, COMBAT.arriveSec - el);
  Object.assign(p, { hp: s.hp, maxHp: s.maxHp, ult: s.ult });
  if (priv) {
    p.mp = priv.mp;
    p.stamina = priv.stamina;
    p.tired = priv.tired;
    p.potions = { hp: priv.potionHp, mp: priv.potionMp };
    p.feathers = priv.feathers;
    priv.cooldowns.forEach((end, id) => { p.cooldowns[id] = sec(end - now); });
    if (priv.reinputId) p.reinput = { id: priv.reinputId, left: priv.reinputLeft ?? 0, window: sec((priv.reinputEnd ?? 0) - now) };
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
  m.attack = def ? { def, t: sec(t - s.actionStart), dir: s.facing, dy: s.aimY, struck: [] } : null;
  m.moving = s.state === 'chase';
  m.frozen = s.state === 'frozen' ? 1 : 0;
  m.sleep = s.state === 'sleep' ? 1 : 0;
  m.slow = { left: s.slowed ? 1 : 0, amount: 0 };
  m.burn = { left: s.burning ? 1 : 0, mul: 1 };
  m.lifted = s.weightless ? 1 : 0;
  m.hopT = m.moving ? el : 0;
  m.hp = Math.round((s.hpRatio / 255) * m.maxHp);
  return m;
}
