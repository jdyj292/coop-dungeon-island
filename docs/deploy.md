# 배포 (docs/deploy.md)

개인 리눅스 서버(기존 Nginx·SSL)에 전용 서브도메인으로 올리는 순서. 보안 규칙은 docs/security.md 5·6장.

---

## 1. 구성

```
브라우저 ──https/wss──▶ Nginx (SSL, 서브도메인) ──http/ws──▶ 게임 서버 127.0.0.1:2567
                                                     ├ 정적 파일 (빌드한 클라이언트, STATIC_DIR)
                                                     ├ /api (계정)
                                                     └ /matchmake + 방 소켓 (Colyseus)
```
- 페이지·API·게임 소켓이 **모두 같은 주소** → 세션 쿠키가 WebSocket에도 그대로 간다 (security.md 2장). Nginx는 한 곳으로만 넘기면 됨
- 클라이언트는 빌드하면 페이지와 같은 주소로 접속 (client/src/net/connection.ts serverUrl)

## 2. 빌드 (이 PC)

```bash
pnpm deploy-build
```
`dist/` 에 생기는 것 (tools/deploy/build.ts):
| 파일 | 내용 |
|---|---|
| server.mjs (+ .map) | 게임 서버 한 파일 (esbuild). 네이티브 모듈만 빼고 다 들어 있음 |
| migrations/ | DB 마이그레이션 (시작할 때 자동 적용) |
| public/ | 빌드한 클라이언트 (Vite) |
| package.json | 네이티브 모듈 better-sqlite3·@node-rs/argon2 (서버에서 설치) |
| .env.example | 환경 변수 예시 |
| deploy/ | 서버 설치 파일 (5장) |

## 3. 로컬에서 프로덕션 모드로 시험

```bash
pnpm deploy-local
```
- http://localhost:8080 (Nginx 없이 같은 구성). DB는 dist-data/ (저장소에 안 들어감)
- 프로덕션 빌드에는 개발 손잡이(window.game, ` 키 패널, ?drafts)가 없다. 흐름 확인은 `pnpm island-bot --url http://localhost:8080 --name 봇 --well --depart` (봇 섬 만들기 → 우물 → 혼자 출발 → 던전 → 정산)

## 4. 환경 변수 (server/src/config.ts)

| 변수 | 기본 | 설명 |
|---|---|---|
| NODE_ENV | | production이면 개발 명령(dev·give·giveCoins) 꺼짐, 기본 주소 127.0.0.1 |
| SERVER_HOST / SERVER_PORT | 127.0.0.1 (production) / 2567 | 게임 서버가 듣는 곳 |
| DB_PATH | data/game.sqlite | SQLite 파일 |
| STATIC_DIR | (없음) | 빌드한 클라이언트 폴더. 있으면 게임 서버가 정적 파일도 줌 |
| PUBLIC_ORIGIN | (없음) | 우리 사이트 주소 (https://game.example.com). WebSocket·/api Origin 제한, CSP connect-src, 매치메이킹 CORS (security.md 8장). **배포에서는 꼭 설정** |
| COOKIE_SECURE | 켬 | 0이면 Secure 끔 (http로 시험할 때만) |

## 5. 서버 설치·업데이트

설치 파일은 저장소 `deploy/` (빌드하면 `dist/deploy/`로 같이 들어감, 줄바꿈은 .gitattributes로 항상 LF)
| 파일 | 서버 위치 | 내용 |
|---|---|---|
| install.sh | (dist 안에서 실행) | 설치·업데이트 한 번에. 계정·폴더·권한, 복사, 네이티브 모듈, 서비스·cron 등록, 재시작 |
| coop-dungeon-island.service | /etc/systemd/system/ | 게임 서버. coopgame 계정, 죽으면 재시작, 쓰기는 /var/lib/coop-dungeon-island만 |
| backup.cron | /etc/cron.d/coop-dungeon-island | 매일 04:30 온라인 백업, 7일치 (6장) |
| admin.sh | /usr/local/bin/coop-admin | 관리자 명령 (6장) |
| nginx.conf | /etc/nginx/sites-available/ (또는 conf.d/) | 서브도메인 틀. **직접** 고쳐서 넣는다 (install.sh는 Nginx를 건드리지 않음) |

서버에 생기는 것
| 경로 | 소유·권한 | 내용 |
|---|---|---|
| /opt/coop-dungeon-island | root, 읽기만 | 프로그램 (dist 내용 + node_modules). 지난 판본은 .prev |
| /var/lib/coop-dungeon-island | coopgame 700 | game.sqlite(-wal·-shm), backups/, backup.log |
| /etc/coop-dungeon-island.env | root:coopgame 640 | 환경 변수 (4장) |

### 준비물 (한 번)
- Node 22 이상, npm, rsync, 네이티브 모듈 빌드 도구(미리 빌드된 바이너리가 없을 때만: build-essential, python3)
- DNS: 서브도메인(A/AAAA) → 이 서버. SSL 인증서 (예: `sudo certbot certonly --nginx -d game.example.com`)

### 처음 설치
1. 이 PC: `pnpm deploy-build` → `dist/`를 서버로 올림 (예: `scp -r dist 서버:~/coop-dist`)
2. 서버: `cd ~/coop-dist && sudo bash deploy/install.sh` → 환경 변수 파일만 만들고 멈춤
3. `sudo nano /etc/coop-dungeon-island.env` → `PUBLIC_ORIGIN=https://실제주소` (끝에 / 없이)
4. 다시 `sudo bash deploy/install.sh` → 복사·설치·서비스 시작 (DB와 마이그레이션은 첫 시작 때 자동)
5. Nginx: `deploy/nginx.conf`의 `game.example.com`·인증서 경로를 고쳐 sites-available에 두고 sites-enabled에 연결 → `sudo nginx -t && sudo systemctl reload nginx`
6. 확인: `curl -sI https://실제주소 | grep -i -e strict -e content-security` (HSTS·CSP 헤더), 브라우저로 가입 → 섬 → 우물 출발

### 친구 초대
- 첫 사람이 초대 코드 없이 가입하면 자기 섬이 생긴다. 섬에서 M(게시판) → 초대 탭 → 복사로 초대 코드를 친구에게 준다. 친구는 가입할 때 그 코드를 넣어 같은 섬 주민이 된다
- 코드가 새어 나가면 같은 탭의 "새 코드" (이전 코드는 바로 무효). 서버에서는 `sudo coop-admin invite <닉네임>`
- 링크만 알려 주고 코드를 넣지 않으면 따로 새 섬이 생긴다

### 업데이트
1. 이 PC: `pnpm deploy-build` → 서버에 새 dist 올림
2. 서버: `sudo bash deploy/install.sh` (지난 판본을 /opt/coop-dungeon-island.prev로 남기고 교체·재시작. 진행 중인 판은 끊긴다 → 아무도 없을 때)
- 새 마이그레이션은 시작 때 자동 적용. 큰 변경 전에는 `sudo coop-admin backup --dir /var/lib/coop-dungeon-island/backups` 먼저

### 되돌리기
```bash
sudo systemctl stop coop-dungeon-island
sudo rm -rf /opt/coop-dungeon-island && sudo mv /opt/coop-dungeon-island.prev /opt/coop-dungeon-island
sudo systemctl start coop-dungeon-island
```
- 새 판본이 DB 마이그레이션을 했으면 옛 코드가 새 DB를 못 읽을 수 있다 → 업데이트 전 백업으로 함께 복원 (6장)

### 로그·상태
- `sudo systemctl status coop-dungeon-island` · `journalctl -u coop-dungeon-island -f` (서버 시작·오류·인증 기록)
- Nginx: /var/log/nginx/coop-dungeon-island.*.log · 백업: /var/lib/coop-dungeon-island/backup.log
- 월 1회: 저장소에서 `pnpm audit`·의존성 업데이트 확인 → 다시 빌드·업데이트 (security.md 6장)

## 6. 관리·백업 (서버에서, server/src/admin.ts)

`coop-admin`은 deploy/admin.sh: coopgame 계정으로 환경 변수를 읽고 `node admin.mjs`를 실행한다

```bash
sudo coop-admin users
```
| 명령 | 하는 일 |
|---|---|
| users | 계정 목록 (닉네임·섬·지갑·정지·마지막 접속) |
| suspend <닉네임> [--days N] | 정지 (기간 없으면 해제할 때까지), 세션도 끊음 |
| unsuspend <닉네임> | 정지 해제 (로그인 잠금도 풂) |
| kick <닉네임> | 세션 강제 종료 |
| invite <닉네임> | 그 주민 섬의 초대 코드 재발급 (새 코드를 주민에게 전달) |
| backup [--dir 폴더] [--keep 7] | 온라인 백업, 오래된 것은 keep개만 |

- 자동 백업: /etc/cron.d/coop-dungeon-island가 매일 04:30 `backup --dir /var/lib/coop-dungeon-island/backups --keep 7` (권한 600)
- 개발 PC에서는 `pnpm admin <명령>` (server/data/game.sqlite)
- 복원: 서비스 멈춤 → 백업 파일을 DB_PATH로 복사하고 같은 이름의 -wal·-shm 파일 삭제 → 권한 600·소유자 확인 → 서비스 시작
