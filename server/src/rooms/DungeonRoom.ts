import { Room } from 'colyseus';

/** 던전 방 (빈 뼈대). 흐름은 docs/network.md 3장 */
export class DungeonRoom extends Room {
  maxClients = 4;

  onCreate(): void {}
}
