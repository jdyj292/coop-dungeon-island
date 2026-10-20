import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: {
    alias: { '@game/shared': fileURLToPath(new URL('../../shared/src/index.ts', import.meta.url)) },
  },
  // client/src·client/data를 그대로 읽는다. reference-*.html은 이 폴더라 /reference-action.html로 열린다
  server: { port: 5176, fs: { allow: [repoRoot] } },
});
