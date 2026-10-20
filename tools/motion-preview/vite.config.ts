import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  // phaser는 client 패키지 의존성이라 그쪽 것을 쓴다 (게임과 같은 버전)
  resolve: {
    alias: {
      phaser: fileURLToPath(new URL('../../client/node_modules/phaser', import.meta.url)),
      '@game/shared': fileURLToPath(new URL('../../shared/src/index.ts', import.meta.url)),
    },
  },
  // client/src·client/data·shared를 그대로 읽는다. reference.html은 이 폴더라 /reference.html로 열린다
  server: { port: 5175, fs: { allow: [repoRoot] } },
});
