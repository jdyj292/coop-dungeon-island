import { Server } from 'colyseus';
import { TILE } from '@game/shared';
import { DungeonRoom } from './rooms/DungeonRoom';

const PORT = Number(process.env.SERVER_PORT ?? 2567);

const server = new Server();
// 개발용 방 배정: 같은 방 번호·인원 조건의 빈자리에 들어가고, 없으면 새로 (섬 우물 출발은 M4)
server.define('dungeon', DungeonRoom).filterBy(['room', 'partySize']);

server.listen(PORT).then(() => {
  console.log(`[server] listening on :${PORT} (tile ${TILE}px)`);
});
