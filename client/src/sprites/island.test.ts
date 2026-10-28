// 섬 사물이 승인 데모(island_screen_hud_mockup.html)의 그림과 픽셀 단위로 같은지: 데모 그리기 코드를 가짜 캔버스로 돌려 비교
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import islandJson from '../../data/sprites/island.json';
import { demoLines, runDemoScript, type FakeCanvas } from './fakeCanvas';
import { islandView, parseIsland, renderIslandFrame } from './island';

const html = readFileSync(new URL('../../../docs/refs/demos/island_screen_hud_mockup.html', import.meta.url), 'utf8');
// 16~21행: 색 램프, 42~62행: 사물 그리기 (데모 파일은 수정 금지라 줄 번호가 고정)
const demo = runDemoScript([demoLines(html, 16, 21), demoLines(html, 42, 62)].join('\n'),
  ['WELL', 'SHOP', 'BOARD', 'FL1', 'FL2', 'FENCE', 'BENCH', 'LAMP', 'MAILBOX', 'T1', 'T2']) as Record<string, FakeCanvas>;

// 우물(2026-10 우물 입장 개편)·잡화점(2026-10 입체감)은 그림이 바뀜 (데모와 크기·발밑만 같음, 아래 따로)
const CASES: [string, string, string][] = [
  ['board', 'front', 'BOARD'],
  ['flowerBed', 'pink', 'FL1'], ['flowerBed', 'blue', 'FL2'], ['fence', 'front', 'FENCE'], ['bench', 'front', 'BENCH'],
  ['lamp', 'front', 'LAMP'], ['mailbox', 'front', 'MAILBOX'], ['tree', 'front', 'T2'], ['treeBig', 'front', 'T1'],
];

describe('섬 사물 = 승인 데모', () => {
  const objs = parseIsland(islandJson as Record<string, unknown>);
  it.each(CASES)('%s.%s = 데모 %s', (id, frame, name) => {
    const ours = renderIslandFrame(objs[id]!, frame), d = demo[name]!;
    expect([ours.width, ours.height]).toEqual([d.width, d.height]);
    const diff: string[] = [];
    for (let j = 0; j < d.height; j++) {
      for (let i = 0; i < d.width; i++) {
        const a = ours.pixels[j * d.width + i]?.toLowerCase() ?? null, b = d.at(i, j);
        if (a !== b) diff.push(`(${i},${j}) ${a} ≠ ${b}`);
      }
    }
    expect(diff.slice(0, 5)).toEqual([]);
    // 데모 put(): 왼쪽 = 기준 x − floor(폭/2), 아래 줄 = 기준 y
    expect(ours.foot).toEqual([Math.floor(d.width / 2), d.height - 1]);
  });

  it('우물: 새 그림도 데모와 같은 크기·발밑 (놓인 자리 그대로), 포자 두 프레임 순환', () => {
    const o = objs.well!, d = demo.WELL!;
    for (const f of ['front', 'front2']) {
      const ours = renderIslandFrame(o, f);
      expect([ours.width, ours.height, ...ours.foot]).toEqual([d.width, d.height, Math.floor(d.width / 2), d.height - 1]);
    }
    expect([islandView(o, 0, 0).frame, islandView(o, 0, o.animSec!).frame]).toEqual(['front', 'front2']);
  });

  it('잡화점: 새 그림도 데모와 같은 크기·발밑 (놓인 자리 그대로)', () => {
    const ours = renderIslandFrame(objs.shop!, 'front'), d = demo.SHOP!;
    expect([ours.width, ours.height, ...ours.foot]).toEqual([d.width, d.height, Math.floor(d.width / 2), d.height - 1]);
  });

  it('좌우 반전은 발밑도 반전, 회전·순환 프레임 고르기', () => {
    const o = parseIsland({ x: { colors: { a: 'island.wood' }, frames: { f: { rows: ['aa.'], foot: [0, 1] }, g: { rows: ['a'], foot: [0, 1] } }, rot: ['f', 'f|flip', ['f', 'g'], 'g'], animSec: 0.5 } }).x!;
    const flipped = renderIslandFrame(o, 'f', true);
    expect(flipped.pixels.slice(5, 10).map((p) => p !== null && p !== '#2a2540' && p !== '#2A2540')).toEqual([false, false, true, true, false]);
    expect(flipped.foot).toEqual([3, 2]);
    expect(islandView(o, 1)).toEqual({ frame: 'f', flip: true });
    expect(islandView(o, 2, 0.6)).toEqual({ frame: 'g', flip: false });
  });

  it('없는 색 글자·없는 프레임·회전 수는 거절', () => {
    expect(() => parseIsland({ x: { colors: {}, frames: { f: { rows: ['a'], foot: [0, 0] } }, rot: ['f'] } })).toThrow(/색이 없는/);
    expect(() => parseIsland({ x: { colors: { a: 'island.wood' }, frames: { f: { rows: ['a'], foot: [0, 0] } }, rot: ['g'] } })).toThrow(/없는 프레임/);
    expect(() => parseIsland({ x: { colors: { a: 'island.wood' }, frames: { f: { rows: ['a'], foot: [0, 0] } }, rot: ['f', 'f', 'f'] } })).toThrow();
  });
});
