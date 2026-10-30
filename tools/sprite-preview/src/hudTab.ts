// HUD 아이콘 탭 (hud.md 2장 슬롯, MVP 보충 ST-3): 승인된 아이콘(hud_icons.json)과 초안(drafts/hud_icons.json)을
// 게임과 같은 18×18 슬롯 모양(테두리·안쪽·바탕)에 그려 나란히 본다. 아래 줄 = 무기별 아래 띠 J U I O P 미리보기 (O·P = 계열 A·B 스킬, 조합 2가지씩)
import approved from '../../../client/data/sprites/hud_icons.json';
import drafts from '../../../client/data/sprites/drafts/hud_icons.json';
import { color } from '../../../client/src/palette';
import { checkbox, el, slider } from './ui';

type IconSet = { palette: Record<string, string>; slots: Record<string, string>; icons: Record<string, string[]> };
const A = approved as unknown as IconSet, D = drafts as unknown as IconSet;
const SLOT = 18, GAP = 4;

/** 무기별 아래 띠 J U I O P (무기 id·기본 스킬 2·계열 A·B 스킬) */
const LOADOUTS: [string, string[]][] = [
  ['대검', ['greatsword', 'gs_launch', 'gs_earthsplit', 'gs_whirl', 'gs_wave']],
  ['대검', ['greatsword', 'gs_launch', 'gs_earthsplit', 'gs_shoulder', 'gs_draw']],
  ['스태프', ['staff', 'st_fireburst', 'st_icefield', 'st_pillar', 'st_orb']],
  ['스태프', ['staff', 'st_fireburst', 'st_icefield', 'st_icelance', 'st_lift']],
];
const KEYS = ['J', 'U', 'I', 'O', 'P'];

export function hudTab(): HTMLElement {
  const s = { scale: 5, gray: false };
  const canvas = el('canvas', { className: 'stage' });
  const labels = el('div', { className: 'labels' });
  const pal = { ...A.palette, ...D.palette };
  const iconOf = (name: string) => D.icons[name] ?? A.icons[name];
  const slotIcon = (id: string) => D.slots[id] ?? A.slots[id] ?? 'empty';

  const draw = () => {
    const names = [...Object.keys(A.icons), ...Object.keys(D.icons)];
    const rowW = names.length * (SLOT + GAP) + GAP, w = Math.max(rowW, 5 * (SLOT + 2) + 60), h = SLOT * (LOADOUTS.length + 1) + GAP * (LOADOUTS.length + 2) + 4;
    canvas.width = w * s.scale;
    canvas.height = h * s.scale;
    const ctx = canvas.getContext('2d')!;
    const px = (x: number, y: number, c: string, pw = 1, ph = 1) => {
      ctx.fillStyle = c;
      ctx.fillRect(x * s.scale, y * s.scale, pw * s.scale, ph * s.scale);
    };
    const slotAt = (x: number, y: number, icon: string) => {
      px(x, y, color('global.ui.panelBorder'), SLOT, SLOT);
      px(x + 1, y + 1, color('global.ui.panelInner'), 16, 16);
      px(x + 2, y + 2, color('global.ui.panel'), 14, 14);
      iconOf(icon)?.forEach((row, j) => [...row].forEach((ch, i) => {
        if (ch !== '.') px(x + 1 + i, y + 1 + j, color(s.gray ? 'global.ui.panelBorder' : pal[ch]!));
      }));
    };
    px(0, 0, color('global.ui.panel'), w, h);
    // 1줄: 모든 아이콘 (초안은 아래에 금색 점)
    names.forEach((n, i) => {
      slotAt(GAP + i * (SLOT + GAP), GAP, n);
      if (D.icons[n]) px(GAP + i * (SLOT + GAP) + 8, GAP + SLOT + 1, color('global.allyFx.gold'), 2, 1);
    });
    // 2줄부터: 무기별 J U I O P
    LOADOUTS.forEach(([, ids], r) => ids.forEach((id, i) => slotAt(GAP + i * (SLOT + 2), GAP * 2 + SLOT + 4 + r * (SLOT + GAP), slotIcon(id))));
    labels.replaceChildren(
      el('span', { text: `1줄: ${names.map((n) => (D.icons[n] ? `${n}(초안)` : n)).join(' · ')}` }),
      ...LOADOUTS.map(([w, ids]) => el('span', { text: `${w}: ${ids.map((id, i) => `${KEYS[i]} ${id}`).join(' · ')}` })),
    );
  };

  const controls = el('div', { className: 'controls' },
    slider('확대', [2, 10, 1], s.scale, (v) => `${v}배`, (v) => { s.scale = v; draw(); }),
    checkbox('MP 부족 회색', s.gray, (v) => { s.gray = v; draw(); }),
  );
  draw();
  return el('div', { className: 'tab' }, controls, el('div', { className: 'view' }, canvas, labels,
    el('p', { className: 'info', text: '초안: client/data/sprites/drafts/hud_icons.json (승인 전). 승인되면 hud_icons.json으로 옮긴다' })));
}
