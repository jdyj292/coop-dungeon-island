// 실행: pnpm data-validate — shared/data 형식(zod) + 교차 참조 + 맵 검사 (docs/data.md 5장)
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crossCheck, type GameData, type Issue, type Rules } from '../../shared/src/data/crossCheck';
import { FILE_SCHEMAS, formatIssues, withoutNotes, type IslandDef, type ItemsDef, type MonsterDef, type Rooms } from '../../shared/src/data/schema';
import { checkMaps } from '../../shared/src/map/check';
import { roomMap } from '../../shared/src/map/maps';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const readJson = (path: string) => JSON.parse(readFileSync(join(root, path), 'utf8'));

// 1. 파일별 형식
const issues: Issue[] = [];
const data: Record<string, unknown> = {};
for (const [name, { schema, notes }] of Object.entries(FILE_SCHEMAS)) {
  const raw = readJson(`shared/data/${name}`);
  const value = notes ? withoutNotes(raw) : raw;
  for (const i of formatIssues(value, schema)) issues.push({ level: 'error', where: `${name} ${i.path}`, message: i.message });
  data[name.replace('.json', '')] = value;
}

// 2. 교차 참조 (형식이 맞을 때만). 그림 데이터는 이름(키)만 뽑는다
if (!issues.length) {
  const poses = withoutNotes(readJson('client/data/sprites/poses.json')) as Record<string, object>;
  delete poses.walk;
  const refs = {
    poseSets: Object.fromEntries(Object.entries(poses).map(([k, v]) => [k, Object.keys(v)])),
    visuals: Object.keys(readJson('client/data/sprites/weapons_visual.json').profiles),
    sprites: Object.keys(withoutNotes(readJson('client/data/sprites/monsters.json'))),
    sounds: ['action', 'clear'].flatMap((bus) => Object.keys(readJson('client/data/sfx.json')[bus])),
  };
  issues.push(...crossCheck(data as unknown as GameData, refs, readJson('tools/data-validate/rules.json') as Rules));
  // 3. 맵 (maps/*.json, 위치·장애물)
  issues.push(...checkMaps(data.rooms as Rooms, data.monsters as Record<string, MonsterDef>, roomMap));
  // 4. 섬: 시설·배경 그림 id가 client/data/sprites/island.json에 있는지, 칸이 격자 안인지
  const isl = data.island as IslandDef, sprites = new Set(Object.keys(withoutNotes(readJson('client/data/sprites/island.json'))));
  for (const o of [...isl.facilities, ...isl.scenery]) {
    if (!sprites.has(o.id)) issues.push({ level: 'error', where: `island.json ${o.id}`, message: '섬 사물 그림(client/data/sprites/island.json)에 없음' });
  }
  // 장식: 그림이 있는지 (돌길처럼 바닥 무늬는 빼고), 가입 선물은 있는 장식만
  const itemsData = data.items as ItemsDef;
  for (const [id, d] of Object.entries(itemsData.decorations)) {
    if (!d.ground && !sprites.has(id)) issues.push({ level: 'error', where: `items.json ${id}`, message: '섬 사물 그림(client/data/sprites/island.json)에 없음' });
  }
  for (const id of Object.keys(itemsData.starter)) {
    if (!itemsData.decorations[id]) issues.push({ level: 'error', where: `items.json starter.${id}`, message: '없는 장식' });
  }
  for (const r of [isl.walk, isl.place, ...isl.facilities, ...isl.paths]) {
    if (r.x + r.w > isl.grid.w || r.y + r.h > isl.grid.h - isl.shoreRows) issues.push({ level: 'error', where: `island.json (${r.x},${r.y})`, message: '섬 격자(물가 제외) 밖' });
  }
}

const errors = issues.filter((i) => i.level === 'error');
const warns = issues.filter((i) => i.level === 'warn');
for (const i of warns) console.log(`  경고  ${i.where}: ${i.message}`);
for (const i of errors) console.log(`  오류  ${i.where}: ${i.message}`);
console.log(`\ndata-validate: 오류 ${errors.length}건, 경고 ${warns.length}건`);
process.exit(errors.length ? 1 : 0);
