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

5-4에서 채운다 (Nginx 설정 틀, systemd 유닛, 설치 순서).

## 6. 관리·백업 (서버에서, server/src/admin.ts)

```bash
cd /opt/coop-dungeon-island && sudo -u coopgame env $(cat /etc/coop-dungeon-island.env | xargs) node admin.mjs users
```
| 명령 | 하는 일 |
|---|---|
| users | 계정 목록 (닉네임·섬·지갑·정지·마지막 접속) |
| suspend <닉네임> [--days N] | 정지 (기간 없으면 해제할 때까지), 세션도 끊음 |
| unsuspend <닉네임> | 정지 해제 (로그인 잠금도 풂) |
| kick <닉네임> | 세션 강제 종료 |
| invite <닉네임> | 그 주민 섬의 초대 코드 재발급 (새 코드를 주민에게 전달) |
| backup [--dir 폴더] [--keep 7] | 온라인 백업, 오래된 것은 keep개만 |

- 개발 PC에서는 `pnpm admin <명령>` (server/data/game.sqlite)
- 복원: 서비스 멈춤 → 백업 파일을 DB_PATH로 복사하고 같은 이름의 -wal·-shm 파일 삭제 → 권한 600·소유자 확인 → 서비스 시작
