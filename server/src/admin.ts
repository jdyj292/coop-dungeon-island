// 관리자 명령줄 (docs/deploy.md 6장). 배포: node admin.mjs <명령>, 개발: pnpm admin <명령>
// DB는 환경 변수 DB_PATH (게임 서버와 같은 파일, 서버가 돌고 있어도 됨: WAL)
import { parseArgs } from 'node:util';
import { backup, FOREVER, kick, listUsers, reissueInvite, suspend, unsuspend } from './admin/commands';
import { CONFIG } from './config';
import { openDb } from './db/client';

const HELP = `사용법:
  users                         계정 목록 (닉네임·섬·지갑·정지·마지막 접속)
  suspend <닉네임> [--days N]   정지 (기간 없으면 해제할 때까지), 세션도 끊음
  unsuspend <닉네임>            정지 해제 (로그인 잠금도 풂)
  kick <닉네임>                 세션 강제 종료 (다시 로그인)
  invite <닉네임>               그 주민 섬의 초대 코드 재발급
  backup [--dir 폴더] [--keep 7] 온라인 백업 (오래된 것은 keep개만 남김)`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { days: { type: 'string' }, dir: { type: 'string', default: 'backups' }, keep: { type: 'string', default: '7' } },
});
const [cmd, name] = positionals;
const day = (t: number) => (t >= FOREVER ? '해제할 때까지' : new Date(t).toISOString().slice(0, 16).replace('T', ' '));

async function main(): Promise<void> {
  if (!cmd) return console.log(HELP);
  const { db, sqlite, close } = openDb(CONFIG.dbPath), now = Date.now();
  const need = () => {
    if (!name) throw new Error(`닉네임이 필요합니다\n${HELP}`);
    return name;
  };
  try {
    switch (cmd) {
      case 'users':
        for (const u of listUsers(db)) {
          const st = u.suspendedUntil > now ? `정지(${day(u.suspendedUntil)})` : '정상';
          console.log(`${u.nickname.padEnd(12)} ${String(u.island ?? '-').padEnd(16)} 지갑 ${String(u.wallet).padStart(6)}  ${st}  ${u.lastSeen ? `접속 ${day(u.lastSeen)}` : ''}`);
        }
        break;
      case 'suspend':
        console.log(`정지: ${need()} (${day(suspend(db, need(), values.days ? Number(values.days) : null, now))})`);
        break;
      case 'unsuspend':
        unsuspend(db, need(), now);
        console.log(`정지 해제: ${need()}`);
        break;
      case 'kick':
        console.log(`세션 ${kick(db, need(), now)}개 끊음: ${need()}`);
        break;
      case 'invite':
        console.log(`새 초대 코드: ${reissueInvite(db, need(), now)}`);
        break;
      case 'backup':
        console.log(`백업: ${await backup(sqlite, values.dir, Math.max(1, Number(values.keep)), now)}`);
        break;
      default:
        console.log(HELP);
        process.exitCode = 1;
    }
  } finally {
    close();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
