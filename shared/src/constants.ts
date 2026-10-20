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
