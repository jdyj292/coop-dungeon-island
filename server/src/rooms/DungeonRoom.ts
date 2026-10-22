import type { IncomingMessage } from 'node:http';
import { Room, type Client } from 'colyseus';
import { C2S, FixedStep, NET, TICK, type C2SType, type S2C } from '@game/shared';
import { CONFIG } from '../config';
import { saveRun } from '../db/runStore';
import { SESSION_COOKIE } from '../http/routes';
import { DungeonState } from '../schema/DungeonState';
import { readCookie, services } from '../services';
import { DungeonGame, type DungeonOptions } from '../systems/dungeonGame';
import type { PartyMember } from '../systems/gameTypes';
import { islandBus } from '../systems/islandBus';

/** 제한을 계속 넘긴 연결을 끊을 때의 종료 코드 */
const KICK_CODE = 4001;

/**
 * 던전 방: 연결·전송만 맡고 진행은 DungeonGame. 60Hz 시뮬레이션, 20Hz 상태 전송 (docs/network.md 2·3장)
 * 섬에서 출발한 방(options.party)은 세션 쿠키로 그 파티원만 받고, 정산을 DB에 저장한 뒤 섬에 "돌아옴"을 알린다.
 * party가 없으면 개발용 방 (?online=1, 로그인 없이, 저장 안 함)
 */
export class DungeonRoom extends Room<DungeonState> {
  maxClients = 4;
  private game!: DungeonGame;
  private ticks = new FixedStep();
  private party: DungeonOptions['party'];
  /** sessionId → 파티원 */
  private who = new Map<string, PartyMember>();
  /** 아직 정산이 저장되지 않은 파티원 userId (방이 그냥 닫힐 때 섬에 돌려보냄) */
  private pending = new Set<string>();

  onCreate(options: DungeonOptions): void {
    this.party = options?.party;
    this.game = new DungeonGame({
      room: Number(options?.room) || 1, partySize: this.party?.members.length || Number(options?.partySize) || 1,
      // 개발 명령은 배포(NODE_ENV=production)에서 받지 않는다
      dev: !CONFIG.production,
    }, {
      broadcast: (type, msg) => this.broadcast(type, msg),
      send: (pid, type, msg) => this.clients.find((c) => c.sessionId === pid)?.send(type, msg),
      close: () => { void this.disconnect(); },
      settled: (result, left) => this.save(result, left),
    });
    if (this.party) {
      void this.setPrivate(true);
      for (const m of this.party.members) this.pending.add(m.userId);
    }
    this.maxClients = this.game.state.partySize;
    this.setState(this.game.state);
    this.setPatchRate(1000 / NET.patchRate);
    this.setSimulationInterval((ms) => {
      for (let n = this.ticks.advance(ms / 1000); n > 0; n--) this.game.tick();
    }, TICK * 1000);
    for (const type of Object.keys(C2S) as C2SType[]) {
      this.onMessage(type, (client, raw) => {
        if (this.game.onMessage(client.sessionId, type, raw) === 'kick') client.leave(KICK_CODE);
      });
    }
  }

  /** 섬 파티 방: 세션 쿠키의 계정이 파티원이고 아직 안 들어왔어야 (개발 방은 누구나) */
  onAuth(_client: Client, _options: unknown, request?: IncomingMessage): PartyMember | true {
    if (!this.party) return true;
    const userId = services().accounts.sessions.user(readCookie(request?.headers.cookie, SESSION_COOKIE), Date.now());
    const m = this.party.members.find((x) => x.userId === String(userId));
    if (!m || [...this.who.values()].includes(m)) throw new Error('forbidden');
    return m;
  }

  onJoin(client: Client, options: { name?: unknown }, auth?: PartyMember | true): void {
    const m = auth === true ? undefined : auth;
    if (m) this.who.set(client.sessionId, m);
    this.game.join(client.sessionId, options?.name, m);
  }

  /** 스스로 나가면 바로 이탈, 끊기면 재접속 대기 (파티 30초·솔로 60초·전원 60초, network.md 10장) */
  async onLeave(client: Client, consented: boolean): Promise<void> {
    const pid = client.sessionId;
    if (consented) return this.game.leave(pid);
    const wait = this.game.disconnect(pid);
    try {
      await this.allowReconnection(client, wait);
      this.game.reconnect(pid);
    } catch {
      // 시간 초과: 이탈 처리는 DungeonGame 틱이 한다
    }
  }

  /** 정산 저장 (한 사람씩 트랜잭션) → 섬에 돌아옴 알림 */
  private save(result: S2C['result'], left: Record<string, { hp: number; mp: number }>): void {
    const party = this.party;
    if (!party) return;
    const floor = Number(party.floor.replace(/\D/g, '')) || 1, now = Date.now(), done: string[] = [];
    for (const line of result.lines) {
      const m = this.who.get(line.pid);
      if (!m || !this.pending.has(m.userId)) continue;
      const rest = left[line.pid] ?? { hp: 0, mp: 0 };
      const used = { hp: Math.max(0, m.potions.hp - rest.hp), mp: Math.max(0, m.potions.mp - rest.mp) };
      saveRun(services().db, party.islandId, Number(m.userId), result.kind, line, used, floor, now);
      this.pending.delete(m.userId);
      done.push(m.userId);
    }
    if (done.length) islandBus.returned(party.islandId, done);
  }

  /** 방이 닫힘: 들어오지 못한 파티원 등 저장할 것이 없는 사람도 섬으로 */
  onDispose(): void {
    if (this.party && this.pending.size) islandBus.returned(this.party.islandId, [...this.pending]);
  }
}
