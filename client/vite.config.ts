import { defineConfig } from 'vite';

export default defineConfig({
  // 인증 API는 게임 서버(2567)로 넘김: 같은 출처라 쿠키가 그대로 오감 (배포는 Nginx가 같은 일, security.md 2장)
  server: { port: 5173, proxy: { '/api': 'http://localhost:2567' } },
});
