import { createServer } from 'node:http';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { Server } from 'colyseus';
import { TILE } from '@game/shared';
import { CONFIG } from './config';
import { openDb } from './db/client';
import { createHttpApp } from './http/app';
import { DungeonRoom } from './rooms/DungeonRoom';
import { IslandRoom } from './rooms/IslandRoom';
import { setServices } from './services';

// DB + 인증 API(/api)와 Colyseus를 같은 http 서버에 (쿠키가 WebSocket에도 전달되게, security.md 2장)
// 배포는 빌드한 클라이언트(STATIC_DIR)도 같은 서버가 준다 → Nginx는 한 곳으로만 넘기면 됨 (docs/deploy.md)
const { db } = openDb(CONFIG.dbPath);
const { app, accounts } = createHttpApp(db, { secureCookie: CONFIG.secureCookie, staticDir: CONFIG.staticDir });
setServices({ db, accounts });
const server = new Server({ transport: new WebSocketTransport({ server: createServer(app) }) });
// 개발용 방 배정: 같은 방 번호·인원 조건의 빈자리에 들어가고, 없으면 새로 (섬 우물 출발은 M4)
server.define('dungeon', DungeonRoom).filterBy(['room', 'partySize']);
// 섬마다 방 하나 (입장 인증은 IslandRoom.onAuth)
server.define('island', IslandRoom).filterBy(['islandId']);

server.listen(CONFIG.port, CONFIG.host).then(() => {
  console.log(`[server] ${CONFIG.production ? 'production' : 'dev'} ${CONFIG.host}:${CONFIG.port} (tile ${TILE}px, db ${CONFIG.dbPath}${CONFIG.staticDir ? `, static ${CONFIG.staticDir}` : ''})`);
});
