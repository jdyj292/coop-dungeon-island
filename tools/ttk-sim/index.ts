// 실행: pnpm ttk-sim [--weapon greatsword] [--level 1] [--skills gs_launch,gs_earthsplit]
// 몬스터·방·보스 예상 처치 시간 (docs/balance.md 5장). 가정은 rules.json, 스킬 기본값 = 무기 baseSkills
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dpsParts, roomTtks, ttk } from '../../shared/src/balance/ttk';
import { COMBAT, MONSTERS, ROOMS, SKILLS, WEAPONS } from '../../shared/src/data/load';
import { atkFor } from '../../shared/src/hit';

const here = dirname(fileURLToPath(import.meta.url));
const rules = JSON.parse(readFileSync(join(here, 'rules.json'), 'utf8')) as {
  uptime: { normal: number; boss: number };
  targets: Record<'monster' | 'room' | 'roomOneWave' | 'boss', [number, number]>;
};
const { values } = parseArgs({ options: { weapon: { type: 'string', default: 'greatsword' }, level: { type: 'string', default: '1' }, skills: { type: 'string' } } });

const weapon = WEAPONS[values.weapon!];
if (!weapon) throw new Error(`무기 없음: ${values.weapon} (${Object.keys(WEAPONS).join(', ')})`);
const skillIds = values.skills ? values.skills.split(',').filter(Boolean) : weapon.baseSkills;
const skills = skillIds.map((id) => SKILLS[id] ?? (() => { throw new Error(`스킬 없음: ${id}`); })());
const level = Number(values.level);
const d = dpsParts(atkFor(level), weapon, skills, COMBAT.cooldownScale);

let off = 0;
const judge = (sec: number, [lo, hi]: [number, number]) => {
  if (sec >= lo && sec <= hi) return '목표 안';
  off++;
  return sec < lo ? `빠름 (목표 ${lo}~${hi}초)` : `느림 (목표 ${lo}~${hi}초)`;
};
const s1 = (n: number) => n.toFixed(1);

console.log(`${weapon.name} · 숙련도 Lv${level} · ATK ${d.atk} · 스킬 ${skillIds.join(', ') || '없음'}`);
console.log(`초당 계수: 평타 ${Math.round(d.basic)}%${d.skills.map((s) => ` + ${s.id} ${Math.round(s.perSec)}%`).join('')} → 초당 딜 ${s1(d.total)}`);
console.log(`때리는 시간 비율: 일반 ${rules.uptime.normal * 100}% / 보스 ${rules.uptime.boss * 100}%\n`);

console.log('[몬스터 1마리]');
for (const [id, m] of Object.entries(MONSTERS)) {
  const boss = m.rank === 'boss';
  const sec = ttk(m.hp, d.total, boss ? rules.uptime.boss : rules.uptime.normal);
  const verdict = boss ? judge(sec, rules.targets.boss) : m.rank === 'normal' ? judge(sec, rules.targets.monster) : '정예 (목표 없음)';
  console.log(`  ${m.name.padEnd(8)} 체력 ${String(m.hp).padStart(5)}  ${s1(sec).padStart(6)}초  ${verdict}`);
}

console.log('\n[방 클리어 (전투 시간만, 이동·대기 제외)]');
for (const r of roomTtks(ROOMS, MONSTERS, d.total, rules.uptime)) {
  const target = r.boss ? rules.targets.boss : r.waves === 1 ? rules.targets.roomOneWave : rules.targets.room;
  console.log(`  ${r.id} ${r.name.padEnd(8)} 웨이브 ${r.waves}  ${s1(r.sec).padStart(6)}초  ${judge(r.sec, target)}`);
}
console.log(off ? `\n목표 밖 ${off}건` : '\n모두 목표 안');
