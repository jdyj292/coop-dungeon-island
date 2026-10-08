// 캐릭터 파츠 → 재질 격자 (docs/sprites.md 7장 1~3단계)
import type { SpriteData } from './data';
import type { Layer, Part, Point, Pose } from './schema';
import { weaponPixels, type Pixel } from './weapon';

export interface CharacterLook {
  hair: string;
  face: string;
  /** 착용 아이템 id (슬롯당 하나) */
  outfit: string[];
  /** 무기 외형 프로필 id. 없으면 무기·포즈 없이 기본 팔 */
  weapon?: string;
  /** poses.json의 포즈 이름 (무기 종류는 프로필의 type) */
  pose?: string;
  /** 걷기 프레임 (stand / walkA / walkB) */
  frame?: string;
  /** 걷기 몸 흔들림: 다리(bottom 층)를 뺀 나머지를 아래로 옮기는 px (walkStep이 정함) */
  bob?: number;
}

/** 걷기 박자 → 다리 프레임과 몸 내림 (poses.json walk) */
export function walkStep(data: SpriteData, beat: number): { frame: string; bob: number } {
  const { cycle, bob } = data.poses.walk;
  const i = ((beat % cycle.length) + cycle.length) % cycle.length;
  return { frame: cycle[i]!, bob: bob?.[i] ?? 0 };
}

export interface Composed {
  /** 재질 격자 ('.' = 빈칸), 내용 크기로 잘림 */
  rows: string[];
  /** 발밑 기준점 (rows 좌표) */
  foot: Point;
}

/** 무기가 상자 밖으로 뻗을 여유 */
const MARGIN = 16;

type Op = { layer: Layer; pixels: Pixel[] };

function partPixels(part: Part, frame: string): Pixel[] {
  const rows = part.rows ?? part.frames?.[frame] ?? part.frames?.stand;
  if (!rows) throw new Error(`프레임 '${frame}' 없음`);
  const out: Pixel[] = [];
  rows.forEach((row, j) => {
    [...row].forEach((ch, i) => {
      if (ch !== '.') out.push([part.offset[0] + i, part.offset[1] + j, ch]);
    });
  });
  return out;
}

/** 어깨에서 손까지 소매로 잇고 손(또는 건틀릿)을 그린다 */
function armPixels(shoulder: Point, hand: Point, sleeve: string, gauntlet: string | null, detached: boolean): Pixel[] {
  const out: Pixel[] = [];
  if (!detached) {
    let [x, y] = shoulder;
    const sx = Math.sign(hand[0] - x);
    const sy = Math.sign(hand[1] - y);
    for (let n = 0; (x !== hand[0] || y !== hand[1]) && n < 6; n++) {
      out.push([x, y, sleeve]);
      if (x !== hand[0]) x += sx;
      if (y !== hand[1]) y += sy;
    }
  }
  if (gauntlet) {
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) out.push([hand[0] + i, hand[1] - 1 + j, gauntlet]);
  } else out.push([hand[0], hand[1], 's']);
  return out;
}

export function composeCharacter(data: SpriteData, look: CharacterLook): Composed {
  const { base, outfits, poses, weapons } = data;
  const frame = look.frame ?? 'stand';
  const ops: Op[] = [];
  const addPart = (part: Part) => ops.push({ layer: part.layer, pixels: partPixels(part, frame) });

  base.parts.forEach(addPart);
  const face = base.faces[look.face];
  if (!face) throw new Error(`표정 '${look.face}' 없음`);
  ops.push({ layer: 'face', pixels: partPixels({ layer: 'face', ...face }, frame) });
  const hair = base.hairStyles[look.hair];
  if (!hair) throw new Error(`머리 모양 '${look.hair}' 없음`);
  hair.forEach(addPart);

  let sleeve = 's';
  const slots = new Set<string>();
  for (const id of look.outfit) {
    const item = outfits.items[id];
    if (!item) throw new Error(`의상 '${id}' 없음`);
    if (slots.has(item.slot)) throw new Error(`슬롯 '${item.slot}' 중복`);
    slots.add(item.slot);
    if (item.sleeve) sleeve = item.sleeve;
    item.parts.forEach(addPart);
  }

  // 포즈
  let pose: Pose = {};
  const profile = look.weapon ? weapons.profiles[look.weapon] : undefined;
  if (look.weapon && !profile) throw new Error(`무기 외형 '${look.weapon}' 없음`);
  if (profile && look.pose) {
    const p = poses.weapons[profile.type]?.[look.pose];
    if (!p) throw new Error(`포즈 '${profile.type}.${look.pose}' 없음`);
    pose = p;
  }
  const gauntletMat = profile?.gauntlet?.mat ?? 'K';
  const hands: Record<'front' | 'back', Point> = { ...base.defaultHands };
  for (const side of ['front', 'back'] as const) {
    const spec = pose[side];
    if (spec === null) continue;
    const hand = spec?.hand ?? base.defaultHands[side];
    hands[side] = hand;
    // detached 손은 몸 앞으로 나온 손이라 앞 팔 층에 그린다
    ops.push({
      layer: side === 'front' || spec?.detached ? 'front_arm' : 'back_arm',
      pixels: armPixels(base.shoulders[side], hand, sleeve, spec?.gauntlet ? gauntletMat : null, !!spec?.detached),
    });
  }
  if (profile) {
    for (const w of pose.weapons ?? []) {
      ops.push({
        layer: w.behind ? 'weapon_back' : 'weapon',
        pixels: weaponPixels(profile, w.origin ?? hands[w.hand], w.dir),
      });
    }
  }

  // layerOrder 순으로 찍기 (같은 층은 목록 순서)
  const [bw, bh] = base.box;
  const W = bw + MARGIN * 2;
  const H = bh + MARGIN * 2;
  const grid = Array.from({ length: H }, () => Array<string>(W).fill('.'));
  const order = (layer: Layer) => base.layerOrder.indexOf(layer);
  const sorted = ops.map((op, i) => ({ op, i })).sort((a, b) => order(a.op.layer) - order(b.op.layer) || a.i - b.i);
  for (const { op } of sorted) {
    // 걷기 몸 흔들림: 다리를 뺀 나머지가 함께 내려간다
    const dy = op.layer === 'bottom' ? 0 : (look.bob ?? 0);
    for (const [x, y, ch] of op.pixels) {
      const gx = x + MARGIN;
      const gy = y + dy + MARGIN;
      if (gx < 0 || gy < 0 || gx >= W || gy >= H) throw new Error(`상자 밖 픽셀 (${x},${y})`);
      grid[gy]![gx] = ch === '_' ? '.' : ch;
    }
  }
  return crop(grid, [base.foot[0] + MARGIN, base.foot[1] + MARGIN]);
}

/** 빈칸 테두리를 잘라내고 기준점을 옮긴다 */
export function crop(grid: string[][], foot: Point): Composed {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  grid.forEach((row, y) =>
    row.forEach((ch, x) => {
      if (ch === '.') return;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }),
  );
  if (x1 < 0) return { rows: [], foot: [0, 0] };
  const rows = grid.slice(y0, y1 + 1).map((row) => row.slice(x0, x1 + 1).join(''));
  return { rows, foot: [foot[0] - x0, foot[1] - y0] };
}
