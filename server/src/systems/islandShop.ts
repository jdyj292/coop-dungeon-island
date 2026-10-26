// 섬 잡화점·게시판·채팅 (docs/island.md 5·8장, hud.md 4장): 구매(트랜잭션) → 지갑(me)·가방(inv)·금고(상태)·공용 창고(상태)
// 게시판은 열 때 요청 → 기록·메모를 그 사람에게. 채팅·이모트는 섬에 있는 주민 모두에게 (저장 안 함). 외형은 저장 + 주민 상태
import { parseC2S } from '@game/shared';
import { ShopStore } from '../db/shopStore';
import type { IslandState } from '../schema/IslandState';

export interface ShopOut {
  send: (userId: string, type: string, msg: unknown) => void;
  broadcast: (type: string, msg: unknown) => void;
}

export interface ShopHooks {
  /** 가방이 바뀜 (inv 다시 보내기) */
  inventoryChanged: (userId: string) => void;
  /** 공용 창고가 바뀜 */
  storageChanged: () => void;
}

export class IslandShop {
  constructor(private store: ShopStore, private state: IslandState, private out: ShopOut, private hooks: ShopHooks, private dev: boolean) {
    state.treasury = store.treasury();
  }

  /** 본인 값 (입장·지갑이 바뀔 때) */
  sendMe(userId: string): void {
    this.out.send(userId, 'me', { wallet: this.store.wallet(Number(userId)), level: this.store.level(Number(userId)) });
  }

  /** 처리했으면 true */
  onMessage(userId: string, type: string, raw: unknown, now: number): boolean {
    const uid = Number(userId);
    switch (type) {
      case 'buy': {
        const m = parseC2S('buy', raw);
        if (!m) return true;
        const r = this.store.buy(uid, m.itemId, m.count, now);
        this.state.treasury = r.treasury;
        this.out.send(userId, 'buyResult', { ok: r.ok, itemId: m.itemId, count: m.count, ...(r.reason ? { reason: r.reason } : {}) });
        if (r.ok) {
          this.sendMe(userId);
          if (ShopStore.price(m.itemId)?.communal) this.hooks.storageChanged();
          else this.hooks.inventoryChanged(userId);
        }
        return true;
      }
      case 'board':
        if (parseC2S('board', raw)) this.out.send(userId, 'board', this.store.board());
        return true;
      case 'memo': {
        const m = parseC2S('memo', raw);
        if (m) {
          this.store.addMemo(uid, m.text, now);
          this.out.send(userId, 'board', this.store.board());
        }
        return true;
      }
      case 'chat': {
        const m = parseC2S('chat', raw);
        if (m) this.out.broadcast('chat', { player: userId, text: m.text, t: now });
        return true;
      }
      case 'look': {
        const m = parseC2S('look', raw), r = this.state.residents.get(userId);
        if (m && r) {
          this.store.setLook(uid, m.hair, m.hairColor);
          Object.assign(r, { hair: m.hair, hairColor: m.hairColor });
        }
        return true;
      }
      case 'emote': {
        const m = parseC2S('emote', raw);
        if (m) this.out.broadcast('emote', { player: userId, id: m.id });
        return true;
      }
      case 'giveCoins': {
        const m = parseC2S('giveCoins', raw);
        if (m && this.dev) {
          this.store.giveCoins(uid, m.to, m.amount);
          this.state.treasury = this.store.treasury();
          this.sendMe(userId);
        }
        return true;
      }
    }
    return false;
  }
}
