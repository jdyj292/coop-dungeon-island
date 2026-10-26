// RoomSim 공용 타입: 출현, 방 안 플레이어, 시뮬레이션 사건, 옵션 (shared/src/sim/room.ts)
import type { ActionDef, FighterEvent, WeaponDef } from '../actions';
import type { Combo } from '../combo';
import type { MonsterAttack } from '../data/schema';
import type { MonsterEvent } from '../monster/ai';
import type { Monster } from '../monster/state';
import type { PlayerInput, PlayerState } from '../player';
import type { HurtEvent, PotionKind } from '../playerHurt';
import type { Bolt } from './bolts';
import type { HitLog } from './hitLog';

export interface Spawn {
  kind: string;
  x: number;
  y: number;
}

/** 방 안 플레이어 한 명 */
export interface SimPlayer {
  pid: string;
  state: PlayerState;
  weapon: WeaponDef;
  /** 개인 콤보 (팀 콤보는 2-6) */
  combo: Combo;
  /** 지연 보정 되감기 (초): 이 플레이어의 공격은 그만큼 과거의 몬스터 위치로 판정 (network.md 9장) */
  rewind: number;
  /** 히트스톱 남은 시간 (hitstop: 'entity'일 때) */
  stop: number;
  /** 피격 직전 상태 기록 (백스텝 소급 무적) */
  hits: HitLog;
  /** 히트스톱 동안 들어온 누름 (멈춤이 끝난 틱에 적용) */
  held: PlayerInput | null;
  /** 접속 끊김 (network.md 10장): 제자리에 멈춤, 무적, 몬스터가 노리지 않음 */
  away: boolean;
}

/** pid = 그 사건의 플레이어 (hit은 공격자, playerHit·playerHurt는 맞은 사람) */
export type SimEvent =
  | { type: 'fighter'; pid: string; e: FighterEvent }
  | { type: 'backstep'; pid: string }
  /** 플레이어 → 몬스터 적중 */
  | { type: 'hit'; pid: string; m: Monster; def: ActionDef; damage: number }
  | { type: 'monster'; m: Monster; e: MonsterEvent }
  /** 몬스터 공격·투사체 → 플레이어 적중 (HP 감소·경직·다운은 playerHurt) */
  | { type: 'playerHit'; pid: string; from: Monster | undefined; def: MonsterAttack; damage: number }
  | { type: 'playerHurt'; pid: string; e: HurtEvent }
  | { type: 'potion'; pid: string; kind: PotionKind }
  /** 팀 콤보 단계 달성 (2인 이상): 전원 필살기 게이지 +onTeamMilestone */
  | { type: 'teamMilestone'; count: number }
  /** 개인 콤보 단계 달성 (솔로, 코인 보너스) */
  | { type: 'comboMilestone'; pid: string; count: number }
  /** 몬스터 기절 (보상 시점). pid = 마지막 적중 */
  | { type: 'ko'; pid: string; m: Monster }
  /** 플레이어 마법탄 발사·사라짐 (스태프) */
  | { type: 'bolt'; bolt: Bolt }
  | { type: 'boltEnd'; bolt: Bolt };

export interface SimOptions {
  /** false면 몬스터가 움직이거나 공격하지 않음 (tools/motion-preview) */
  ai?: boolean;
  partySize?: number;
  rng?: () => number;
  /**
   * 히트스톱: 'none' = 시뮬레이션은 멈추지 않음 (솔로 로컬은 화면 전체를 멈춘다, motion.md 3장),
   * 'entity' = 공격자와 대상만 멈추고 세계는 계속 (서버, network.md 9장)
   */
  hitstop?: 'none' | 'entity';
}
