// 카드 창 서버 요청 (hud.md 8장, skills.md 1장): 끼우기·빼기·강화·갈기·변형. 막히는 동작은 shared 카드 검사로 먼저 막고 사유를 알림, 서버 답(거절·갈기·강화 결과)을 알림으로.
// 상태·입력은 stage/islandCards.ts CardPanel (CardOpsHost)
import {
  checkEnhance, checkEnhanceCap, checkEquip, checkGrind, checkVariant, dustOf, enhanceCard, equipLevelOf, isActiveCard, SKILLS, type MVP_WEAPONS,
  type CardKind, type CardLoadout, type CardMsgFail, type Collection,
} from '@game/shared';
import { sfx } from '../audio/player';
import type { IslandConnection } from '../net/islandNet';
import { SK } from '../ui/cardParts';
import type { CardInfo } from '../ui/cardTypes';
import { FAIL_TEXT } from './cardText';

/** 갈기 확인 시간 */
const ARM_MS = 2000;

/** CardOps가 읽는 카드 창 상태 */
export interface CardOpsHost {
  readonly weapon: (typeof MVP_WEAPONS)[number];
  readonly level: number;
  readonly coll: Collection;
  readonly loadout: CardLoadout;
  readonly active: (string | null)[];
  readonly passive: string[];
  readonly busy: boolean;
  readonly sel: string;
  card(id: string): CardInfo;
  say(text: string, color: string): void;
}

export class CardOps {
  /** 갈기 확인 중인 카드 */
  grindArm: string | null = null;
  private grindUntil = 0;
  private seenSeq = 0;
  /** 갈기를 보낸 뒤 서버 답이 오면 보여 줄 알림 */
  private pending: string | null = null;
  /** 강화를 보낸 카드 (서버 답이 오면 번쩍임) */
  private enhancing: string | null = null;

  constructor(private h: CardOpsHost, private conn: IslandConnection) {}

  /** 매 프레임: 서버 답(거절 사유·갈기 결과·강화 결과) 알림, 갈기 확인 끝. 강화가 막 끝난 카드를 돌려줌 (번쩍임) */
  tick(): string | null {
    let done: string | null = null;
    if (this.conn.cardsSeq !== this.seenSeq) {
      this.seenSeq = this.conn.cardsSeq;
      const fail = this.conn.cards.fail, up = this.enhancing;
      if (fail) this.h.say(FAIL_TEXT[fail], SK.danger);
      else if (up && this.h.coll[up]?.enhanced) {
        this.h.say(`${this.h.card(up).name}+ 강화!`, SK.coin);
        sfx.play('card_merge');
        done = up;
      } else if (this.pending) { this.h.say(this.pending, SK.coin); sfx.play('card_grind'); }
      this.pending = this.enhancing = null;
    }
    if (this.grindArm && Date.now() > this.grindUntil) this.grindArm = null;
    return done;
  }

  /** 막혔으면 사유를 보여 주고 true */
  private blocked(fail: CardMsgFail | null, id = this.h.sel): boolean {
    if (!fail) return false;
    this.h.say(fail === 'locked' ? `장착 Lv${equipLevelOf(id)}부터 낄 수 있습니다` : FAIL_TEXT[fail], SK.danger);
    return true;
  }

  private send(kind: CardKind, slot: number, cardId: string | null): void {
    this.conn.send('card', { op: 'equip', weapon: this.h.weapon, kind, slot, cardId });
  }

  private check(kind: CardKind, slot: number, id: string): CardMsgFail | null {
    return this.h.busy ? 'busy' : checkEquip(this.h.weapon, this.h.level, this.h.coll, this.h.loadout, kind, slot, id);
  }

  /** 액티브 끼우기 (보냈으면 true) */
  equipActive(id: string, slot: number): boolean {
    if (!isActiveCard(id) || this.blocked(this.check('active', slot, id), id)) return false;
    if (this.h.active[slot] !== id) this.send('active', slot, id);
    return true;
  }

  /** 패시브 끼우기 (끝에) */
  equipPassive(id: string): void {
    if (this.h.passive.includes(id) || isActiveCard(id)) return;
    const slot = this.h.passive.length;
    if (!this.blocked(this.check('passive', slot, id), id)) this.send('passive', slot, id);
  }

  unequip(id: string): void {
    const k = this.h.active.indexOf(id), j = this.h.passive.indexOf(id);
    if ((k < 0 && j < 0) || this.blocked(this.h.busy ? 'busy' : null)) return;
    if (k >= 0) this.send('active', k, null);
    else this.send('passive', j, null);
  }

  /** 갈기: 남는 장수가 2장 이상이면 모두, 아니면 1장. 두 번 눌러 확인 */
  grind(id: string): void {
    const o = this.h.coll[id], n = o?.enhanced && o.count > 1 ? o.count : 1, equipped = this.h.active.includes(id) || this.h.passive.includes(id);
    if (this.blocked(this.h.busy ? 'busy' : checkGrind(this.h.coll, id, n, equipped))) return;
    if (this.grindArm !== id) {
      this.grindArm = id;
      this.grindUntil = Date.now() + ARM_MS;
      return;
    }
    this.grindArm = null;
    this.pending = `${this.h.card(id).name} ${n}장을 갈아 조각 +${dustOf(id) * n}`;
    this.conn.send('card', { op: 'grind', cardId: id, n });
  }

  /** 강화: 같은 카드 3장 소모 (끼운 패시브면 비용 +1이 한도 안이어야) */
  enhance(id: string): void {
    if (this.blocked(this.h.busy ? 'busy' : checkEnhance(this.h.coll, id))) return;
    if (this.blocked(checkEnhanceCap(this.h.level, enhanceCard(this.h.coll, id), this.h.loadout))) return;
    this.enhancing = id;
    this.conn.send('card', { op: 'enhance', cardId: id });
  }

  /** 변형 고르기 (같은 것을 다시 누르면 기본 동작) */
  variant(i: number): void {
    const id = this.h.sel, key = Object.keys(SKILLS[id]?.variants ?? {})[i];
    if (!key || this.blocked(this.h.busy ? 'busy' : null)) return;
    const variant = this.h.coll[id]?.variant === key ? null : key;
    if (this.blocked(checkVariant(this.h.coll, id, variant))) return;
    this.conn.send('card', { op: 'variant', cardId: id, variant });
  }
}
