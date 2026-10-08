import { MIN_SCALE, VIEW_HEIGHT, VIEW_WIDTH } from '@game/shared';

export interface ViewSize {
  scale: number;
  /** 내부 해상도 (배율 적용 전). 남는 영역만큼 시야를 넓힌다 */
  width: number;
  height: number;
}

/** 창 크기 → 정수 배율과 내부 해상도 (docs/art.md 1장) */
export function computeView(windowWidth: number, windowHeight: number): ViewSize {
  const scale = Math.max(MIN_SCALE, Math.floor(windowWidth / VIEW_WIDTH));
  const width = Math.max(VIEW_WIDTH, Math.floor(windowWidth / scale));
  const height = Math.max(VIEW_HEIGHT, Math.floor(windowHeight / scale));
  return { scale, width, height };
}
