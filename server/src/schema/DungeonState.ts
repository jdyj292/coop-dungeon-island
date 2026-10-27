// 던전 방 상태 (docs/network.md 5장). 위치 int16, HP uint16, 비율 uint8로 양자화. 순간 사건은 이벤트 메시지(systems/events.ts)
import { filter, MapSchema, Schema, type } from '@colyseus/schema';
import type { Client } from 'colyseus';

/** 본인에게만 보내는 값 (쿨타임·MP·지구력·물약·깃털) */
export class PlayerPrivate extends Schema {
  @type('uint16') mp = 0;
  @type('uint8') stamina = 0;
  /** 달리다 지구력이 바닥나 걷는 중 (예측이 다시 달리지 않게) */
  @type('boolean') tired = false;
  /** 스킬 id → 쿨타임이 끝나는 서버 시각(ms) */
  @type({ map: 'float64' }) cooldowns = new MapSchema<number>();
  @type('uint8') potionHp = 0;
  @type('uint8') potionMp = 0;
  @type('uint8') feathers = 0;
  /** 이번 판 보상 (정산 전, balance.md 7장) */
  @type('uint16') coins = 0;
  @type('uint16') materials = 0;
  @type('uint16') exp = 0;
  /** 콤보 코인 보너스 % (정산 때 더함) */
  @type('uint8') bonusPct = 0;
}

export class PlayerState extends Schema {
  @type('string') id = '';
  @type('string') name = '';
  /** 외형 키 (머리·머리색·의상·플레이어 색 번호) */
  @type('string') look = '';
  /** 플레이어 색 번호 (섬 주민 순서, 개발 방은 입장 순서) */
  @type('uint8') color = 0;
  @type('string') weapon = '';
  @type('int16') x = 0;
  @type('int16') y = 0;
  /** 백스텝 높이 등은 클라이언트 연출. 지상 판정만 */
  @type('int8') facing = 1;
  /** 회피 중 이동 방향 (1 오른쪽, -1 왼쪽, 0 = 회피 아님). 앞으로 회피하면 facing과 같다 */
  @type('int8') dodgeDir = 0;
  /** idle / walk / run / action / backstep / hitstun / down / knocked */
  @type('string') state = 'idle';
  /** 진행 중 행동 id와 시작 서버 시각 (구간은 클라이언트가 데이터로 계산) */
  @type('string') actionId = '';
  @type('float64') actionStart = 0;
  @type('uint16') hp = 0;
  @type('uint16') maxHp = 0;
  @type('uint8') ultGauge = 0;
  /** 쓰러진 동안 동료 부활 진행도 0~255 (M3) */
  @type('uint8') reviveProgress = 0;
  /** 서버가 처리한 마지막 입력 번호 (예측 보정용, network.md 7장) */
  @type('uint32') lastInputSeq = 0;
  @filter(function (this: PlayerState, client: Client) {
    return client.sessionId === this.id;
  })
  @type(PlayerPrivate) priv = new PlayerPrivate();
}

export class MonsterState extends Schema {
  @type('string') id = '';
  @type('string') type = '';
  @type('int16') x = 0;
  @type('int16') y = 0;
  @type('int16') z = 0;
  @type('int8') facing = 1;
  /** idle / chase / action / hitstun / airborne / down / getup / dizzy / groggy / stunned */
  @type('string') state = 'idle';
  @type('string') actionId = '';
  @type('float64') actionStart = 0;
  /** 공격의 대각선 조준 깊이 px (공격 중만, 예고 위치용) */
  @type('int8') aimY = 0;
  /** 체력 비율 0~255 */
  @type('uint8') hpRatio = 255;
  @type('boolean') superArmor = false;
}

export class ZoneState extends Schema {
  @type('string') id = '';
  /** 만든 공격 id (모양·색은 데이터로) */
  @type('string') attackId = '';
  @type('int16') x = 0;
  @type('int16') y = 0;
  /** 사라지는 서버 시각(ms) */
  @type('float64') endsAt = 0;
}

export class DungeonState extends Schema {
  /** 이 상태의 서버 시각(ms, 방 생성부터). 패치마다 바뀌어 클라이언트 보간 기준이 된다 (network.md 8장) */
  @type('float64') serverTime = 0;
  @type('uint8') floor = 1;
  /** 0부터 (1층 방 6개: 0~5) */
  @type('uint8') roomIndex = 0;
  /** 이 층 방 수 (방 진행 HUD) */
  @type('uint8') roomCount = 6;
  @type('uint8') wave = 0;
  @type('boolean') doorOpen = false;
  /** 출구 앞에 선 인원 / 필요한 인원 (쓰러진 사람 제외, 출구가 열린 뒤) */
  @type('uint8') exitAt = 0;
  @type('uint8') exitNeed = 0;
  /** 귀환 지점 카운트다운 남은 초 (0 = 진행 안 함) */
  @type('float32') returnLeft = 0;
  /** 이 방 보물상자를 열었나 */
  @type('boolean') chestOpen = false;
  /** play | result */
  @type('string') phase = 'play';
  @type('uint8') partySize = 1;
  @type('uint16') teamCombo = 0;
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type({ map: MonsterState }) monsters = new MapSchema<MonsterState>();
  @type({ map: ZoneState }) zones = new MapSchema<ZoneState>();
}
