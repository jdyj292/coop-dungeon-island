// 비교 탭: 승인 캡처와 같은 배치로 생성한 줄 + 그 아래 승인 PNG
import expressionsUrl from '../../../docs/refs/approved/character_expressions.png?url';
import outfitsUrl from '../../../docs/refs/approved/character_outfits.png?url';
import posesUrl from '../../../docs/refs/approved/character_weapon_poses.png?url';
import { spriteData } from '../../../client/src/sprites/data';
import { renderCharacter } from '../../../client/src/sprites/render';
import type { CharacterLook } from '../../../client/src/sprites/compose';
import { drawStage } from './draw';
import { el, slider } from './ui';

const CELL_W = 40, CELL_H = 40, FOOT_Y = 33;
const COLORS = { hairColor: 'global.hairColors.0', playerColor: 'global.playerColors.0' };

interface Strip { title: string; approved: string; rows: [label: string, look: CharacterLook][][] }

function strips(): Strip[] {
  const data = spriteData();
  const sets = data.outfits.sets;
  const bare = { hair: 'short', face: 'normal', outfit: sets.beginner! };
  const weapons: [string, string[]][] = [
    ['greatsword_basic', ['idle', 'ready', 'slash', 'upslash']],
    ['staff_basic', ['idle', 'ready', 'bolt', 'area']],
    ['gauntlet_basic', ['guard', 'jab', 'uppercut', 'grab']],
    ['dagger_basic', ['idle', 'slash1', 'slash2', 'throw']],
  ];
  return [
    {
      title: '표정 3종', approved: expressionsUrl,
      rows: [Object.keys(data.base.faces).map((face) => [face, { ...bare, face }])],
    },
    {
      title: '의상 4세트 + 조합', approved: outfitsUrl,
      rows: [[
        ...['beginner', 'wizard', 'rogue', 'knight'].map((set): [string, CharacterLook] => [set, { ...bare, outfit: sets[set]! }]),
        ['조합', { ...bare, outfit: ['cape_blue', 'top_armor', 'bottom_armor', 'hat_wizard'] }],
      ]],
    },
    {
      title: '무기 4종 × 포즈 4', approved: posesUrl,
      rows: weapons.map(([weapon, poses]) => poses.map((pose): [string, CharacterLook] => [`${weapon} ${pose}`, { ...bare, weapon, pose }])),
    },
  ];
}

export function compareTab(): HTMLElement {
  const data = spriteData();
  let scale = 4;
  const sections = el('div');
  const render = () => {
    sections.replaceChildren(...strips().map((strip) => {
      const rows = strip.rows.map((row) => {
        const canvas = el('canvas', { className: 'stage' });
        drawStage(canvas, row.map(([, look], i) => ({
          sprite: renderCharacter(data, look, COLORS), x: i * CELL_W + CELL_W / 2, y: FOOT_Y,
        })), { width: CELL_W * row.length, height: CELL_H, scale, bg: 'dungeon', shadow: true, showFoot: false });
        const labels = el('div', { className: 'labels' }, ...row.map(([label]) => el('span', { text: label })));
        labels.style.gridTemplateColumns = `repeat(${row.length}, ${CELL_W * scale}px)`;
        return el('div', {}, canvas, labels);
      });
      const img = el('img', { className: 'approved' });
      img.src = strip.approved;
      img.alt = `승인 캡처: ${strip.title}`;
      return el('section', {}, el('h3', { text: strip.title }), ...rows, el('p', { className: 'info', text: '승인 캡처' }), img);
    }));
  };
  render();
  const panel = el('div', { className: 'panel' },
    el('h3', { text: '비교' }),
    el('p', { className: 'info', text: '생성 결과(위)와 승인 캡처(아래). 머리색·플레이어 색은 0번' }),
    slider('배율', [1, 8, 1], scale, (v) => `${v}배`, (v) => { scale = v; render(); }),
  );
  return el('div', { className: 'tab' }, panel, el('div', { className: 'view' }, sections));
}
