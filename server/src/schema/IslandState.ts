// 섬 방 상태 (docs/network.md 5장 IslandState). 위치 int16. 지갑·인벤토리는 본인에게 메시지로 (상태에 넣지 않음)
import { ArraySchema, MapSchema, Schema, type } from '@colyseus/schema';

export class Resident extends Schema {
  /** users.id (문자열) */
  @type('string') id = '';
  @type('string') name = '';
  /** 플레이어 색 번호 (섬 주민 가입 순서 0~3, palette global.playerColors) */
  @type('uint8') color = 0;
  /** 섬에 접속해 있음 */
  @type('boolean') online = false;
  /** "island" | "away" (접속 안 함) | "dungeon:<층>" (4-8) */
  @type('string') status = 'away';
  @type('int16') x = 0;
  @type('int16') y = 0;
  @type('int8') facing = 1;
  /** idle / walk / run */
  @type('string') state = 'idle';
  /** 서버가 처리한 마지막 입력 (본인 예측 보정용) */
  @type('uint32') lastInputSeq = 0;
}

/** 놓인 장식 (칸 좌표, island.md 3장) */
export class Placement extends Schema {
  @type('string') id = '';
  @type('string') itemId = '';
  @type('uint8') x = 0;
  @type('uint8') y = 0;
  @type('uint8') rot = 0;
  /** 놓은 사람 users.id (없으면 '') */
  @type('string') placedBy = '';
  /** 공동 금고로 산 공용 장식 */
  @type('boolean') communal = false;
}

/** 우물 출발 대기 (island.md 6장) */
export class WellState extends Schema {
  /** 대기 중인 주민 users.id (들어온 순서, 첫 사람 = 대기 시작자) */
  @type(['string']) members = new ArraySchema<string>();
  @type('string') floor = '';
  /** 출발 서버 시각 ms (0 = 카운트다운 안 함) */
  @type('float64') departAt = 0;
}

export class IslandState extends Schema {
  /** 이 상태의 서버 시각 ms (보간 기준) */
  @type('float64') serverTime = 0;
  @type('string') name = '';
  @type('uint32') treasury = 0;
  @type({ map: Resident }) residents = new MapSchema<Resident>();
  @type({ map: Placement }) placements = new MapSchema<Placement>();
  /** 공용 창고: 장식 id → 개수 (주민 모두에게) */
  @type({ map: 'uint16' }) storage = new MapSchema<number>();
  @type(WellState) well = new WellState();
}
