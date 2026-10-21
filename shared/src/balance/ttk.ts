// 예상 처치 시간 (docs/balance.md 5장): 혼자, 한 대상씩 친다고 보는 단순 모델
// 초당 딜 = ATK × (평타 계수/초 + Σ 스킬 계수 ÷ 실제 쿨). 실제로 때리는 시간 비율(uptime)로 나눈다
import { basicDps } from '../data/crossCheck';
import type { MonsterDef, Rooms, Skill, Weapon } from '../data/schema';

export interface DpsParts {
  atk: number;
  /** 계수 %/초 */
  basic: number;
  skills: { id: string; perSec: number }[];
  /** 데미지/초 (uptime 적용 전) */
  total: number;
}

/** atk = 숙련도 ATK, cooldownScale = 전역 쿨 배율. 스킬은 쿨마다 바로 쓴다고 본다 (MP는 물약으로 채움) */
export function dpsParts(atk: number, w: Weapon, skills: Skill[], cooldownScale: number): DpsParts {
  const basic = basicDps(w);
  const list = skills.map((s) => ({ id: s.id, perSec: (s.coef ?? 0) / ((s.cooldown ?? 1) * cooldownScale) }));
  const coefPerSec = basic + list.reduce((sum, s) => sum + s.perSec, 0);
  return { atk, basic, skills: list, total: (atk * coefPerSec) / 100 };
}

export const ttk = (hp: number, dps: number, uptime: number): number => hp / (dps * uptime);

export interface RoomTtk {
  id: string;
  name: string;
  waves: number;
  /** 방에 boss가 있으면 boss 기준 시간과 목표 */
  boss: boolean;
  sec: number;
}

/** 방 = 모든 웨이브 몬스터 체력 합을 차례로. 몬스터 rank에 맞는 uptime을 쓴다 */
export function roomTtks(rooms: Rooms, monsters: Record<string, MonsterDef>, dps: number, uptime: { normal: number; boss: number }): RoomTtk[] {
  return Object.values(rooms).flatMap((f) => f.rooms.map((r) => {
    let sec = 0, boss = false;
    for (const wave of r.waves) for (const [id, n] of Object.entries(wave.monsters)) {
      const m = monsters[id]!;
      if (m.rank === 'boss') boss = true;
      sec += n * ttk(m.hp, dps, m.rank === 'boss' ? uptime.boss : uptime.normal);
    }
    return { id: r.id, name: r.name, waves: r.waves.length, boss, sec };
  }));
}
