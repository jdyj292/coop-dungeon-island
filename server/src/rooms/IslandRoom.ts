import type { IncomingMessage } from 'node:http';
import { Room, type Client } from 'colyseus';
import { FixedStep, NET, TICK, type MeRes } from '@game/shared';
import { loadIsland } from '../db/islandQueries';
import { SESSION_COOKIE } from '../http/routes';
import { IslandState } from '../schema/IslandState';
import { readCookie, services } from '../services';
import { IslandGame } from '../systems/islandGame';

const KICK_CODE = 4001;
/** 같은 계정이 새로 접속해 기존 연결을 끊을 때 (network.md 3장) */
export const REPLACED_CODE = 4002;

/**
 * 섬 방: 섬마다 하나 (filterBy islandId). 입장은 세션 쿠키로 인증하고 그 섬 주민만 (security.md 2장, network.md 3장)
 * 진행은 IslandGame, 여기는 연결·전송만. 60Hz 이동, 20Hz 상태 전송
 */
export class IslandRoom extends Room<IslandState> {
  maxClients = 4;
  private game!: IslandGame;
  private ticks = new FixedStep();
  private islandId = 0;

  onCreate(options: { islandId?: unknown }): void {
    this.islandId = Number(options?.islandId);
    const row = loadIsland(services().db, this.islandId);
    if (!row) throw new Error(`섬 ${this.islandId} 없음`);
    this.game = new IslandGame(row.name, row.treasury, row.residents.map((r, i) => ({ id: String(r.id), name: r.nickname, color: i })), {
      send: (id, type, msg) => this.clientOf(id)?.send(type, msg),
    });
    this.setState(this.game.state);
    this.setPatchRate(1000 / NET.patchRate);
    this.setSimulationInterval((ms) => {
      for (let n = this.ticks.advance(ms / 1000); n > 0; n--) this.game.tick();
    }, TICK * 1000);
    for (const type of ['input', 'ping']) {
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
    if (me.island.id !== this.islandId) throw new Error('forbidden');
    return me;
  }

  onJoin(client: Client, _options?: unknown, me?: MeRes): void {
    if (!me) return void client.leave(KICK_CODE);
    const id = String(me.id);
    client.userData = { id };
    // 같은 계정의 이전 연결은 끊는다
    for (const c of this.clients) if (c !== client && this.userOf(c) === id) c.leave(REPLACED_CODE);
    // 방이 생긴 뒤 가입한 주민
    this.game.addResident({ id, name: me.nickname, color: this.game.state.residents.size });
    this.game.join(id);
    client.send('me', { wallet: me.wallet, level: 1 });
  }

  onLeave(client: Client): void {
    const id = this.userOf(client);
    // 같은 계정이 이미 새로 들어와 있으면 그대로 둔다
    if (this.clients.some((c) => c !== client && this.userOf(c) === id)) return;
    this.game.leave(id);
  }

  private userOf(client: Client): string {
    return (client.userData as { id?: string } | undefined)?.id ?? '';
  }

  private clientOf(id: string): Client | undefined {
    return this.clients.find((c) => this.userOf(c) === id);
  }
}
