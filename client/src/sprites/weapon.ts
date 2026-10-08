// 무기 프로필 → 픽셀 (docs/sprites.md 5장). 좌표는 기본 상자 기준
import type { Point, WeaponProfile } from './schema';

export type Pixel = [x: number, y: number, ch: string];

/**
 * start에서 dir 방향으로 프로필을 편다. 뒤에 오는 파츠가 앞 파츠를 덮는다.
 * width: 홀수는 가운데 정렬(대각선이면 수직 대각선 방향), 짝수는 기본선 + 한쪽(대각선이면 가로 이웃을 한 칸 더)
 * block: 끝에 붙는 정사각 덩어리. 방향이 음수인 축은 반대쪽으로 붙는다
 */
export function weaponPixels(profile: WeaponProfile, start: Point, dir: Point): Pixel[] {
  const [dx, dy] = dir;
  const diag = dx !== 0 && dy !== 0;
  const perp: Point = diag ? [1, -dx * dy] : [-dy, dx];
  const side: Point = diag ? [1, 0] : [-dy, dx];
  const out: Pixel[] = [];

  for (const part of profile.parts ?? []) {
    const ks: number[] = [];
    if (part.at !== undefined) ks.push(part.at);
    else for (let k = part.from!; k <= part.to!; k++) ks.push(k);

    for (const k of ks) {
      const x = start[0] + dx * k;
      const y = start[1] + dy * k;
      if (part.block) {
        const b = part.block;
        const bx = x - (dx < 0 ? b - 1 : 0);
        const by = y - (dy < 0 ? b - 1 : 0);
        for (let j = 0; j < b; j++) for (let i = 0; i < b; i++) out.push([bx + i, by + j, part.mat]);
        continue;
      }
      const width = part.width ?? 1;
      if (width % 2 === 1) {
        const half = (width - 1) / 2;
        for (let m = -half; m <= half; m++) out.push([x + perp[0] * m, y + perp[1] * m, part.mat]);
      } else {
        // 대각선은 가로 이웃을 한 칸 더 채워 곧은 방향과 같은 두께로 보이게 한다
        const count = diag ? width + 1 : width;
        for (let m = 0; m < count; m++) out.push([x + side[0] * m, y + side[1] * m, part.mat]);
      }
    }
  }
  return out;
}
