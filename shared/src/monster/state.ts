// 몬스터 상태 (docs/combat.md 3·6장). 피격 반응·높이는 body, 행동 선택은 ai.ts
import { newBody, type Body } from '../body';
import { MONSTERS } from '../data/load';
import type { MonsterAttack, MonsterDef } from '../data/schema';

/** idle = 대기·추적·맴돌기, attack = 공격 중, selfStun = 벽 충돌 어지러움, groggy = 보스 그로기 */
export type AiMode = 'idle' | 'attack' | 'selfStun' | 'groggy';

export interface AttackRun {
  def: MonsterAttack;
  t: number;
  /** 공격 방향 (시작할 때 고정) */
  dir: number;
  /** 이번 공격에 이미 맞은 플레이어 id (한 공격에 한 사람은 한 번) */
  struck: string[];
}

export interface Monster {
  id: number;
  kind: string;
  def: MonsterDef;
  body: Body;
  hp: number;
  facing: number;
  mode: AiMode;
  /** selfStun·groggy 남은 시간, 또는 보스 공격 사이 쉬는 시간 */
  timer: number;
  attack: AttackRun | null;
  hasToken: boolean;
  /** 공격 id → 남은 재사용 대기 */
  cooldowns: Record<string, number>;
  /** 플레이어를 감지했나 (한 번 감지하면 유지) */
  aware: boolean;
  /** 이번 틱에 이동했나 (그리기: 걷기·튀기 프레임) */
  moving: boolean;
  /** 튀어 이동(hop) 박자 시간 */
  hopT: number;
  /** 보스 loop 위치 */
  loop: { phase: number; index: number };
}

export function newMonster(id: number, kind: string, x: number, y: number): Monster {
  const def = MONSTERS[kind];
  if (!def) throw new Error(`몬스터 '${kind}' 없음`);
  return {
    id, kind, def, body: newBody(x, y, def.weight), hp: def.hp, facing: -1, mode: 'idle', timer: 0,
    attack: null, hasToken: false, cooldowns: {}, aware: false, moving: false, hopT: 0, loop: { phase: 0, index: 0 },
  };
}

/** 지금 공격 구간 */
export function attackPhase(m: Monster): 'windup' | 'active' | 'recovery' | null {
  const a = m.attack;
  if (!a) return null;
  const { windup, active, recovery } = a.def.phases;
  if (a.t < windup) return 'windup';
  if (a.t < windup + active) return 'active';
  return a.t < windup + active + recovery ? 'recovery' : null;
}

/** 슈퍼아머: always는 그로기 때만 해제, attack은 자기 공격 windup~active 동안 (combat.md 3장) */
export function hasArmor(m: Monster): boolean {
  if (m.def.superArmor === 'always') return m.mode !== 'groggy';
  if (m.def.superArmor === 'attack') {
    const ph = attackPhase(m);
    return ph === 'windup' || ph === 'active';
  }
  return false;
}

/** 몸이 벽을 넘지 않도록 피격 상자 폭의 절반만큼 좁힌 좌우 경계 */
export function monsterBounds(m: Monster, b: { minX: number; maxX: number; minY: number; maxY: number }) {
  const half = m.def.hurtbox.width / 2;
  return { ...b, minX: b.minX + half, maxX: Math.max(b.minX + half, b.maxX - half) };
}
