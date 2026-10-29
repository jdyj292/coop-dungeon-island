// motion-preview: 게임과 같은 전투 코드로 모션을 반복 재생하고, 값을 바꿔 보고, 바꾼 값을 JSON으로 복사 (docs/motion.md 9장)
import Phaser from 'phaser';
import { SKILLS, weaponDef } from '@game/shared';
import { el, select, slider } from '../../sprite-preview/src/ui';
import { applyPreset, changedJson, DEMO_TIMING, getValue, isChanged, PARAMS, resetAll, setValue } from './params';
import { controls, MotionScene, VIEW_H, VIEW_W } from './scene';
import type { ScriptMode } from './script';

const ZOOM = 4;
const app = document.getElementById('app')!;

function button(text: string, onClick: (b: HTMLButtonElement) => void): HTMLButtonElement {
  const b = el('button', { text });
  b.type = 'button';
  b.addEventListener('click', () => onClick(b));
  return b;
}

// 재생 조작
const playBtn = button('일시정지 (Space)', () => togglePause());
function togglePause(): void {
  controls.paused = !controls.paused;
  playBtn.textContent = controls.paused ? '재생 (Space)' : '일시정지 (Space)';
  playBtn.classList.toggle('on', controls.paused);
}
function stepFrame(): void {
  if (!controls.paused) togglePause();
  controls.stepFrames++;
}
const speed = select('속도', [['1', '1배'], ['0.5', '1/2'], ['0.25', '1/4'], ['0.125', '1/8']], '1', (v) => {
  controls.speed = Number(v);
});
/** 변형 고르기: 그 무기 기본 스킬의 변형마다 "스킬:3:변형" (게임 ?skills=와 같은 형식) */
const variantOptions = (w: string): [string, string][] => [['', '기본 (변형 없음)'], ...weaponDef(w).baseSkills.flatMap((id) =>
  Object.entries(SKILLS[id]?.variants ?? {}).map(([v, d]): [string, string] => [`${id}:3:${v}`, `${SKILLS[id]!.name} · ${d.name}`]))];
const variant = select('변형', variantOptions('greatsword'), '', (v) => {
  controls.skills = v;
  controls.restart = true;
});
const weapon = select('무기', [['greatsword', '대검'], ['staff', '스태프']], 'greatsword', (v) => {
  controls.weapon = v;
  controls.skills = '';
  variant.set(variantOptions(v), '');
  controls.rebuild = true;
});
const mode = select('동작', [['all', '3연타 → 스킬'], ['combo', '3연타만'], ['launch', '스킬만']], 'all', (v) => {
  controls.mode = v as ScriptMode;
  controls.restart = true;
});
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  if (e.code === 'Space') { e.preventDefault(); togglePause(); }
  if (e.code === 'Period') stepFrame();
});

// 값 조정 패널 (값이 원래와 다르면 이름 강조)
const panel = el('div', { className: 'panel' });
const out = el('textarea');
out.readOnly = true;
function buildPanel(): void {
  const nodes: Node[] = [];
  let group = '';
  for (const p of PARAMS) {
    if (p.group !== group) nodes.push(el('h3', { text: (group = p.group) }));
    const step = p.range[2];
    const digits = step < 1 ? String(step).split('.')[1]!.length : 0;
    const row = slider(p.label, p.range, getValue(p), (v) => v.toFixed(digits), (v) => {
      setValue(p, v);
      row.classList.toggle('changed', isChanged(p));
    });
    row.classList.toggle('changed', isChanged(p));
    nodes.push(row);
  }
  nodes.push(
    el('h3', { text: '바꾼 값' }),
    el('div', { className: 'buttons' },
      button('데모 타이밍', () => { applyPreset(DEMO_TIMING); buildPanel(); controls.restart = true; }),
      button('원래 값', () => { resetAll(); buildPanel(); controls.restart = true; }),
      button('JSON 복사', (b) => {
        out.value = changedJson();
        void navigator.clipboard?.writeText(out.value).then(() => { b.textContent = '복사됨'; }, () => {});
        setTimeout(() => { b.textContent = 'JSON 복사'; }, 1200);
      })),
    out,
  );
  panel.replaceChildren(...nodes);
}
buildPanel();

const stageBox = el('div');
const info = el('div', { className: 'info' });
controls.onInfo = (text) => { info.textContent = text; };
const reference = el('iframe');
reference.src = '/reference.html';
reference.title = '승인 데모 (수정 금지 원본)';
// 같은 출처라 스타일리시 캔버스가 보이도록 iframe 안만 스크롤 (원본 파일은 건드리지 않음)
reference.addEventListener('load', () => {
  const target = reference.contentDocument?.getElementById('cB');
  if (target) reference.contentWindow?.scrollTo(0, target.offsetTop - 28);
});

app.append(
  el('header', {},
    el('h1', { text: 'motion-preview' }), playBtn, button('▶ 1프레임 (.)', stepFrame),
    button('처음부터', () => { controls.restart = true; }), speed.node, weapon.node, variant.node, mode.node),
  el('div', { className: 'tab' }, panel,
    el('div', { className: 'view' },
      el('div', { className: 'label', text: '구현 (게임 코드 그대로, 값은 메모리에서만 바뀜)' }), stageBox, info,
      el('div', { className: 'label', text: '승인 데모 tools/motion-preview/reference.html (아래는 스타일리시)' }), reference)),
);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: stageBox,
  width: VIEW_W,
  height: VIEW_H,
  pixelArt: true,
  roundPixels: true,
  scale: { mode: Phaser.Scale.NONE, zoom: ZOOM },
  scene: [MotionScene],
});

// 개발 중 브라우저 콘솔에서 상태를 볼 수 있게 (client/src/main.ts와 같음)
if (import.meta.env.DEV) (window as unknown as { game: Phaser.Game }).game = game;
