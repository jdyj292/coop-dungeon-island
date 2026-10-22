// 실행: pnpm run-sim [--party 1] [--runs 5] [--invincible] — 봇으로 1층 한 판을 서버 규칙 그대로 돌려 시간·클리어율 보고 (roadmap 3-9)
// 봇은 사람보다 단순해서 시간은 참고값. 규칙이 끝까지 막힘없이 도는지(진행 불가·보스 클리어)는 확실히 확인한다
// --invincible: 봇 HP를 매 틱 채움 (봇 실력과 상관없이 끝까지 돌려 시간·받은 피해를 본다)
import { parseArgs } from 'node:util';
import { runOnce, type RunLog } from './run';

const { values } = parseArgs({
  options: { party: { type: 'string', default: '1' }, runs: { type: 'string', default: '5' }, invincible: { type: 'boolean', default: false } },
});
const party = Math.min(4, Math.max(1, Number(values.party))), runs = Math.max(1, Number(values.runs));
const m = (sec: number) => `${Math.floor(sec / 60)}분 ${String(Math.round(sec % 60)).padStart(2, '0')}초`;

const logs: RunLog[] = [];
for (let i = 0; i < runs; i++) {
  const r = runOnce(party, 1000 + i, values.invincible);
  logs.push(r);
  console.log(`#${i + 1} ${r.result.padEnd(7)} ${m(r.sec)}  피해 ${r.damageTaken} · 쓰러짐 ${r.downs} · 코인 ${r.coins} · 경험치 ${r.exp}`);
}
console.log(`\n[방별 평균 (${party}인, ${runs}판${values.invincible ? ', 무적' : ''})]  전투 = 입장~클리어, 이동 = 클리어~다음 방`);
const ids = [...new Set(logs.flatMap((l) => l.rooms.map((x) => x.id)))];
for (const id of ids) {
  const all = logs.map((l) => l.rooms.find((x) => x.id === id)).filter((x) => x !== undefined);
  // 봇 막힘(5분 넘어 개발 명령으로 넘긴 방)은 평균에서 뺀다
  const rs = all.filter((x) => !x.stuck), stuck = all.length - rs.length;
  const avg = (k: 'fight' | 'walk') => (rs.length ? rs.reduce((s, x) => s + x[k], 0) / rs.length : NaN);
  console.log(`  ${id.padEnd(8)} 전투 ${avg('fight').toFixed(1).padStart(6)}초  이동 ${avg('walk').toFixed(1).padStart(5)}초  (${rs.length}판${stuck ? `, 봇 막힘 ${stuck}판 제외` : ''})`);
}
const clears = logs.filter((l) => l.result === 'clear');
const avgSec = clears.reduce((s, l) => s + l.sec, 0) / Math.max(1, clears.length);
console.log(`\n클리어 ${clears.length}/${runs}판, 클리어 평균 ${clears.length ? m(avgSec) : '-'} (목표 11~13분, dungeon.md 5장)`);
// 봇 막힘을 뺀 방별 평균을 더한 한 판 추정 (막힌 방이 하나라도 평균이 없으면 추정하지 않음)
const est = ids.map((id) => {
  const rs = logs.map((l) => l.rooms.find((x) => x.id === id)).filter((x) => x !== undefined && !x.stuck);
  return rs.length ? rs.reduce((s, x) => s + x!.fight + x!.walk, 0) / rs.length : NaN;
}).reduce((a, b) => a + b, 0);
console.log(`봇 막힘을 뺀 한 판 추정: ${Number.isNaN(est) ? '- (모든 판에서 막힌 방이 있음)' : m(est)}`);
