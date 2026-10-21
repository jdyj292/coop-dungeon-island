// 실행: pnpm map-gen [--force] — 1층 방 Tiled 맵 초기 생성 + 편집용 타일셋 그림 (docs/dungeon.md 10장)
// 맵 원본은 maps/<map>.json (Tiled가 그대로 열고 저장하는 JSON 맵). 이미 있으면 덮어쓰지 않는다 (--force면 덮어씀)
// 타일셋 PNG는 Tiled 편집 화면용 (palette.json 색). 게임은 그리지 않고 장애물 칸·오브젝트 위치만 읽는다
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MONSTERS, ROOMS, TILE } from '../../shared/src';
import { encodePng } from './png';
import { roomObjects } from './layout';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const force = process.argv.includes('--force');
const palette = JSON.parse(readFileSync(join(root, 'client/data/palette.json'), 'utf8'));

/** 타일 종류 (타일셋 칸 순서). kind가 있으면 장애물 */
export const TILES = [
  { name: 'floor', color: palette.floors['1'].bg.floor },
  { name: 'floorAlt', color: palette.floors['1'].bg.floorAlt },
  { name: 'rock', color: palette.floors['1'].bg.wall, kind: 'rock' },
  { name: 'stump', color: palette.floors['1'].env.trunk, kind: 'stump' },
] as const;

/** 방마다 장애물 (타일 좌표, dungeon.md 5장 방 구성: 1 낮은 바위, 2 그루터기) */
const OBSTACLES: Record<string, [tx: number, ty: number, kind: 'rock' | 'stump'][]> = {
  'floor1/room1': [[6, 1, 'rock'], [12, 6, 'rock']],
  'floor1/room2': [[10, 2, 'stump'], [11, 5, 'stump']],
};

function tilesetPng(): Buffer {
  const w = TILE * TILES.length, h = TILE, px = Buffer.alloc(w * h * 4);
  TILES.forEach((t, i) => {
    const [r, g, b] = [1, 3, 5].map((k) => parseInt(t.color.slice(k, k + 2), 16));
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < TILE; x++) {
        // 장애물은 가장자리를 어둡게 해서 편집 화면에서 구분
        const edge = 'kind' in t && (x === 0 || y === 0 || x === TILE - 1 || y === TILE - 1);
        const o = (y * w + i * TILE + x) * 4, k = edge ? 0.6 : 1;
        px.set([Math.round(r! * k), Math.round(g! * k), Math.round(b! * k), 255], o);
      }
    }
  });
  return encodePng(w, h, px);
}

function mapJson(id: string, room: (typeof ROOMS)[string]['rooms'][number], isBoss: boolean): object {
  const [tw, td] = room.size as [number, number];
  const ground = Array.from({ length: tw * td }, (_, i) => ((i % tw) + Math.floor(i / tw)) % 2 ? 2 : 1);
  const walls = Array<number>(tw * td).fill(0);
  for (const [x, y, kind] of OBSTACLES[id] ?? []) walls[y * tw + x] = TILES.findIndex((t) => t.name === kind) + 1;
  const objects = roomObjects(room, isBoss, MONSTERS).map((o, i) => ({
    id: i + 1, name: o.name, type: '', x: o.x, y: o.y, width: 0, height: 0, rotation: 0, visible: true, point: true,
    ...(o.props ? { properties: Object.entries(o.props).map(([name, value]) => ({ name, type: typeof value === 'number' ? 'int' : 'string', value })) } : {}),
  }));
  const layer = (lid: number, name: string, data: number[]) => ({ id: lid, name, type: 'tilelayer', width: tw, height: td, x: 0, y: 0, opacity: 1, visible: true, data });
  return {
    type: 'map', version: '1.10', tiledversion: '1.10.2', orientation: 'orthogonal', renderorder: 'right-down',
    width: tw, height: td, tilewidth: TILE, tileheight: TILE, infinite: false, nextlayerid: 4, nextobjectid: objects.length + 1,
    tilesets: [{
      firstgid: 1, name: 'floor1', image: '../tilesets/floor1.png', imagewidth: TILE * TILES.length, imageheight: TILE,
      tilewidth: TILE, tileheight: TILE, tilecount: TILES.length, columns: TILES.length, margin: 0, spacing: 0,
      tiles: TILES.flatMap((t, i) => ('kind' in t ? [{ id: i, properties: [{ name: 'kind', type: 'string', value: t.kind }] }] : [])),
    }],
    layers: [
      layer(1, 'ground', ground), layer(2, 'walls', walls),
      { id: 3, name: 'objects', type: 'objectgroup', draworder: 'topdown', x: 0, y: 0, opacity: 1, visible: true, objects },
    ],
  };
}

mkdirSync(join(root, 'maps/tilesets'), { recursive: true });
writeFileSync(join(root, 'maps/tilesets/floor1.png'), tilesetPng());
let made = 0;
const rooms = ROOMS.floor1!.rooms;
rooms.forEach((room, i) => {
  const file = join(root, 'maps', `${room.map}.json`);
  if (existsSync(file) && !force) return;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(mapJson(room.map, room, i === rooms.length - 1), null, 2) + '\n');
  made++;
});
console.log(`map-gen: 타일셋 maps/tilesets/floor1.png, 맵 ${made}개 생성 (있는 맵은 그대로${force ? ', --force로 덮어씀' : ''})`);
