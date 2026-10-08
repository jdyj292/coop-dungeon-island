// 실행: pnpm palette-check
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkPalette, type Rules } from './check';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const readJson = (path: string) => JSON.parse(readFileSync(join(root, path), 'utf8'));

const issues = checkPalette(
  readJson('client/data/palette.json'),
  readJson('tools/palette-check/rules.json') as Rules,
  readJson('client/data/sprites/materials.json'),
);

const errors = issues.filter((i) => i.level === 'error');
const warns = issues.filter((i) => i.level === 'warn');
for (const i of warns) console.log(`  경고  ${i.path}: ${i.message}`);
for (const i of errors) console.log(`  오류  ${i.path}: ${i.message}`);
console.log(`\npalette-check: 오류 ${errors.length}건, 경고 ${warns.length}건 (경고는 MVP 밖 층)`);
process.exit(errors.length ? 1 : 0);
