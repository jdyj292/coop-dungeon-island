import { Server } from 'colyseus';
import { TILE } from '@game/shared';
import { DungeonRoom } from './rooms/DungeonRoom';

const PORT = Number(process.env.SERVER_PORT ?? 2567);

const server = new Server();
server.define('dungeon', DungeonRoom);

server.listen(PORT).then(() => {
  console.log(`[server] listening on :${PORT} (tile ${TILE}px)`);
});
