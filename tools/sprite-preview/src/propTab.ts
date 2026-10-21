// 소품 탭 (sprites.md 11장): 장애물·문·귀환 고리·보물상자의 모든 프레임을 나란히, 순환 상태(귀환 고리 켜짐)는 재생
// 승인된 소품이 없으면 "초안 보기"를 켜서 drafts/props.json을 본다
import { draftPropNames, draftsOn, setUseDrafts, spriteData } from '../../../client/src/sprites/data';
import { renderPropFrame } from '../../../client/src/sprites/monster';
import { drawStage, type Background, type Item } from './draw';
import { checkbox, el, select, slider } from './ui';

export function propTab(): HTMLElement {
  if (!Object.keys(spriteData().props).length) setUseDrafts(true);
  const s = { scale: 5, bg: 'dungeon' as Background, shadow: false, foot: false, playMs: 400 };
  const canvas = el('canvas', { className: 'stage' });
  const labels = el('div', { className: 'labels' });
  const info = el('p', { className: 'info' });

  /** (소품, 프레임 또는 순환 상태) 목록 */
  const cells = () => Object.entries(spriteData().props).flatMap(([id, p]) => {
    const loops = Object.entries(p.states).filter(([, ref]) => Array.isArray(ref)).map(([st]) => ({ id, label: `${st} (재생)`, state: st }));
    return [...Object.keys(p.frames).map((f) => ({ id, label: f, frame: f })), ...loops];
  });

  const draw = (t = performance.now()) => {
    const props = spriteData().props, list = cells();
    if (!list.length) {
      info.textContent = '소품이 없습니다 (초안 보기를 켜세요)';
      return;
    }
    const maxW = Math.max(...Object.values(props).flatMap((p) => Object.values(p.frames).map((f) => f.rows[0]!.length)));
    const maxH = Math.max(...Object.values(props).flatMap((p) => Object.values(p.frames).map((f) => f.rows.length)));
    const cellW = maxW + 10, height = maxH + 12, footY = height - 4;
    const items: Item[] = list.map((c, i) => {
      let frame = 'frame' in c ? c.frame! : '';
      if ('state' in c) {
        const ref = [props[c.id]!.states[c.state!]!].flat();
        frame = ref[Math.floor(t / s.playMs) % ref.length]!;
      }
      return { sprite: renderPropFrame(spriteData(), c.id, frame), x: i * cellW + Math.floor(cellW / 2), y: footY, flip: false, rot: 0 };
    });
    drawStage(canvas, items, { width: cellW * list.length, height, scale: s.scale, bg: s.bg, shadow: s.shadow, showFoot: s.foot });
    const drafts = draftsOn() ? draftPropNames() : [];
    labels.replaceChildren(...list.map((c) => el('span', { text: `${c.id}.${c.label}${drafts.includes(c.id) ? ' (초안)' : ''}` })));
    labels.style.gridTemplateColumns = `repeat(${list.length}, ${cellW * s.scale}px)`;
    info.textContent = Object.entries(props).map(([id, p]) => {
      const f = Object.values(p.frames)[0]!;
      return `${id} ${f.rows[0]!.length}×${f.rows.length}`;
    }).join(' · ');
  };
  const loop = (t: number) => {
    draw(t);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  const on = <T>(fn: (v: T) => void) => (v: T) => { fn(v); draw(); };
  const bgs: [string, string][] = [['dungeon', '던전 바닥'], ['island', '섬 잔디'], ['checker', '체크무늬']];
  const panel = el('div', { className: 'panel' },
    el('h3', { text: '소품' }),
    checkbox('초안 보기 (drafts/props.json)', draftsOn(), on((v: boolean) => setUseDrafts(v))),
    slider('순환 프레임 길이', [100, 1000, 50], s.playMs, (v) => `${v}ms`, on((v: number) => { s.playMs = v; })),
    el('h3', { text: '보기' }),
    slider('배율', [1, 8, 1], s.scale, (v) => `${v}배`, on((v: number) => { s.scale = v; })),
    select('배경', bgs, s.bg, on((v: string) => { s.bg = v as Background; })).node,
    checkbox('그림자', s.shadow, on((v: boolean) => { s.shadow = v; })),
    checkbox('발밑 기준점 표시', s.foot, on((v: boolean) => { s.foot = v; })),
  );
  draw();
  return el('div', { className: 'tab' }, panel, el('div', { className: 'view' }, canvas, labels, info,
    el('p', { className: 'info', text: '게임 안 배치는 개발 모드 ?drafts=1&room=2 (그루터기), room=3 (문·귀환 고리·상자)' })));
}
