// 실행: pnpm deploy-build — 배포 묶음을 dist/에 만든다 (docs/deploy.md)
// dist/server.mjs (게임 서버 한 파일, esbuild) + dist/migrations (DB) + dist/public (빌드한 클라이언트) + dist/package.json (네이티브 모듈만)
// 서버에서는 dist/를 통째로 복사한 뒤 `npm ci --omit=dev` 또는 `npm install --omit=dev` → `node server.mjs`
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const out = join(root, 'dist');
/** 네이티브 모듈은 묶지 않고 서버에서 설치 (플랫폼별 바이너리) */
const NATIVE = ['better-sqlite3', '@node-rs/argon2'];
/** ws의 선택 의존성 (없으면 순수 JS로 동작) */
const OPTIONAL = ['bufferutil', 'utf-8-validate'];

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

console.log('1/4 클라이언트 빌드 (vite)');
execSync('pnpm --filter @game/client build', { cwd: root, stdio: 'inherit' });
cpSync(join(root, 'client/dist'), join(out, 'public'), { recursive: true });

console.log('2/4 서버 묶기 (esbuild)');
await build({
  entryPoints: [join(root, 'server/src/index.ts')],
  outfile: join(out, 'server.mjs'),
  bundle: true, platform: 'node', format: 'esm', target: 'node22', sourcemap: true,
  tsconfig: join(root, 'server/tsconfig.json'),
  external: [...NATIVE, ...OPTIONAL],
  // 묶인 CommonJS 코드가 require·__dirname을 쓸 수 있게
  banner: { js: "import { createRequire as __cr } from 'node:module'; import { fileURLToPath as __fu } from 'node:url'; import { dirname as __dn } from 'node:path'; const require = __cr(import.meta.url); const __filename = __fu(import.meta.url); const __dirname = __dn(__filename);" },
  logLevel: 'warning',
});

console.log('3/4 DB 마이그레이션');
cpSync(join(root, 'server/src/db/migrations'), join(out, 'migrations'), { recursive: true });

console.log('4/4 실행용 package.json');
const serverPkg = JSON.parse(readFileSync(join(root, 'server/package.json'), 'utf8')) as { dependencies: Record<string, string> };
writeFileSync(join(out, 'package.json'), `${JSON.stringify({
  name: 'coop-dungeon-island-server', private: true, type: 'module',
  scripts: { start: 'node --enable-source-maps server.mjs' },
  dependencies: Object.fromEntries(NATIVE.map((n) => [n, serverPkg.dependencies[n]!])),
  engines: { node: '>=22' },
}, null, 2)}\n`);
for (const f of ['.env.example', 'CREDITS.md']) if (existsSync(join(root, f))) cpSync(join(root, f), join(out, f));
console.log(`완료: ${out}`);
