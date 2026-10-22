// 실행: pnpm deploy-local — 배포 묶음(dist/)을 이 PC에서 프로덕션 모드로 띄워 본다 (Nginx 없이 http://localhost:8080)
// 네이티브 모듈은 서버처럼 설치하지 않고 저장소의 것(server/node_modules)을 연결한다. DB는 dist-data/ (저장소에 안 들어감)
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, symlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const dist = join(root, 'dist');
const PORT = 8080;
if (!existsSync(join(dist, 'server.mjs'))) {
  console.error('dist/server.mjs가 없습니다. 먼저 pnpm deploy-build');
  process.exit(1);
}
for (const mod of ['better-sqlite3', '@node-rs/argon2']) {
  const to = join(dist, 'node_modules', mod);
  if (existsSync(to)) continue;
  mkdirSync(dirname(to), { recursive: true });
  // 윈도우는 관리자 권한 없이 만들 수 있는 junction
  symlinkSync(join(root, 'server/node_modules', mod), to, 'junction');
}
const child = spawn(process.execPath, ['--enable-source-maps', join(dist, 'server.mjs')], {
  cwd: dist,
  stdio: 'inherit',
  env: {
    ...process.env, NODE_ENV: 'production', SERVER_HOST: '127.0.0.1', SERVER_PORT: String(PORT),
    DB_PATH: join(root, 'dist-data/game.sqlite'), STATIC_DIR: join(dist, 'public'), PUBLIC_ORIGIN: `http://localhost:${PORT}`,
  },
});
child.on('exit', (code) => process.exit(code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => child.kill(sig));
