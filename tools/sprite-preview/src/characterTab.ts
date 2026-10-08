// 캐릭터 탭: 머리·색·표정·의상·무기·포즈·걷기 조합
import paletteJson from '../../../client/data/palette.json';
import { spriteData } from '../../../client/src/sprites/data';
import { renderCharacter } from '../../../client/src/sprites/render';
import { SLOTS } from '../../../client/src/sprites/schema';
import { drawStage, type Background } from './draw';
import { buttons, checkbox, el, opts, select, slider } from './ui';

const STAGE = { width: 64, height: 48, footX: 32, footY: 40 };

export function characterTab(): HTMLElement {
  const data = spriteData();
  const { items, sets } = data.outfits;
  const s = {
    hair: 'short', hairColor: 0, playerColor: 0, face: 'normal',
    outfit: { hat: '-', top: 'top_tunic', bottom: 'bottom_shorts', cape: '-' } as Record<string, string>,
    weapon: 'greatsword_basic', pose: 'idle', frame: 'stand',
    walking: false, beatMs: 150, flip: false, scale: 8, bg: 'dungeon' as Background, shadow: true, foot: false,
  };

  const canvas = el('canvas', { className: 'stage' });
  const info = el('p', { className: 'info' });
  const posesOf = () => {
    const type = data.weapons.profiles[s.weapon]?.type;
    return type ? Object.keys(data.poses.weapons[type] ?? {}) : [];
  };

  const draw = (now = performance.now()) => {
    const cycle = data.poses.walk.cycle;
    const frame = s.walking ? cycle[Math.floor(now / s.beatMs) % cycle.length]! : s.frame;
    const look = {
      hair: s.hair, face: s.face, frame,
      outfit: Object.values(s.outfit).filter((id) => id !== '-'),
      weapon: s.weapon === '-' ? undefined : s.weapon,
      pose: s.weapon === '-' ? undefined : s.pose,
    };
    try {
      const sprite = renderCharacter(data, look, {
        hairColor: `global.hairColors.${s.hairColor}`, playerColor: `global.playerColors.${s.playerColor}`,
      });
      drawStage(canvas, [{ sprite, x: STAGE.footX, y: STAGE.footY, flip: s.flip }], {
        width: STAGE.width, height: STAGE.height, scale: s.scale, bg: s.bg, shadow: s.shadow, showFoot: s.foot,
      });
      info.textContent = `${sprite.width}×${sprite.height}px (외곽선 포함) · 발밑 ${sprite.foot.join(',')} · 프레임 ${frame}`;
    } catch (e) {
      info.textContent = `오류: ${(e as Error).message}`;
    }
  };

  let raf = 0;
  const loop = (now: number) => {
    draw(now);
    raf = s.walking ? requestAnimationFrame(loop) : 0;
  };
  const redraw = () => {
    if (s.walking && !raf) raf = requestAnimationFrame(loop);
    else if (!s.walking) draw();
  };

  const colorOpts = (list: string[]): [string, string][] => list.map((hex, i) => [String(i), `${i} (${hex})`]);
  const slotSelects: Record<string, ReturnType<typeof select>> = {};
  for (const slot of SLOTS) {
    const choices: [string, string][] = [['-', '없음'], ...Object.entries(items)
      .filter(([, it]) => it.slot === slot).map(([id, it]): [string, string] => [id, it.name])];
    slotSelects[slot] = select(slot, choices, s.outfit[slot]!, (v) => { s.outfit[slot] = v; redraw(); });
  }
  const applySet = (name: string) => {
    for (const slot of SLOTS) s.outfit[slot] = sets[name]!.find((id) => items[id]?.slot === slot) ?? '-';
    for (const slot of SLOTS) slotSelects[slot]!.set(
      [['-', '없음'], ...Object.entries(items).filter(([, it]) => it.slot === slot).map(([id, it]): [string, string] => [id, it.name])],
      s.outfit[slot]!,
    );
    redraw();
  };

  const poseSelect = select('포즈', opts(posesOf()), s.pose, (v) => { s.pose = v; redraw(); });
  const panel = el('div', { className: 'panel' },
    el('h3', { text: '몸' }),
    select('머리 모양', opts(Object.keys(data.base.hairStyles)), s.hair, (v) => { s.hair = v; redraw(); }).node,
    select('머리색', colorOpts(paletteJson.global.hairColors), '0', (v) => { s.hairColor = Number(v); redraw(); }).node,
    select('플레이어 색', colorOpts(paletteJson.global.playerColors), '0', (v) => { s.playerColor = Number(v); redraw(); }).node,
    select('표정', opts(Object.keys(data.base.faces)), s.face, (v) => { s.face = v; redraw(); }).node,
    el('h3', { text: '의상' }),
    buttons('세트', Object.keys(sets).map((name): [string, () => void] => [name, () => applySet(name)])),
    ...SLOTS.map((slot) => slotSelects[slot]!.node),
    el('h3', { text: '무기·포즈' }),
    select('무기 외형', [['-', '없음'], ...opts(Object.keys(data.weapons.profiles))], s.weapon, (v) => {
      s.weapon = v;
      const poses = posesOf();
      s.pose = poses.includes(s.pose) ? s.pose : (poses[0] ?? '');
      poseSelect.set(opts(poses), s.pose);
      redraw();
    }).node,
    poseSelect.node,
    el('h3', { text: '걷기' }),
    select('프레임', opts(['stand', 'walkA', 'walkB']), s.frame, (v) => { s.frame = v; redraw(); }).node,
    checkbox('걷기 재생 (stand→walkA→stand→walkB)', s.walking, (v) => { s.walking = v; redraw(); }),
    slider('한 박자', [60, 400, 10], s.beatMs, (v) => `${v}ms`, (v) => { s.beatMs = v; }),
    el('h3', { text: '보기' }),
    checkbox('왼쪽 보기 (좌우 반전)', s.flip, (v) => { s.flip = v; redraw(); }),
    slider('배율', [1, 12, 1], s.scale, (v) => `${v}배`, (v) => { s.scale = v; redraw(); }),
    select('배경', [['dungeon', '던전 바닥'], ['island', '섬 잔디'], ['checker', '체크무늬']], s.bg, (v) => { s.bg = v as Background; redraw(); }).node,
    checkbox('그림자', s.shadow, (v) => { s.shadow = v; redraw(); }),
    checkbox('발밑 기준점 표시', s.foot, (v) => { s.foot = v; redraw(); }),
  );
  draw();
  return el('div', { className: 'tab' }, panel, el('div', { className: 'view' }, canvas, info));
}
