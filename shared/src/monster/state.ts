// 몬스터 상태 (docs/combat.md 3·6장). 피격 반응·높이는 body, 행동 선택은 ai.ts
import { hitsBlock, type Half } from '../map/collision';
import type { Bounds } from '../movement';
import { newBody, stepBody, type Body, type BodyEvent } from '../body';
import { MONSTERS } from '../data/load';
import type { MonsterAttack, MonsterDef } from '../data/schema';
import type { ActionDef } from '../actions';

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
  /** 벽에 튕긴 횟수 (onWallHit.bounce) */
  bounced?: number;
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
  /** 빙결을 건 사람과 행동 (변형 onStatusEnd: 풀릴 때 판정, sim/skillExtras.ts) */
  frozenBy?: { pid: string; def: ActionDef };
  /** 벽꿍 판정을 건 행동 (변형 onWall): 이 몬스터가 밀려 벽에 닿으면 다운 + 추가 판정. 다음 피격·착지 전까지 */
  wallBy?: { pid: string; def: ActionDef };
  /** 감속 (status slow, 변형 동토·중력장): 남은 시간·줄이는 비율. 걷는 속도와 공격 쿨타임·공격 사이 쉬는 시간이 느려진다 (공격 동작 자체는 그대로) */
  slow: { left: number; amount: number };
  /** 잠든 채 남은 시간 (첫 방 rooms.json wakeSec, dungeon.md 5장): 움직이지도 공격하지도 않음, 맞으면 바로 깨어남. 줄이는 건 RoomSim (누군가 착지한 뒤부터) */
  sleep: number;
  /** 연소 (보조 노드, skills.md 3장): 남은 시간·받는 피해 배율. 누가 때려도 */
  burn: { left: number; mul: number };
  /** 중압 (보조 노드): 감속이 남은 동안 받는 피해 배율 (0 = 없음). 감속이 끝나면 효과 없음 (sim/strike.ts) */
  pressed: number;
  /** 검흔 (검흔 베기, sim/scar.ts): 건 사람·남은 시간·건 스킬 정의·남은 옮겨가기 횟수 */
  scar?: { pid: string; left: number; def: ActionDef; hops: number };
}

/** 빙결 (얼음 장판 등 status freeze). 더 긴 쪽으로 */
export function freezeMonster(m: Monster, sec: number): void {
  m.frozen = Math.max(m.frozen, sec);
}

/** 감속. 더 센 쪽으로, 시간은 더 긴 쪽으로 */
export function slowMonster(m: Monster, sec: number, amount: number): void {
  m.slow = { left: Math.max(m.slow.left, sec), amount: Math.max(m.slow.left > 0 ? m.slow.amount : 0, amount) };
}

/** hpMul = 인원 체력 보정 (combat.json partyHpMul) */
export function newMonster(id: number, kind: string, x: number, y: number, hpMul = 1): Monster {
  const def = MONSTERS[kind];
  if (!def) throw new Error(`몬스터 '${kind}' 없음`);
  return {
    id, kind, def, body: newBody(x, y, def.weight), hp: Math.round(def.hp * hpMul), maxHp: Math.round(def.hp * hpMul), facing: -1, mode: 'idle', timer: 0, frozen: 0, slow: { left: 0, amount: 0 }, sleep: 0, burn: { left: 0, mul: 1 }, pressed: 0,
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
  m.slow.left = Math.max(0, m.slow.left - dt);
  m.burn.left = Math.max(0, m.burn.left - dt);
  if (m.scar && (m.scar.left -= dt) <= 0) delete m.scar;
  const bd = monsterBounds(m, bounds), x0 = m.body.x, y0 = m.body.y;
  const ev = stepBody(m.body, dt, bd.minX, bd.maxX);
  // 깊이 끌림(pull)은 방 위아래 끝에서 멈춤
  m.body.y = Math.min(bd.maxY, Math.max(bd.minY, m.body.y));
  if (hitsBlock(m.body, monsterHalf(m), bounds)) {
    m.body.x = x0;
    m.body.y = y0;
  }
  return ev;
}

export function monsterBounds(m: Monster, b: { minX: number; maxX: number; minY: number; maxY: number }) {
  const half = m.def.hurtbox.width / 2;
  return { ...b, minX: b.minX + half, maxX: Math.max(b.minX + half, b.maxX - half) };
}
