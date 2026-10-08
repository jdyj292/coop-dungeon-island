import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  // client/src·client/data·docs/refs를 그대로 읽는다
  server: { port: 5174, fs: { allow: [repoRoot] } },
});
