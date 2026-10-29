import { MIN_SCALE, VIEW_WIDTH } from '@game/shared';
import { FIELD_BOTTOM, HUD_HEIGHT, WALL_TOP } from './view/layout';

/** 화면이 낮으면 던전 맨 위에서 잘라도 되는 높이: 나무 장식(0~WALL_TOP) + 뒤쪽 벽 윗부분 6px */
export const CROP_TOP = WALL_TOP + 6;
/** 던전 바닥 끝 + 아래 HUD 띠가 모두 보이는 최소 높이 */
export const MIN_VIEW_HEIGHT = FIELD_BOTTOM - CROP_TOP + HUD_HEIGHT;

export interface ViewSize {
  scale: number;
  /** 내부 해상도 (배율 적용 전). 남는 영역만큼 시야를 넓힌다 */
  width: number;
  height: number;
}

/** 창 크기 → 정수 배율과 내부 해상도 (docs/art.md 1장). 높이가 모자라면 배율을 낮춘다 */
export function computeView(windowWidth: number, windowHeight: number): ViewSize {
  const fit = Math.min(Math.floor(windowWidth / VIEW_WIDTH), Math.floor(windowHeight / MIN_VIEW_HEIGHT));
  const scale = Math.max(MIN_SCALE, fit);
  const width = Math.max(VIEW_WIDTH, Math.floor(windowWidth / scale));
  const height = Math.max(MIN_VIEW_HEIGHT, Math.floor(windowHeight / scale));
  return { scale, width, height };
}
