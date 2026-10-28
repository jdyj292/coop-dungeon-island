// 섬 사물 땅 그림자: 높이만큼 오른쪽·뒤로 눕고, 맨 아래 줄 밑에 접지 줄, 경계는 바둑판
import { describe, expect, it } from 'vitest';
import { castShadow } from './castShadow';
import type { RenderedSprite } from './render';

/** '#' = 칠한 칸인 격자 → 그림 (발밑 = 가운데 아래) */
function sprite(rows: string[]): RenderedSprite {
  const width = rows[0]!.length, height = rows.length;
  const pixels = rows.join('').split('').map((c) => (c === '#' ? '#000000' : null));
  return { width, height, pixels, foot: [Math.floor(width / 2), height - 1] } as RenderedSprite;
}
const draw = (s: ReturnType<typeof castShadow>) =>
  Array.from({ length: s.height }, (_, y) => s.cells.slice(y * s.width, (y + 1) * s.width).map((c) => (c ? '#' : '.')).join(''));

describe('castShadow', () => {
  it('기둥: 꼭대기일수록 오른쪽·위로 옮겨지고 맨 아래 밑에 접지 줄', () => {
    const s = castShadow(sprite(['#', '#', '#', '#', '#']), 1, 0.5);
    // 높이 4 → 오른쪽 4, 위로 2. 그림 맨 아래 줄 = 그림자 끝에서 둘째 줄, 그 밑 접지 줄. 폭 1이라 모두 경계(바둑판)
    expect([s.width, s.height]).toEqual([5, 4]);
    expect(s.foot).toEqual([0, 2]);
    expect(draw(s)).toEqual(['....#', '.#...', '#....', '.....']);
  });

  it('넓은 덩어리는 안쪽이 꽉 차고 경계만 바둑판', () => {
    const s = castShadow(sprite(Array(6).fill('######')), 0, 1);
    const rows = draw(s);
    expect(rows[5]!.slice(1, 5)).toBe('####');   // 안쪽: 위·아래·옆이 다 채워짐
    expect(rows[6]).toBe('#.#.#.');              // 접지 줄 = 경계 → 바둑판
  });

  it('빈 그림은 빈 그림자', () => {
    expect(castShadow(sprite(['..']), 0.5, 0.2).cells.every((c) => !c)).toBe(true);
  });
});
