// 몬스터 탭: 프레임 하나 / 전체 프레임 / 상태 재생. 승인 캡처를 함께 띄운다
import approvedUrl from '../../../docs/refs/approved/floor1_monsters.png?url';
import { spriteData } from '../../../client/src/sprites/data';
import { renderMonsterFrame } from '../../../client/src/sprites/monster';
import { drawStage, type Background, type Item } from './draw';
import { checkbox, el, opts, select, slider } from './ui';

type Mode = 'frame' | 'all' | 'state';

export function monsterTab(): HTMLElement {
  const data = spriteData();
  const ids = Object.keys(data.monsters);
  const s = {
    id: ids[0]!, mode: 'frame' as Mode, frame: '', state: 'idle',
    frameMs: 400, superArmor: true, blink: true, blinkMs: 100,
    shake: true, offset: true, spin: true, flip: false, scale: 4, bg: 'dungeon' as Background, shadow: true, foot: false,
  };
  const monster = () => data.monsters[s.id]!;
  s.frame = Object.keys(monster().frames)[0]!;

  const canvas = el('canvas', { className: 'stage' });
  const labels = el('div', { className: 'labels' });
  const info = el('p', { className: 'info' });

  const item = (name: string, x: number, y: number, t: number): Item => {
    const f = monster().frames[name]!;
    const sa = s.superArmor && !!f.superArmorOutline && (!s.blink || Math.floor(t / s.blinkMs) % 2 === 0);
    const sprite = renderMonsterFrame(data, s.id, name, { superArmor: sa });
    let dx = s.offset ? (f.offset?.[0] ?? 0) : 0;
    const dy = s.offset ? (f.offset?.[1] ?? 0) : 0;
    if (s.shake && f.shake) dx += Math.floor(t / 33) % 2 ? 1 : -1;
    return { sprite, x: x + (s.flip ? -dx : dx), y: y + dy, flip: s.flip, rot: s.spin && f.spin ? Math.floor(t / 125) : 0 };
  };

  const draw = (t = performance.now()) => {
    const frames = monster().frames;
    const names = Object.keys(frames);
    const maxW = Math.max(...names.map((n) => frames[n]!.rows[0]!.length));
    const maxH = Math.max(...names.map((n) => frames[n]!.rows.length));
    const cellW = maxW + 16, height = maxH + 16, footY = height - 6;
    let shown: string[];
    if (s.mode === 'all') shown = names;
    else if (s.mode === 'frame') shown = [s.frame];
    else {
      const ref = monster().states[s.state]!;
      const list = [ref].flat();
      shown = [list[Math.floor(t / s.frameMs) % list.length]!];
    }
    const items = shown.map((n, i) => item(n, i * cellW + Math.floor(cellW / 2), footY, t));
    drawStage(canvas, items, {
      width: cellW * shown.length, height, scale: s.scale, bg: s.bg, shadow: s.shadow, showFoot: s.foot,
    });
    labels.replaceChildren(...shown.map((n) => el('span', { text: n })));
    labels.style.gridTemplateColumns = `repeat(${shown.length}, ${cellW * s.scale}px)`;
    const f = frames[shown[0]!]!;
    info.textContent = s.mode === 'all' ? `${names.length}프레임` : [
      `${f.rows[0]!.length}×${f.rows.length}`, `발밑 ${f.foot.join(',')}`,
      f.offset && `offset ${f.offset.join(',')}`, f.shake && 'shake', f.spin && 'spin',
      f.superArmorOutline && 'superArmorOutline',
      f.fx && `fx: ${f.fx.map((x) => x.type).join(', ')} (이펙트는 0-6에서 그림)`,
    ].filter(Boolean).join(' · ');
  };

  const loop = (t: number) => {
    draw(t);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  // 창이 가려져 rAF가 멈춰도 값을 바꾸면 바로 그린다
  const on = <T>(fn: (v: T) => void) => (v: T) => { fn(v); draw(); };
  const frameNames = () => opts(Object.keys(monster().frames));
  const stateNames = () => opts(Object.keys(monster().states));
  const bgs: [string, string][] = [['dungeon', '던전 바닥'], ['island', '섬 잔디'], ['checker', '체크무늬']];
  const ms = (v: number) => `${v}ms`;

  const frameSelect = select('프레임', frameNames(), s.frame, on((v: string) => { s.frame = v; }));
  const stateSelect = select('상태', stateNames(), s.state, on((v: string) => { s.state = v; }));
  const panel = el('div', { className: 'panel' },
    el('h3', { text: '몬스터' }),
    select('종류', opts(ids), s.id, on((v: string) => {
      s.id = v;
      s.frame = Object.keys(monster().frames)[0]!;
      s.state = 'idle';
      frameSelect.set(frameNames(), s.frame);
      stateSelect.set(stateNames(), s.state);
    })).node,
    select('보기', [['frame', '프레임 하나'], ['all', '전체 프레임'], ['state', '상태 재생']], s.mode,
      on((v: string) => { s.mode = v as Mode; })).node,
    frameSelect.node,
    stateSelect.node,
    slider('상태 프레임 길이', [100, 1000, 50], s.frameMs, ms, on((v: number) => { s.frameMs = v; })),
    el('h3', { text: '프레임 데이터 반영' }),
    checkbox('offset', s.offset, on((v: boolean) => { s.offset = v; })),
    checkbox('shake (좌우 1px 떨림)', s.shake, on((v: boolean) => { s.shake = v; })),
    checkbox('spin (1/8초마다 90°)', s.spin, on((v: boolean) => { s.spin = v; })),
    checkbox('슈퍼아머 외곽선', s.superArmor, on((v: boolean) => { s.superArmor = v; })),
    checkbox('외곽선 깜빡임', s.blink, on((v: boolean) => { s.blink = v; })),
    slider('깜빡임 간격', [50, 400, 10], s.blinkMs, ms, on((v: number) => { s.blinkMs = v; })),
    el('h3', { text: '보기' }),
    checkbox('왼쪽 보기 (좌우 반전)', s.flip, on((v: boolean) => { s.flip = v; })),
    slider('배율', [1, 8, 1], s.scale, (v) => `${v}배`, on((v: number) => { s.scale = v; })),
    select('배경', bgs, s.bg, on((v: string) => { s.bg = v as Background; })).node,
    checkbox('그림자', s.shadow, on((v: boolean) => { s.shadow = v; })),
    checkbox('발밑 기준점 표시', s.foot, on((v: boolean) => { s.foot = v; })),
  );
  draw();
  const approved = el('img', { className: 'approved' });
  approved.src = approvedUrl;
  approved.alt = '승인 캡처: 1층 몬스터 5종 동작 프레임';
  return el('div', { className: 'tab' }, panel, el('div', { className: 'view' },
    canvas, labels, info, el('h3', { text: '승인 캡처 (docs/refs/approved/floor1_monsters.png)' }), approved));
}
