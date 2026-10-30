// shared/data 로더: 스키마로 검사한 뒤 원본 객체를 그대로 타입만 붙여 내보낸다
// (복사하지 않으므로 tools/motion-preview가 메모리에서 바꾼 값이 게임 코드에 바로 반영된다)
import type { z } from 'zod';
import combatJson from '../../data/combat.json';
import islandJson from '../../data/island.json';
import itemsJson from '../../data/items.json';
import passivesJson from '../../data/passives.json';
import monstersJson from '../../data/monsters.json';
import playerJson from '../../data/player.json';
import roomsJson from '../../data/rooms.json';
import skillsJson from '../../data/skills.json';
import weaponsJson from '../../data/weapons.json';
import { FILE_SCHEMAS, formatIssues, withoutNotes } from './schema';

type Files = typeof FILE_SCHEMAS;

/** 검사 실패 시 파일 이름과 경로를 붙여 오류 */
function load<K extends keyof Files>(file: K, json: object): z.infer<Files[K]['schema']> {
  const { schema, notes } = FILE_SCHEMAS[file];
  const value = notes ? withoutNotes(json) : json;
  const issues = formatIssues(value, schema);
  if (issues.length) {
    throw new Error(`shared/data/${file} 형식 오류\n${issues.map((i) => `  ${i.path}: ${i.message}`).join('\n')}`);
  }
  return value as z.infer<Files[K]['schema']>;
}

export const WEAPONS = load('weapons.json', weaponsJson);
export const SKILLS = load('skills.json', skillsJson);
export const PASSIVES = load('passives.json', passivesJson);
export const MONSTERS = load('monsters.json', monstersJson);
export const ROOMS = load('rooms.json', roomsJson);
export const PLAYER = load('player.json', playerJson);
export const COMBAT = load('combat.json', combatJson);
export const ISLAND = load('island.json', islandJson);
export const ITEMS = load('items.json', itemsJson);
