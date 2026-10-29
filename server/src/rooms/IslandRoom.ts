import type { IncomingMessage } from 'node:http';
import { matchMaker, Room, type Client } from 'colyseus';
import { AUTH, FixedStep, LOOK, NET, TICK, type MeRes } from '@game/shared';
import { CONFIG } from '../config';
import { loadIsland } from '../db/islandQueries';
import { IslandStore } from '../db/islandStore';
import { carryPotions, mastery } from '../db/runStore';
import { ShopStore } from '../db/shopStore';
import { SESSION_COOKIE } from '../http/routes';
import { IslandState } from '../schema/IslandState';
import { readCookie, services } from '../services';
import type { PartyMember } from '../systems/gameTypes';
import { islandBus } from '../systems/islandBus';
import { IslandGame } from '../systems/islandGame';

const KICK_CODE = 4001;
/** 같은 계정이 새로 접속해 기존 연결을 끊을 때 (network.md 3장) */
export const REPLACED_CODE = 4002;

/**
 * 섬 방: 섬마다 하나 (filterBy islandId). 입장은 세션 쿠키로 인증하고 그 섬 주민만 (security.md 2장, network.md 3장)
 * 진행은 IslandGame, 여기는 연결·전송만. 60Hz 이동, 20Hz 상태 전송
 */
export class IslandRoom extends Room<IslandState> {
  maxClients = AUTH.islandResidents;
  private game!: IslandGame;
  private ticks = new FixedStep();
  private islandId = 0;
  private unwatch: (() => void)[] = [];

  onCreate(options: { islandId?: unknown }): void {
    this.islandId = Number(options?.islandId);
    const row = loadIsland(services().db, this.islandId);
    if (!row) throw new Error(`섬 ${this.islandId} 없음`);
    this.game = new IslandGame(row.name, row.treasury, row.residents.map((r, i) => ({ id: String(r.id), name: r.nickname, color: i % LOOK.playerColors, hair: r.hairStyle, hairColor: r.hairColor, weapon: r.weapon })), {
      send: (id, type, msg) => this.clientOf(id)?.send(type, msg),
      broadcast: (type, msg) => this.broadcast(type, msg),
    }, {
      store: new IslandStore(services().db, this.islandId), shopStore: new ShopStore(services().db, this.islandId),
      dev: !CONFIG.production,
      onDepart: (ids, floor) => void this.depart(ids, floor),
    });
    // 던전에서 돌아옴 (정산 저장 뒤, DungeonRoom)
    this.unwatch.push(islandBus.watch(this.islandId, (e) => { if (!e.floor) this.game.returned(e.userIds); }));
    // 입장 신청 → 섬 주인에게 알림 (허용·거절은 게시판 주민 탭, island.md 7장)
    this.unwatch.push(islandBus.watchRequests(this.islandId, (nickname) => {
      const owner = services().accounts.islands.ownerOf(this.islandId);
      if (owner !== null) this.clientOf(String(owner))?.send('joinRequest', { nickname });
    }));
    // 허용된 새 주민: 접속 전에도 주민 목록(게시판 주민 탭·N/10)에 보이게
    this.unwatch.push(islandBus.watchJoined(this.islandId, (userId) => {
      const me = services().accounts.me(userId);
      if (me) this.addResident(me);
    }));
    this.setState(this.game.state);
    this.setPatchRate(1000 / NET.patchRate);
    this.setSimulationInterval((ms) => {
      for (let n = this.ticks.advance(ms / 1000); n > 0; n--) this.game.tick();
    }, TICK * 1000);
    for (const type of ['input', 'ping', 'place', 'move', 'remove', 'give', 'giveCoins', 'buy', 'board', 'memo', 'chat', 'emote', 'look', 'weapon', 'well']) {
      this.onMessage(type, (client, raw) => {
        if (this.game.onMessage(this.userOf(client), type, raw) === 'kick') client.leave(KICK_CODE);
      });
    }
  }

  /** 세션 쿠키 → 계정. 이 섬 주민이 아니면 거절 */
  onAuth(_client: Client, _options: unknown, request?: IncomingMessage): MeRes {
    const { accounts } = services();
    const userId = accounts.sessions.user(readCookie(request?.headers.cookie, SESSION_COOKIE), Date.now());
    const me = userId === null ? null : accounts.me(userId);
    if (!me) throw new Error('unauthorized');
    if (me.island?.id !== this.islandId) throw new Error('forbidden');
    return me;
  }

  onJoin(client: Client, _options?: unknown, me?: MeRes): void {
    if (!me) return void client.leave(KICK_CODE);
    const id = String(me.id);
    client.userData = { id };
    // 같은 계정의 이전 연결은 끊는다
    for (const c of this.clients) if (c !== client && this.userOf(c) === id) c.leave(REPLACED_CODE);
    // 방이 생긴 뒤 들어온 주민
    this.addResident(me);
    this.game.join(id);
  }

  private addResident(me: MeRes): void {
    this.game.addResident({ id: String(me.id), name: me.nickname, color: this.game.state.residents.size % LOOK.playerColors, hair: me.hairStyle, hairColor: me.hairColor, weapon: me.weapon });
  }

  onLeave(client: Client): void {
    const id = this.userOf(client);
    // 같은 계정이 이미 새로 들어와 있으면 그대로 둔다
    if (this.clients.some((c) => c !== client && this.userOf(c) === id)) return;
    this.game.leave(id);
  }

  /**
   * 우물 출발 (network.md 3장): 파티원 정보(이름·색·머리·숙련도·가져갈 물약)로 던전 방을 만들고 각자에게 방 번호.
   * 주민 상태는 "탐험 중"이 되고, 클라이언트는 섬 방을 나가 던전 방으로 들어간다
   */
  private async depart(ids: string[], floor: string): Promise<void> {
    const db = services().db;
    // 색은 파티 순서대로 (섬 주민은 10명이라 색이 겹칠 수 있어서, 던전 파티 4명 안에서는 겹치지 않게)
    const members: PartyMember[] = ids.map((id, slot) => {
      const r = this.game.state.residents.get(id), weapon = r?.weapon || 'greatsword', m = mastery(db, Number(id), weapon);
      return { userId: id, name: r?.name ?? '?', color: slot % LOOK.playerColors, hair: r?.hair ?? 0, hairColor: r?.hairColor ?? 0, weapon, level: m.level, levelExp: m.exp, potions: carryPotions(db, Number(id)) };
    });
    islandBus.departed(this.islandId, ids, floor);
    try {
      const room = await matchMaker.createRoom('dungeon', { party: { islandId: this.islandId, floor, members } });
      for (const id of ids) this.clientOf(id)?.send('depart', { roomId: room.roomId, floor });
    } catch (e) {
      console.error('[island] 던전 방을 만들지 못함', e);
      islandBus.returned(this.islandId, ids);
    }
  }

  onDispose(): void {
    for (const off of this.unwatch) off();
  }

  private userOf(client: Client): string {
    return (client.userData as { id?: string } | undefined)?.id ?? '';
  }

  private clientOf(id: string): Client | undefined {
    return this.clients.find((c) => this.userOf(c) === id);
  }
}
