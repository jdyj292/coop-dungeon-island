// 섬 스킬 카드 (docs/skills.md 1장, network.md 4장 card): 팩 사서 열기·지정 구매·강화·갈기·변형·장착 → 결과 cards (팩은 pack 먼저)
// 출발 카운트다운 중인 대기자는 장착만 막음 (파티 빌드가 이미 정해짐). 던전에서는 섬 방에 없으니 저절로 못 바꿈
import { parseC2S, type CardMsgFail, type Rng } from '@game/shared';
import { openPack } from '../db/cardPack';
import { cardsView, craftCard, enhance, equipSlot, grindCard, setVariant } from '../db/cardStore';
import type { Db } from '../db/client';
import type { IslandState } from '../schema/IslandState';
import type { ShopOut } from './islandShop';

export class IslandCards {
  constructor(private db: Db, private islandId: number, private state: IslandState, private out: ShopOut, private hooks: { walletChanged: (userId: string) => void }, private rng: Rng = Math.random) {}

  /** 내 카드 (입장·바꿀 때). fail = 방금 요청이 안 된 사유 */
  send(userId: string, fail?: CardMsgFail | null): void {
    this.out.send(userId, 'cards', { ...cardsView(this.db, Number(userId)), ...(fail ? { fail } : {}) });
  }

  /** card 메시지 */
  onMessage(userId: string, raw: unknown, now: number): void {
    const m = parseC2S('card', raw), uid = Number(userId);
    if (!m) return;
    switch (m.op) {
      case 'open': {
        const r = openPack(this.db, uid, this.islandId, m.weapon, m.pack, m.pay, now, this.rng);
        if ('fail' in r) return this.send(userId, r.fail);
        this.out.send(userId, 'pack', r.pack);
        if (m.pay === 'coin') this.hooks.walletChanged(userId);
        return this.send(userId);
      }
      case 'craft':
        return this.send(userId, craftCard(this.db, uid, m.cardId));
      case 'enhance': {
        // 패시브 비용이 바뀌므로 출발 카운트다운 중에는 장착처럼 막음
        const w = this.state.well;
        if (w.departAt && w.members.includes(userId)) return this.send(userId, 'busy');
        return this.send(userId, enhance(this.db, uid, m.cardId));
      }
      case 'grind':
        return this.send(userId, grindCard(this.db, uid, m.cardId, m.n));
      case 'variant':
        return this.send(userId, setVariant(this.db, uid, m.cardId, m.variant));
      case 'equip': {
        const w = this.state.well;
        if (w.departAt && w.members.includes(userId)) return this.send(userId, 'busy');
        return this.send(userId, equipSlot(this.db, uid, m.weapon, m.kind, m.slot, m.cardId));
      }
    }
  }
}
