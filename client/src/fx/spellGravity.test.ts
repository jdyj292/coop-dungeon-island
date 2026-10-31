import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { spriteData } from '../sprites/data';
import skills from '../../../shared/data/skills.json';
import { lookOf } from './branchFx';
import type { Effect } from './layer';
import { stampImpact } from './spell';
import { gravField, gravityWell } from './spellGravity';

/** 한 프레임(k = 남은 비율)에 찍힌 픽셀 */
function pixels(e: Effect, k: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const g = { fillStyle() {}, fillRect(x: number, y: number) { out.push({ x, y }); } } as unknown as Phaser.GameObjects.Graphics;
  e.draw(g, k);
  return out;
}

describe('스태프 중력 연출', () => {
  it('중력 우물·중력장은 화염 폭발이 아니라 전용 그림', () => {
    expect(lookOf('st_well')).toBe('well');
    expect(lookOf('st_gravfield')).toBe('gravfield');
  });
  it('중력 우물: 판정 원 안에 그려지고 가운데 핵이 있다', () => {
    const r = 32, px = pixels(gravityWell(100, 100, r), 0.5);
    expect(px.length).toBeGreaterThan(30);
    expect(px.every((p) => Math.abs(p.x - 100) <= r + 1)).toBe(true);
    expect(px.some((p) => Math.abs(p.x - 100) <= 1 && Math.abs(p.y - 98) <= 1)).toBe(true);
  });
  it('중력장: 처음엔 둘레가 판정 원 밖, 자리 잡은 뒤엔 원 안', () => {
    const r = 36, early = pixels(gravField(100, 100, r), 0.99), late = pixels(gravField(100, 100, r), 0.5);
    expect(Math.max(...early.map((p) => Math.abs(p.x - 100)))).toBeGreaterThan(r + 4);
    expect(late.every((p) => Math.abs(p.x - 100) <= r + 1)).toBe(true);
  });
  it('지팡이 꽂기 충격: 퍼지는 고리', () => {
    const a = pixels(stampImpact(50, 50), 0.9), b = pixels(stampImpact(50, 50), 0.3);
    const span = (v: { x: number }[]) => Math.max(...v.map((p) => p.x)) - Math.min(...v.map((p) => p.x));
    expect(span(b)).toBeGreaterThan(span(a));
  });
});

describe('스태프 스킬 포즈', () => {
  const set = spriteData().poses.weapons.staff!;
  type S = { id: string; weapon?: string; poses: { windup: string; active: string } };
  const staff = (Object.values(skills) as unknown[]).filter((s): s is S => typeof s === 'object' && (s as S).weapon === 'staff');
  it('모든 스태프 스킬 포즈가 있고, 준비는 모으기(spark), active는 마법(bolt·circle·stamp)', () => {
    for (const s of staff) {
      const fxOf = (p: string) => (set[p]?.fx as { type?: string } | undefined)?.type;
      expect(fxOf(s.poses.windup), `${s.id} windup`).toBe('spark');
      expect(['bolt', 'circle', 'stamp'], `${s.id} active`).toContain(fxOf(s.poses.active));
    }
  });
});
