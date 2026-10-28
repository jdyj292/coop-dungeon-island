// sfx-preview: sfx.json을 게임과 같은 엔진으로 재생, 레이어 값 조정 → 바꾼 값만 JSON 복사, 승인 원본과 나란히 듣기·자동 비교 (docs/audio.md 7장)
import refAction from '../reference-action.html?raw';
import refClear from '../reference-clear.html?raw';
import sfxData from '../../../client/data/sfx.json';
import { compareBus } from '../../../client/src/audio/compareRef';
import { addDraftSounds, busOf, SfxPlayer, soundNames } from '../../../client/src/audio/player';
import type { Layer } from '../../../client/src/audio/synth';
import { el, slider } from '../../sprite-preview/src/ui';

type Recipes = Record<'action' | 'clear', Record<string, Layer[]>>;
const data = sfxData as unknown as Recipes & { combos: Record<string, [string, number][]> };
/** 초안 효과음 (client/data/drafts/sfx.json): 목록에 "(초안)" */
const DRAFTS = new Set(addDraftSounds());
const ORIGINAL = structuredClone({ action: data.action, clear: data.clear });
const player = new SfxPlayer();
player.jitter = false;

/** 레이어 필드 → 슬라이더 범위 [최소, 최대, 간격] */
const RANGES: Record<string, [number, number, number]> = {
  f: [20, 8000, 1], dur: [0.005, 2, 0.005], v: [0, 1, 0.01], at: [0, 2, 0.005], wet: [0, 1, 0.01], q: [0.1, 10, 0.1],
  lp: [100, 8000, 10], atk: [0, 0.5, 0.005], idx: [0, 6, 0.1], ratio: [0.5, 8, 0.05], bend: [0.1, 1, 0.05],
};

const recipeOf = (name: string): Layer[] => data[busOf(name)!][name]!;
const originalOf = (name: string): Layer[] => ORIGINAL[busOf(name)!][name]!;
const changed = (name: string) => JSON.stringify(recipeOf(name)) !== JSON.stringify(originalOf(name));

function button(text: string, onClick: (b: HTMLButtonElement) => void): HTMLButtonElement {
  const b = el('button', { text });
  b.type = 'button';
  b.addEventListener('click', () => onClick(b));
  return b;
}

let selected = 'hitLight';
const panel = el('div', { className: 'panel' });
const list = el('div', { className: 'sounds' });
const out = el('textarea');
out.readOnly = true;

/** 선택한 소리의 레이어별 슬라이더 */
function buildPanel(): void {
  const nodes: Node[] = [el('h3', { text: `${busOf(selected)}.${selected}` })];
  recipeOf(selected).forEach((layer, i) => {
    nodes.push(el('div', { className: 'label', text: `${i + 1}. ${layer.k}${layer.wave ? ` (${layer.wave})` : ''}${layer.filter ? ` ${layer.filter}` : ''}` }));
    for (const [key, value] of Object.entries(layer)) {
      const range = RANGES[key];
      if (!range) continue;
      const values = Array.isArray(value) ? value : [value];
      values.forEach((v, j) => {
        const label = Array.isArray(value) ? `${key}${j ? ' 끝' : ' 시작'}` : key;
        const row = slider(label, range, v as number, (x) => String(Math.round(x * 1000) / 1000), (x) => {
          const l = layer as unknown as Record<string, number | number[]>;
          if (Array.isArray(value)) (l[key] as number[])[j] = x;
          else l[key] = x;
          renderList();
        });
        nodes.push(row);
      });
    }
  });
  nodes.push(
    el('div', { className: 'buttons' },
      button('▶ 듣기', () => player.preview(selected)),
      button('이 소리 원래대로', () => {
        data[busOf(selected)!][selected] = structuredClone(originalOf(selected));
        buildPanel();
        renderList();
      }),
      button('JSON 복사', (b) => {
        const diff = Object.fromEntries(soundNames().filter(changed).map((n) => [`${busOf(n)}.${n}`, recipeOf(n)]));
        out.value = JSON.stringify(diff, null, 2);
        void navigator.clipboard?.writeText(out.value).then(() => { b.textContent = '복사됨'; }, () => {});
        setTimeout(() => { b.textContent = 'JSON 복사'; }, 1200);
      })),
    out,
  );
  panel.replaceChildren(...nodes);
}

/** 소리 버튼 목록 (누르면 재생 + 선택). 값을 바꾼 소리는 * 표시 */
function renderList(): void {
  list.replaceChildren(...soundNames().map((name) => {
    const b = button(`▶ ${busOf(name) === 'clear' ? '◇ ' : ''}${name}${DRAFTS.has(name) ? ' (초안)' : ''}${changed(name) ? ' *' : ''}`, () => {
      player.preview(name);
      if (selected !== name) {
        selected = name;
        buildPanel();
      }
      renderList();
    });
    b.classList.toggle('sel', name === selected);
    return b;
  }));
}

/** 조합: 데모와 같은 타이밍으로 이어 재생 */
const combos = Object.entries(data.combos).map(([id, seq]) =>
  button(`▶ 조합: ${id}`, () => seq.forEach(([ref, at]) => player.preview(ref.split('.')[1]!, at))));

/** 원본 자동 비교 (가짜 AudioContext로 노드·값·연결 기록을 맞춤) */
const results = el('div', { className: 'result' });
function runCompare(): void {
  const rows = [...compareBus('action', refAction), ...compareBus('clear', refClear)];
  const bad = rows.filter((r) => !r.same);
  results.replaceChildren(
    el('div', { className: bad.length ? 'bad' : 'ok', text: `원본과 같음 ${rows.length - bad.length} / ${rows.length}` }),
    ...rows.map((r) => el('div', {
      className: r.same ? 'ok' : 'bad',
      text: `${r.same ? '✓' : '✗'} ${r.bus}.${r.name} ← 원본 ${r.reference}${r.diff ? `\n    ${r.diff}` : ''}`,
    })),
  );
}

const volume = slider('효과음 볼륨', [0, 100, 1], player.volumes.sfx, (v) => String(v), (v) => player.setVolumes({ sfx: v }));
const frames = (['action', 'clear'] as const).map((bus) => {
  const f = el('iframe');
  f.src = `/reference-${bus}.html`;
  f.title = `승인 원본 reference-${bus}.html (수정 금지)`;
  return el('div', {}, el('div', { className: 'label', text: `승인 원본 ${bus}` }), f);
});

document.getElementById('app')!.append(
  el('header', {}, el('h1', { text: 'sfx-preview' }), volume, ...combos),
  el('div', { className: 'tab' }, panel,
    el('div', { className: 'view' },
      el('div', { className: 'label', text: '엔진 (client/src/audio, sfx.json). 원본과 같은 이름 버튼끼리 번갈아 들어 보기 · ◇ = clear 버스' }),
      list,
      el('div', { className: 'label', text: '원본 자동 비교' }),
      el('div', { className: 'buttons' }, button('다시 비교 (조정한 값 기준)', runCompare)), results,
      el('div', { className: 'refs' }, ...frames))),
);
renderList();
buildPanel();
runCompare();
