// 섬 패널 글자 (hud.md 8장 패널): 게시판 기록 한 줄, 몇 분 전, 품목·무기 이름
import { CARDS, facilityName, ITEMS, PASSIVES, SKILLS, WEAPONS } from '@game/shared';

const VERB: Record<string, string> = {
  found: '섬을 만듦', 'dungeon:clear': '1층 클리어', 'dungeon:return': '1층에서 귀환', 'dungeon:wipe': '1층 전멸', join: '섬에 들어옴', invite: '초대 코드를 바꿈', place: '놓음', move: '옮김', remove: '치움', buy: '삼', treasury: '금고로 삼',
};

/** 무기 이름 (우물 대기 줄·가방 장비 탭) */
export const weaponName = (id = 'greatsword') => WEAPONS[id]?.name ?? id;

/** 장식·소모품·재료·시설 이름 */
export const itemName = (id: string | null) => (id ? ITEMS.decorations[id]?.name ?? ITEMS.consumables[id]?.name ?? ITEMS.materials[id]?.name ?? facilityName(id) ?? id : '');

/** 기록 한 줄 (card = 티어 3 이상 뽑음, island.md 5장) */
export const logText = (action: string, id: string | null): string => (action === 'card' && id
  ? `${weaponName(CARDS[id]?.weapon)} 카드 '${SKILLS[id]?.name ?? PASSIVES[id]?.name ?? id}'을 뽑음` : `${id ? `${itemName(id)} ` : ''}${VERB[action] ?? action}`);

/** 몇 분 전 */
export function ago(at: number, now: number): string {
  const m = Math.floor((now - at) / 60_000);
  if (m < 1) return '방금';
  if (m < 60) return `${m}분 전`;
  return m < 1440 ? `${Math.floor(m / 60)}시간 전` : `${Math.floor(m / 1440)}일 전`;
}
