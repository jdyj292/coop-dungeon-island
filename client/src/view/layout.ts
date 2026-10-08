// 화면 구획과 벨트스크롤 투영 (docs/art.md 1장). 서버는 화면을 모른다: 투영은 클라이언트에서만
import { DEPTH_RATIO } from '@game/shared';

/** 벽 위 나무·장식이 끝나고 뒤쪽 벽이 시작하는 줄 */
export const WALL_TOP = 20;
/** 바닥이 시작하는 줄 (= 깊이 0) */
export const FLOOR_TOP = 50;
/** 전투 영역이 끝나는 줄. 그 아래는 HUD 전용 띠 */
export const FIELD_BOTTOM = 140;
/** 아래 HUD 띠 높이 (화면 맨 아래에 붙는다) */
export const HUD_HEIGHT = 22;

/** 로직 좌표(x, y=깊이, z=높이) → 월드 화면 좌표 (카메라 스크롤은 Phaser 카메라가 처리) */
export function project(x: number, y: number, z = 0): { sx: number; sy: number } {
  return { sx: Math.round(x), sy: Math.round(FLOOR_TOP + y * DEPTH_RATIO - z) };
}

/**
 * 카메라 가로 추적: 데드존 안에서는 가만히, 방 경계에서 멈춤.
 * 방이 화면보다 좁으면 가운데 정렬. 반환값은 정수 스크롤 x
 */
export function followCamera(
  center: number, target: number, deadzone: number, viewWidth: number, roomWidth: number,
): { center: number; scrollX: number } {
  let c = center;
  if (target > c + deadzone) c = target - deadzone;
  if (target < c - deadzone) c = target + deadzone;
  if (roomWidth <= viewWidth) return { center: roomWidth / 2, scrollX: Math.round((roomWidth - viewWidth) / 2) };
  c = Math.min(roomWidth - viewWidth / 2, Math.max(viewWidth / 2, c));
  return { center: c, scrollX: Math.round(c - viewWidth / 2) };
}
