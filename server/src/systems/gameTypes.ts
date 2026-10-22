// DungeonGame 타입: 전송 통로, 방 옵션, 파티원 (server/src/systems/dungeonGame.ts)
import type { S2C } from '@game/shared';
import type { InputQueue } from './inputs';
import type { RateLimit } from './rateLimit';

export interface Outbox {
  broadcast<K extends keyof S2C>(type: K, msg: S2C[K]): void;
  send<K extends keyof S2C>(pid: string, type: K, msg: S2C[K]): void;
  /** 방을 끝낼 때 (전원 이탈, network.md 10장) */
  close?(): void;
}

export interface DungeonOptions {
  /** 시작할 1층 방 번호 1~6 (개발용, 기본 1). 한 판은 여기서 보스 방까지 */
  room?: number;
  /** 던전 인원 1~4 (공격 토큰) */
  partySize?: number;
  /** 테스트용 난수 */
  rng?: () => number;
  /** 개발 명령 허용 (서버 개발 모드, 배포에서는 false) */
  dev?: boolean;
}

/** 이름 최대 글자 수 */
export const NAME_MAX = 12;

export interface Member {
  inputs: InputQueue;
  limit: RateLimit;
  /** 입장 순서 (입장 위치) */
  index: number;
}
