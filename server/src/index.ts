import { createServer } from 'node:http';
import { Server } from 'colyseus';
import { TILE } from '@game/shared';
import { openDb } from './db/client';
import { createHttpApp } from './http/app';
import { DungeonRoom } from './rooms/DungeonRoom';

const PORT = Number(process.env.SERVER_PORT ?? 2567);

// DB + 인증 API(/api)와 Colyseus를 같은 http 서버에 (쿠키가 WebSocket에도 전달되게, security.md 2장)
const { db } = openDb();
const { app } = createHttpApp(db, { secureCookie: process.env.COOKIE_SECURE !== '0' });
const server = new Server({ server: createServer(app) });
// 개발용 방 배정: 같은 방 번호·인원 조건의 빈자리에 들어가고, 없으면 새로 (섬 우물 출발은 M4)
server.define('dungeon', DungeonRoom).filterBy(['room', 'partySize']);

server.listen(PORT).then(() => {
  console.log(`[server] listening on :${PORT} (tile ${TILE}px, db ${process.env.DB_PATH ?? 'data/game.sqlite'})`);
});
