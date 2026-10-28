// 섬 탭 (sprites.md 12장): 섬 사물의 모든 방향·프레임, 승인 데모와 같은 배치의 장면(사물 땅 그림자 포함) + 승인 캡처, 초안 배치
import islandHudUrl from '../../../docs/refs/approved/island_hud.png?url';
import fx from '../../../client/data/fx.json';
import { castShadow } from '../../../client/src/sprites/castShadow';
import { draftIslandFrames, islandObjects, islandView, renderIslandFrame } from '../../../client/src/sprites/island';
import { draftsOn, setUseDrafts } from '../../../client/src/sprites/data';
import { paintCanvas, paintShadow } from '../../../client/src/sprites/textures';
import { groundHeight, paintGround } from '../../../client/src/view/islandGround';
import islandData from '../../../shared/data/island.json';
import itemsData from '../../../shared/data/items.json';
import { checkbox, el, slider } from './ui';

/** 승인 데모 render()의 사물 위치 (발밑 x, 아래 줄 y) */
const DEMO_SCENE: [string, number, number, number?][] = [
  ['treeBig', 26, 30], ['tree', 236, 28], ['tree', 272, 24], ['well', 152, 70], ['shop', 224, 80], ['board', 112, 68],
  ['flowerBed', 120, 89, 0], ['flowerBed', 184, 89, 1], ['fence', 40, 58], ['fence', 56, 58], ['lamp', 88, 68], ['mailbox', 200, 99], ['bench', 70, 100],
];
const demoPath = (x: number, y: number) => (y >= 70 && y < 80 && x >= 40 && x < 264) || (x >= 144 && x < 160 && y >= 70 && y < 110);

/** 초안 사물 늘어놓기 (회전 번호 포함) */
const DRAFT_SCENE: [string, number, number, number?][] = [
  ['storage', 40, 52], ['weaponRack', 92, 50], ['fountain', 160, 64], ['pot', 222, 40], ['flag', 246, 40], ['campfire', 270, 40],
  ['fence', 222, 66, 1], ['fence', 222, 76, 1], ['dock', 196, 109], ['bench', 252, 74, 1], ['bench', 40, 100, 2], ['mailbox', 90, 98, 1], ['mailbox', 110, 98, 2], ['mailbox', 130, 98, 3],
];

type Placed = [id: string, x: number, y: number, rot?: number];

/** 바닥 높이 사물 (땅 그림자 없음): 선착장·돌길 */
const GROUND = new Set([
  ...islandData.scenery.filter((s) => 'ground' in s && s.ground).map((s) => s.id),
  ...Object.entries(itemsData.decorations).filter(([, d]) => 'ground' in d && d.ground).map(([id]) => id),
]);
/** 땅 그림자 캔버스 캐시 (사물|프레임|반전) */
const shadows = new Map<string, { canvas: HTMLCanvasElement; foot: [number, number] }>();

function scene(canvas: HTMLCanvasElement, items: Placed[], scale: number, t: number, path = demoPath): void {
  const W = 288, H = groundHeight(110);
  const off = document.createElement('canvas');
  off.width = W;
  off.height = H;
  const g = off.getContext('2d')!;
  paintGround({ width: W, grassH: 110, seed: 3, path }, (x, y, c) => { g.fillStyle = c; g.fillRect(x, y, 1, 1); }, Math.floor(t / 500) % 2);
  const objs = islandObjects();
  for (const [id, x, y, r] of items) {
    const o = objs[id];
    if (!o || GROUND.has(id)) continue;
    const v = islandView(o, r ?? 0, t / 1000), key = [id, v.frame, v.flip, draftsOn()].join('|');
    if (!shadows.has(key)) {
      const sh = castShadow(renderIslandFrame(o, v.frame, v.flip), fx.islandShadow.shear, fx.islandShadow.lift);
      shadows.set(key, { canvas: paintShadow(sh), foot: sh.foot });
    }
    const sh = shadows.get(key)!;
    g.drawImage(sh.canvas, x - sh.foot[0], y - sh.foot[1]);
  }
  for (const [id, x, y, r] of [...items].sort((a, b) => a[2] - b[2])) {
    const o = objs[id];
    if (!o) continue;
    const v = islandView(o, r ?? 0, t / 1000), sp = renderIslandFrame(o, v.frame, v.flip);
    g.drawImage(paintCanvas(sp), x - sp.foot[0], y - sp.foot[1]);
  }
  canvas.width = W * scale;
  canvas.height = H * scale;
  const c = canvas.getContext('2d')!;
  c.imageSmoothingEnabled = false;
  c.drawImage(off, 0, 0, canvas.width, canvas.height);
}

/** 사물 한 칸: 모든 회전(순환은 재생) + 회전에 안 쓰이는 프레임 */
function cells(t: number): { id: string; label: string; canvas: HTMLCanvasElement }[] {
  const objs = islandObjects(), drafts = draftsOn() ? draftIslandFrames() : {};
  return Object.entries(objs).flatMap(([id, o]) => {
    const views = o.rot.map((_, r) => ({ r, ...islandView(o, r, t / 1000) }));
    const used = new Set(o.rot.flat().map((v) => v.split('|')[0]));
    const extra = Object.keys(o.frames).filter((f) => !used.has(f));
    const mark = (f: string) => (drafts[id]?.includes(f) ? ' (초안)' : '');
    return [
      ...views.map((v) => ({ id, label: `${id} 회전${v.r}${o.rot.length > 1 || Array.isArray(o.rot[0]) ? ` ${v.frame}${v.flip ? '↔' : ''}` : ''}${mark(v.frame)}`, sp: renderIslandFrame(o, v.frame, v.flip) })),
      ...extra.map((f) => ({ id, label: `${id}.${f}${mark(f)}`, sp: renderIslandFrame(o, f) })),
    ].map(({ id: i, label, sp }) => ({ id: i, label, canvas: paintCanvas(sp) }));
  });
}

export function islandTab(): HTMLElement {
  const s = { scale: 3, cellScale: 4 };
  const grid = el('div');
  grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end';
  const demoCanvas = el('canvas', { className: 'stage' }), draftCanvas = el('canvas', { className: 'stage' });
  const draftBox = el('section', {}, el('h3', { text: '초안 배치 (회전 포함)' }), draftCanvas);
  const img = el('img', { className: 'approved' });
  img.src = islandHudUrl;
  img.alt = '승인 캡처: 섬 화면 + HUD';
  img.style.width = `${288 * s.scale}px`;

  const drawGrid = (t: number) => {
    grid.replaceChildren(...cells(t).map((c) => {
      const big = el('canvas', { className: 'stage' });
      big.width = c.canvas.width * s.cellScale;
      big.height = c.canvas.height * s.cellScale;
      const g = big.getContext('2d')!;
      g.imageSmoothingEnabled = false;
      g.drawImage(c.canvas, 0, 0, big.width, big.height);
      return el('figure', {}, big, el('figcaption', { className: 'info', text: c.label }));
    }));
  };
  const draw = (t = performance.now()) => {
    scene(demoCanvas, DEMO_SCENE, s.scale, t);
    draftBox.hidden = !draftsOn();
    if (draftsOn()) scene(draftCanvas, DRAFT_SCENE, s.scale, t, () => false);
  };
  let lastGrid = -1;
  const loop = (t: number) => {
    draw(t);
    // 사물 칸은 순환 프레임이 바뀔 때만 다시 (0.1초 단위)
    const k = Math.floor(t / 100);
    if (k !== lastGrid) { lastGrid = k; drawGrid(t); }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  const on = <T>(fn: (v: T) => void) => (v: T) => { fn(v); lastGrid = -1; };
  const panel = el('div', { className: 'panel' },
    el('h3', { text: '섬 사물' }),
    checkbox('초안 보기 (drafts/island.json)', draftsOn(), on((v: boolean) => setUseDrafts(v))),
    el('p', { className: 'info', text: '승인 데모에 있던 사물은 데모와 픽셀 단위로 같음 (island.test.ts). 초안은 데모에 없던 시설·장식과 회전용 옆·뒤 모습' }),
    el('h3', { text: '보기' }),
    slider('장면 배율', [1, 5, 1], s.scale, (v) => `${v}배`, on((v: number) => { s.scale = v; img.style.width = `${288 * v}px`; })),
    slider('사물 배율', [1, 8, 1], s.cellScale, (v) => `${v}배`, on((v: number) => { s.cellScale = v; })),
  );
  return el('div', { className: 'tab' }, panel, el('div', { className: 'view' },
    el('h3', { text: '장면: 승인 데모와 같은 배치 (바닥·사물·사물 땅 그림자, 캐릭터·HUD 제외)' }), demoCanvas,
    el('p', { className: 'info', text: '승인 캡처' }), img,
    draftBox,
    el('h3', { text: '사물 (모든 회전·프레임)' }), grid));
}
