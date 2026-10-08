import { describe, expect, it } from 'vitest';
import { composeCharacter, walkStep } from './compose';
import { spriteData } from './data';

const data = spriteData();
const sets = data.outfits.sets;

describe('composeCharacter', () => {
  for (const set of ['beginner', 'wizard', 'rogue', 'knight']) {
    it(`기본 세트 ${set} (대검 대기)`, () => {
      const look = { hair: 'short', face: 'normal', outfit: sets[set]!, weapon: 'greatsword_basic', pose: 'idle' };
      expect(composeCharacter(data, look)).toMatchSnapshot();
    });
  }

  it('무기 없음 = 기본 팔, 발밑 기준점', () => {
    const { rows, foot } = composeCharacter(data, { hair: 'short', face: 'normal', outfit: sets.beginner! });
    expect(rows).toHaveLength(17);
    expect(foot).toEqual([6, 16]);
  });

  it('걷기 프레임은 하의만 바뀜', () => {
    const look = { hair: 'short', face: 'normal', outfit: sets.beginner! };
    const stand = composeCharacter(data, look).rows;
    const walkA = composeCharacter(data, { ...look, frame: 'walkA' }).rows;
    expect(walkA.slice(0, 14)).toEqual(stand.slice(0, 14));
    expect(walkA.slice(14)).not.toEqual(stand.slice(14));
  });

  it('walkStep: 박자 → 프레임·몸 내림 (cycle 순환)', () => {
    const { cycle, bob } = data.poses.walk;
    for (let b = 0; b < cycle.length * 2; b++) {
      expect(walkStep(data, b)).toEqual({ frame: cycle[b % cycle.length], bob: bob?.[b % cycle.length] ?? 0 });
    }
  });

  it('bob은 다리를 뺀 몸만 내린다', () => {
    const look = { hair: 'short', face: 'normal', outfit: sets.beginner!, frame: 'walkA' };
    const up = composeCharacter(data, look);
    const down = composeCharacter(data, { ...look, bob: 1 });
    // 몸이 1px 내려와 전체 키가 1px 줄고, 머리 줄·발 줄 모양은 그대로 (발밑 기준점은 맨 아래 줄)
    expect(down.rows).toHaveLength(up.rows.length - 1);
    expect(down.rows[0]).toBe(up.rows[0]);
    expect(down.rows.at(-1)).toBe(up.rows.at(-1));
    expect(down.foot).toEqual([up.foot[0], up.foot[1] - 1]);
  });

  it('모자의 _ 는 아래 층을 지움', () => {
    const count = (rows: string[]) => rows.join('').split('h').length - 1;
    const hat = composeCharacter(data, { hair: 'short', face: 'normal', outfit: ['hat_wizard', 'top_tunic', 'bottom_shorts'] });
    const bare = composeCharacter(data, { hair: 'short', face: 'normal', outfit: ['top_tunic', 'bottom_shorts'] });
    expect(count(hat.rows)).toBeLessThan(count(bare.rows));
  });

  it('건틀릿은 손마다 2×2', () => {
    const { rows } = composeCharacter(data, { hair: 'short', face: 'normal', outfit: sets.beginner!, weapon: 'gauntlet_basic', pose: 'guard' });
    expect(rows.join('').split('K').length - 1).toBe(8);
  });

  it('잘못된 조합은 오류', () => {
    expect(() => composeCharacter(data, { hair: 'bald', face: 'normal', outfit: [] })).toThrow();
    expect(() => composeCharacter(data, { hair: 'short', face: 'normal', outfit: ['top_tunic', 'top_robe'] })).toThrow(/슬롯/);
    expect(() => composeCharacter(data, { hair: 'short', face: 'normal', outfit: [], weapon: 'staff_basic', pose: 'slash' })).toThrow();
  });

  it('모든 무기 포즈 × 걷기 프레임 × 머리 모양이 합성됨', () => {
    for (const [id, profile] of Object.entries(data.weapons.profiles)) {
      for (const pose of Object.keys(data.poses.weapons[profile.type] ?? {})) {
        for (const frame of data.poses.walk.cycle) {
          for (const hair of Object.keys(data.base.hairStyles)) {
            const look = { hair, face: 'smile', outfit: sets.knight!, weapon: id, pose, frame };
            expect(() => composeCharacter(data, look)).not.toThrow();
          }
        }
      }
    }
  });
});
