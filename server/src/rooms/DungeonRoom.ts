import { Room, type Client } from 'colyseus';
import { C2S, FixedStep, NET, TICK, type C2SType } from '@game/shared';
import { DungeonState } from '../schema/DungeonState';
import { DungeonGame, type DungeonOptions } from '../systems/dungeonGame';

/** 제한을 계속 넘긴 연결을 끊을 때의 종료 코드 */
const KICK_CODE = 4001;

/** 던전 방: 연결·전송만 맡고 진행은 DungeonGame. 60Hz 시뮬레이션, 20Hz 상태 전송 (docs/network.md 2·3장) */
export class DungeonRoom extends Room<DungeonState> {
  maxClients = 4;
  private game!: DungeonGame;
  private ticks = new FixedStep();

  onCreate(options: DungeonOptions): void {
    this.game = new DungeonGame({ room: Number(options?.room) || 1, partySize: Number(options?.partySize) || 1 }, {
      broadcast: (type, msg) => this.broadcast(type, msg),
      send: (pid, type, msg) => this.clients.find((c) => c.sessionId === pid)?.send(type, msg),
    });
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

  onJoin(client: Client, options: { name?: unknown }): void {
    this.game.join(client.sessionId, options?.name);
  }

  /** 끊김 대기·이탈 정산은 M3 (network.md 10장) */
  onLeave(client: Client): void {
    this.game.leave(client.sessionId);
  }
}
