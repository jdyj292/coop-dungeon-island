// 실행: pnpm palette-check
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkPalette, type Rules } from './check';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const readJson = (path: string) => JSON.parse(readFileSync(join(root, path), 'utf8'));

// 팔레트 경로를 가리키는 재질: 공용 + 몬스터별 (몬스터 프레임 격자는 빼고 재질만)
type MonsterMats = { materials?: object; fixedExtra?: object };
const monsters = readJson('client/data/sprites/monsters.json') as Record<string, MonsterMats>;
const refs = {
  common: readJson('client/data/sprites/materials.json'),
  monsters: Object.fromEntries(
    Object.entries(monsters)
      .filter(([id]) => !id.startsWith('_'))
      .map(([id, m]) => [id, { materials: m.materials, fixedExtra: m.fixedExtra }]),
  ),
};

const issues = checkPalette(
  readJson('client/data/palette.json'),
  readJson('tools/palette-check/rules.json') as Rules,
  refs,
);

const errors = issues.filter((i) => i.level === 'error');
const warns = issues.filter((i) => i.level === 'warn');
for (const i of warns) console.log(`  경고  ${i.path}: ${i.message}`);
for (const i of errors) console.log(`  오류  ${i.path}: ${i.message}`);
console.log(`\npalette-check: 오류 ${errors.length}건, 경고 ${warns.length}건 (경고는 MVP 밖 층)`);
process.exit(errors.length ? 1 : 0);
