// 실행: pnpm balance-check — skills.json 스킬 예산 검사 (docs/balance.md 3장). 기준 rules.json
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSkill, type BudgetRules } from '../../shared/src/balance/budget';
import { SKILLS } from '../../shared/src/data/load';

const here = dirname(fileURLToPath(import.meta.url));
const rules = JSON.parse(readFileSync(join(here, 'rules.json'), 'utf8')) as BudgetRules;

const pct = (n: number) => `${n >= 0 ? '+' : ''}${Math.round(n * 100)}%`;
let fails = 0;
for (const s of Object.values(SKILLS)) {
  const r = checkSkill(s, rules);
  const mark = r.ok ? '통과' : r.noted ? '기록됨' : '경고';
  if (!r.ok && !r.noted) fails++;
  const why = r.factors.length ? r.factors.map((f) => `${f}×${rules.factors[f as keyof BudgetRules['factors']]}`).join(' ') : '보정 없음';
  console.log(`${mark.padEnd(4)} ${s.id.padEnd(14)} ${s.name}  실제 ${r.coef} / 예산 ${Math.round(r.budget)} (${pct(r.diff)})  쿨 ${s.cooldown}초 · ${why}`);
  if (r.noted) console.log(`     note: ${s.note}`);
}
console.log(fails ? `\n경고 ${fails}건: 계수를 고치거나 skills.json note에 이유를 적는다` : '\n모든 스킬 통과 (±' + rules.tolerance * 100 + '% 또는 note)');
process.exit(fails ? 1 : 0);
