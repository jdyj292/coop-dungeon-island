// 플레이어 피격·다운·기상·쓰러짐, HP·MP·물약 (docs/combat.md 4장, docs/balance.md 5·6장, docs/dungeon.md 3장 쓰러짐)
import { newFighter, type Strength } from './actions';
import { PLAYER } from './data/load';
import type { PlayerState } from './player';

export type HurtEvent = 'stun' | 'down' | 'getup' | 'revive' | 'wipe';
export type PotionKind = 'hp' | 'mp';

/** 최대 HP = base × (1 + perLevel × (숙련도 - 1)) */
export const maxHpFor = (level: number): number => Math.round(PLAYER.hp.base * (1 + PLAYER.hp.perLevel * (level - 1)));

export interface Vitals {
  hp: number;
  maxHp: number;
  mp: number;
  potions: Record<PotionKind, number>;
  potionCd: Record<PotionKind, number>;
  /** 경직(stun)·다운(down) 남은 시간 */
  hurt: { kind: 'stun' | 'down'; left: number } | null;
  /** 기상·부활 무적 남은 시간 */
  invuln: number;
  /** 부활의 깃털 (솔로, 판마다 지급) */
  feathers: number;
  /** 깃털 없이 HP 0 → 전멸 */
  downed: boolean;
  /** 필살기 게이지 0~max (balance.md 8장). 필살기 발동은 아직 없음 */
  ult: number;
}

export function newVitals(level = 1): Vitals {
  const maxHp = maxHpFor(level), pt = PLAYER.potions;
  return {
    hp: maxHp, maxHp, mp: PLAYER.mp.max, potions: { hp: pt.hp.carry, mp: pt.mp.carry }, potionCd: { hp: 0, mp: 0 },
    hurt: null, invuln: 0, feathers: PLAYER.revive.feathers, downed: false, ult: 0,
  };
}

/** 맞지 않는 상태: 백스텝 앞부분, 기상·부활 무적, 다운 중(downhit 없음), 쓰러짐 */
export function isInvulnerable(p: PlayerState): boolean {
  return (!!p.backstep && p.backstep.t < PLAYER.backstep.invuln) || p.invuln > 0 || p.hurt?.kind === 'down' || p.downed;
}

/** 몬스터 공격 적중. 약·중 → 경직, 강 → 다운. 하던 행동은 끊긴다 */
export function hurtPlayer(p: PlayerState, damage: number, strength: Strength = 'light'): HurtEvent[] {
  if (isInvulnerable(p)) return [];
  p.hp = Math.max(0, p.hp - damage);
  p.fighter = newFighter();
  p.backstep = null;
  p.run.running = false;
  if (p.hp === 0) {
    p.hurt = null;
    if (p.feathers > 0) {
      // 부활의 깃털 자동 사용: HP 50% + 2초 무적
      p.feathers--;
      p.hp = Math.round(p.maxHp * PLAYER.revive.hpRatio);
      p.invuln = PLAYER.revive.invuln;
      return ['revive'];
    }
    p.downed = true;
    return ['wipe'];
  }
  const h = PLAYER.hurt;
  p.hurt = strength === 'heavy' ? { kind: 'down', left: h.downSec } : { kind: 'stun', left: h.stunSec };
  return [p.hurt.kind];
}

/** 한 틱: MP 자연 회복, 물약 쿨, 무적·경직·다운 시간. 다운이 끝나면 기상 무적 */
export function stepVitals(p: PlayerState, dt: number): HurtEvent[] {
  if (p.downed) return [];
  p.mp = Math.min(PLAYER.mp.max, p.mp + PLAYER.mp.regen * dt);
  p.potionCd.hp = Math.max(0, p.potionCd.hp - dt);
  p.potionCd.mp = Math.max(0, p.potionCd.mp - dt);
  p.invuln = Math.max(0, p.invuln - dt);
  if (!p.hurt) return [];
  p.hurt.left -= dt;
  if (p.hurt.left > 0) return [];
  const wasDown = p.hurt.kind === 'down';
  p.hurt = null;
  if (!wasDown) return [];
  p.invuln = PLAYER.hurt.getupInvuln;
  return ['getup'];
}

/** 물약: 개수·쿨 확인 후 즉시 회복. 다운·쓰러짐 중에는 불가 */
export function usePotion(p: PlayerState, kind: PotionKind): boolean {
  if (p.downed || p.hurt?.kind === 'down' || p.potions[kind] <= 0 || p.potionCd[kind] > 0) return false;
  const pt = PLAYER.potions;
  if (kind === 'hp') p.hp = Math.min(p.maxHp, p.hp + Math.round(p.maxHp * pt.hp.heal));
  else p.mp = Math.min(PLAYER.mp.max, p.mp + pt.mp.amount);
  p.potions[kind]--;
  p.potionCd[kind] = pt[kind].cooldown;
  return true;
}

/** 동료 부활 (combat.md 4장): 쓰러진 사람을 HP partyHpRatio로 일으키고 깃털 부활과 같은 무적 */
export function revivePlayer(p: PlayerState): boolean {
  if (!p.downed) return false;
  p.downed = false;
  p.hurt = null;
  p.hp = Math.round(p.maxHp * PLAYER.revive.partyHpRatio);
  p.invuln = PLAYER.revive.invuln;
  return true;
}

/** 숙련도 레벨 n → n+1 필요 경험치 = expBase × n^expPow (반올림, balance.md 7장) */
export const expToNext = (level: number): number => Math.round(PLAYER.level.expBase * level ** PLAYER.level.expPow);

/** 레벨 level에서 경험치 exp를 얻은 뒤 레벨과 남은 경험치 */
export function addExp(level: number, carry: number, exp: number): { level: number; exp: number } {
  let lv = level, e = carry + exp;
  while (lv < MAX_LEVEL && e >= expToNext(lv)) e -= expToNext(lv++);
  return { level: lv, exp: e };
}
const MAX_LEVEL = 20;

/** 필살기 게이지: 적중 1회 onHit, 피격 1회 onHurt (balance.md 8장) */
export function gainUlt(p: PlayerState, amount: number): void {
  p.ult = Math.min(PLAYER.ultimate.max, p.ult + amount);
}

/** 평타·스킬 적중 1회당 MP 회복 */
export function gainMpOnHit(p: PlayerState): void {
  p.mp = Math.min(PLAYER.mp.max, p.mp + PLAYER.mp.onHit);
}
