import { describe, expect, it } from 'vitest';
import { color } from '../palette';
import { spriteData } from './data';
import { renderMonsterFrame, stateFrames } from './monster';

const data = spriteData();

describe('renderMonsterFrame', () => {
  it('모든 몬스터의 모든 프레임이 그려짐', () => {
    for (const [id, monster] of Object.entries(data.monsters)) {
      for (const [name, frame] of Object.entries(monster.frames)) {
        const s = renderMonsterFrame(data, id, name);
        expect(s.width).toBe(frame.rows[0]!.length + 2);
        expect(s.foot).toEqual([frame.foot[0] + 1, frame.foot[1] + 1]);
      }
    }
  });
  it('슈퍼아머 외곽선은 superArmorOutline 프레임에만', () => {
    const gold = color('global.semantic.superArmor');
    const count = (s: { pixels: (string | null)[] }) => s.pixels.filter((p) => p === gold).length;
    expect(count(renderMonsterFrame(data, 'capknight', 'windup', { superArmor: true }))).toBeGreaterThan(20);
    expect(count(renderMonsterFrame(data, 'capknight', 'idle1', { superArmor: true }))).toBe(0);
  });
  it('상태 → 프레임', () => {
    expect(stateFrames(data, 'boar', 'idle')).toEqual(['idle1', 'idle2']);
    expect(stateFrames(data, 'boar', 'selfStun')).toEqual(['dizzy']);
    expect(() => stateFrames(data, 'boar', 'fly')).toThrow();
  });
});
