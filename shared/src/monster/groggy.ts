// 보스 졸음(그로기) 연장 (docs/dungeon.md 3장 "협동 기믹의 솔로 대체"): 졸음 중 파티는 서로 다른 2명 이상이 때리면,
// 솔로는 한 사람이 15히트를 채우면 졸음 +by초 (최대 max번). 조건은 데이터 monsters.json groggy.extend 문자열
import { z } from 'zod';
import type { Monster } from './state';

const extendSchema = z.object({ by: z.number().positive(), max: z.number().int().positive(), party: z.string(), solo: z.string() });

/** "hitsFromDistinctPlayers>=2" · "hitsBySinglePlayer>=15" */
function met(rule: string, hits: Record<string, number>): boolean {
  const r = /^(hitsFromDistinctPlayers|hitsBySinglePlayer)>=(\d+)$/.exec(rule);
  if (!r) throw new Error(`알 수 없는 졸음 연장 조건: ${rule}`);
  const counts = Object.values(hits);
  const v = r[1] === 'hitsFromDistinctPlayers' ? counts.length : Math.max(0, ...counts);
  return v >= Number(r[2]);
}

/** 졸음에 들어갈 때 기록을 비운다 */
export function enterGroggy(m: Monster, duration: number): void {
  Object.assign(m, { mode: 'groggy', timer: duration, groggyHits: {}, groggyExtended: 0 });
}

/** 졸음 중 적중 1회 기록. 조건을 채워 늘어났으면 true */
export function recordGroggyHit(m: Monster, pid: string, party: boolean): boolean {
  if (m.mode !== 'groggy' || !m.def.groggy?.extend) return false;
  const ext = extendSchema.parse(m.def.groggy.extend);
  const hits = (m.groggyHits ??= {});
  hits[pid] = (hits[pid] ?? 0) + 1;
  if ((m.groggyExtended ?? 0) >= ext.max || !met(party ? ext.party : ext.solo, hits)) return false;
  m.timer += ext.by;
  m.groggyExtended = (m.groggyExtended ?? 0) + 1;
  m.groggyHits = {};
  return true;
}
