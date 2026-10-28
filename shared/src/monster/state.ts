// 몬스터 상태 (docs/combat.md 3·6장). 피격 반응·높이는 body, 행동 선택은 ai.ts
import { hitsBlock, type Half } from '../map/collision';
import type { Bounds } from '../movement';
import { newBody, stepBody, type Body, type BodyEvent } from '../body';
import { MONSTERS } from '../data/load';
import type { MonsterAttack, MonsterDef } from '../data/schema';

/** idle = 대기·추적·맴돌기, attack = 공격 중, selfStun = 벽 충돌 어지러움, groggy = 보스 그로기 */
export type AiMode = 'idle' | 'attack' | 'selfStun' | 'groggy';

export interface AttackRun {
  def: MonsterAttack;
  t: number;
  /** 공격 방향 (시작할 때 고정) */
  dir: number;
  /** 대각선 조준: 판정을 깊이로 옮기는 px (시작할 때 플레이어 쪽으로 고정, 최대 ai.aimDepth, 없으면 0) */
  dy: number;
  /** 이번 공격에 이미 맞은 플레이어 id (한 공격에 한 사람은 한 번) */
  struck: string[];
}

export interface Monster {
  id: number;
  kind: string;
  def: MonsterDef;
  body: Body;
  hp: number;
  /** 최대 체력 (인원 보정 반영, balance.md 5장) */
  maxHp: number;
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
  /** 졸음 중 플레이어별 적중 수·연장 횟수 (groggy.ts) */
  groggyHits?: Record<string, number>;
  groggyExtended?: number;
  /** 빙결 남은 시간 (combat.md 3장): 움직이지도 공격하지도 않음, 맞으면 피해·경직은 그대로, 띄워지거나 다운되면 풀림 */
  frozen: number;
  /** 잠든 채 남은 시간 (첫 방 rooms.json wakeSec, dungeon.md 5장): 움직이지도 공격하지도 않음, 맞으면 바로 깨어남. 줄이는 건 RoomSim (누군가 착지한 뒤부터) */
  sleep: number;
}

/** 빙결 (얼음 장판 등 status freeze). 더 긴 쪽으로 */
export function freezeMonster(m: Monster, sec: number): void {
  m.frozen = Math.max(m.frozen, sec);
}

/** hpMul = 인원 체력 보정 (combat.json partyHpMul) */
export function newMonster(id: number, kind: string, x: number, y: number, hpMul = 1): Monster {
  const def = MONSTERS[kind];
  if (!def) throw new Error(`몬스터 '${kind}' 없음`);
  return {
    id, kind, def, body: newBody(x, y, def.weight), hp: Math.round(def.hp * hpMul), maxHp: Math.round(def.hp * hpMul), facing: -1, mode: 'idle', timer: 0, frozen: 0, sleep: 0,
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
/** 충돌 반 크기 (피격 상자 너비·깊이의 절반) */
export const monsterHalf = (m: Monster): Half => ({ x: m.def.hurtbox.width / 2, y: m.def.hurtbox.depth / 2 });

/** 몸 물리 한 틱 (넉백·띄우기). 넉백으로 장애물에 들어가면 그 틱의 좌우 이동은 취소. 빙결 시간도 여기서 흐름 (AI를 끈 도구에서도) */
export function stepBodyIn(m: Monster, dt: number, bounds: Bounds): BodyEvent[] {
  m.frozen = Math.max(0, m.frozen - dt);
  const bd = monsterBounds(m, bounds), x0 = m.body.x;
  const ev = stepBody(m.body, dt, bd.minX, bd.maxX);
  if (hitsBlock(m.body, monsterHalf(m), bounds)) m.body.x = x0;
  return ev;
}

export function monsterBounds(m: Monster, b: { minX: number; maxX: number; minY: number; maxY: number }) {
  const half = m.def.hurtbox.width / 2;
  return { ...b, minX: b.minX + half, maxX: Math.max(b.minX + half, b.maxX - half) };
}
