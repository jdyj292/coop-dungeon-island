// 화면·좌표 상수 (docs/art.md 1장). 게임 수치는 shared/data에만 둔다.

/** 1타일 = 16px (로직 단위) */
export const TILE = 16;

/** 내부 해상도 (정수 배율로 확대) */
export const VIEW_WIDTH = 288;
export const VIEW_HEIGHT = 162;

/** 최소 배율 */
export const MIN_SCALE = 2;

/** 깊이(y) 압축: 바닥 타일이 화면에서 16×10px */
export const DEPTH_RATIO = 10 / 16;

/** 시뮬레이션 틱 (docs/network.md 2장): 클라이언트·서버 모두 1/60초 고정 간격으로 진행 */
export const TICK_RATE = 60;
export const TICK = 1 / TICK_RATE;

/** 네트워크 (docs/network.md 2·4·7·9장) */
export const NET = {
  /** 상태 전송 20Hz */
  patchRate: 20,
  /** 이동 중 입력 전송 20Hz (바뀌면 즉시) */
  inputRate: 20,
  /** 다른 엔티티를 이만큼 과거로 그림 */
  interpDelayMs: 100,
  /** 보간 버퍼가 비면 마지막 속도로 외삽하는 최대 시간 */
  extrapolateMs: 200,
  /** 시계 맞추기 ping 간격 */
  pingMs: 2000,
  /** 내 위치 보정: 이하 무시 / 이하 부드럽게(smoothMs) / 초과 즉시 */
  correctIgnorePx: 2,
  correctSnapPx: 24,
  correctSmoothMs: 100,
  /** 지연 보정 되감기 최대, 몬스터 위치 기록 보관 */
  rewindMaxMs: 150,
  historyMs: 300,
  /** 공격자 위치: 클라이언트 값이 서버 기록과 이 거리 안이면 클라이언트 값 */
  attackerTrustPx: 12,
  /** 백스텝 소급 무적: 입력 시각 뒤 이 시간 안의 피격 취소 */
  backstepGraceMs: 100,
  /** 초당 횟수 제한 (넘으면 무시), chat은 chatWindowMs 안에 chatMax회 */
  limits: { input: 30, action: 10, island: 5, chatMax: 3, chatWindowMs: 3000 },
  /** 채팅 길이 (hud.md 4장) */
  chatMaxLen: 60,
} as const;
