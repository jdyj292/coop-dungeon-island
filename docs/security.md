# 계정과 보안 (docs/security.md)

계정, 인증, 세션, 공격 방어, 입력 검증, 운영 보안의 기준 문서.
접속 흐름(방 입장)은 docs/network.md.

---

## 1. 계정

- 가입: 닉네임 + 비밀번호. **저장하는 개인정보는 닉네임뿐** (이메일·실명 없음)
- 닉네임: 2~12자, 한글·영문·숫자만, 중복 불가 (대소문자 무시)
- 비밀번호: 8자 이상. **Argon2id**로 해시 저장 (원문은 저장·로그 금지)
- **복구 코드**: 가입 직후 한 번만 보여주는 무작위 코드 (예: 4자리 × 4묶음). 해시만 저장. 비밀번호를 잊으면 닉네임 + 복구 코드로 재설정, 재설정하면 새 복구 코드 발급
- 비밀번호 변경·재설정 시 그 계정의 모든 세션 무효화
- 계정 삭제 (MVP 이후, roadmap): 섬 떠나기 규칙(docs/island.md 7장) 적용 후 계정 데이터 삭제

---

## 2. 세션

- 로그인 성공 시 32바이트 무작위 토큰 발급
- 클라이언트: **httpOnly, Secure, SameSite=Lax 쿠키**로 보관 (자바스크립트에서 읽을 수 없음)
- 서버 DB: 토큰의 SHA-256 해시만 저장
- 유효 기간 30일, 접속할 때마다 연장. 로그아웃 시 즉시 삭제
- 게임 서버(Colyseus) 입장도 같은 쿠키로 인증 (onAuth에서 세션 확인). 웹과 게임 서버를 Nginx 아래 같은 도메인으로 묶어 WebSocket 연결에도 쿠키가 전달되게 한다
- 같은 계정 새 접속 시 기존 게임 연결 종료 (network.md)

---

## 3. 공격 방어

| 대상 | 제한 |
|---|---|
| 로그인 | IP당 분당 5회, 계정당 분당 5회. 연속 10회 실패 시 그 계정 15분 잠금 |
| 가입 | IP당 시간당 3회 |
| 복구 코드 재설정 | IP당 시간당 5회, 계정당 연속 5회 실패 시 1시간 잠금 |
| 섬 입장 신청 | 계정당 분당 5회 |
| 게임 메시지 | network.md 4장 |

- 제한은 Nginx(limit_req)와 앱 양쪽에 둔다
- 실패 응답은 "닉네임 또는 비밀번호가 틀렸습니다"로 통일 (닉네임 존재 여부를 알려주지 않음)

### 섬 입장 신청 (island.md 7장)
- 초대 코드는 없앰. 섬 목록은 로그인한 사람만 (섬 이름·주인 닉네임·주민 수)
- 허용·거절은 섬 주인(islands.owner_id)만, 서버가 세션 계정으로 확인. 허용은 트랜잭션 안에서 자리·신청 상태를 다시 확인

---

## 4. 입력과 출력

- 모든 HTTP 요청·게임 메시지는 zod 스키마로 검사 (형식·길이·범위)
- 닉네임·메모·채팅: 길이 제한, 제어 문자·줄바꿈 제거, 허용 문자만. 채팅은 텍스트로만 그림 (서버는 기록·저장하지 않음)
- 화면 표시: 사용자 입력은 **텍스트로만** 그린다 (HTML로 해석하지 않음, innerHTML 금지)
- DB: 쿼리는 항상 매개변수 바인딩 (Drizzle 사용, 문자열 이어붙이기 금지)

---

## 5. 통신

- HTTPS·WSS만 허용 (기존 Nginx SSL), HTTP는 HTTPS로 이동, HSTS 설정
- WebSocket 연결 시 Origin 헤더를 우리 도메인으로 제한
- CORS: 우리 도메인만
- 보안 헤더: Content-Security-Policy(자체 도메인 + 글꼴 출처), X-Content-Type-Options, Referrer-Policy

---

## 6. 운영

- 비밀 값(세션 서명 키 등)은 환경 변수로만. 저장소에 넣지 않음 (.env는 .gitignore)
- SQLite 파일: 서비스 계정만 읽기·쓰기 권한. 매일 백업, 7일치 보관, 백업도 같은 권한
- 로그: 인증 성공·실패, 잠금, 관리 작업, 서버 오류. **비밀번호·토큰·복구 코드는 기록하지 않음**
- 관리자 도구: 명령줄 스크립트 (계정 정지·해제, 세션 강제 종료). 웹 관리자 페이지는 두지 않음
- 의존성: 월 1회 업데이트 확인 (npm audit)

---

## 7. 데이터
- 테이블: docs/db.md (users, sessions, auth_log)
- MVP 범위: docs/roadmap.md

---

## 8. 구현 (M4 4-2)
- 입력 형식·규칙 상수: shared/src/auth.ts (`AUTH`, zod 스키마 — 클라이언트 폼과 서버가 같이 씀)
- 서버: server/src/http/ — accounts.ts(가입·로그인·복구·비밀번호 변경), islandJoin.ts(섬 목록·만들기·입장 신청·허용), sessions.ts, secrets.ts(Argon2id: 19MiB·2회·병렬 1, 토큰 SHA-256), limiter.ts(시도 제한 표), routes.ts, app.ts
- API (`/api`, JSON): POST signup {nickname, password} · login · logout · recover {nickname, recoveryCode, password} · password {current, password}, GET me (섬이 없으면 island null, 넣어 둔 신청 request)
- 섬 고르기 API: GET islands · POST island/create · island/request {islandId} · island/request/cancel (모두 {me} 응답) / 섬 주인: GET island/requests · POST island/decide {userId, accept}
- 응답 오류 코드: invalid 400 · badLogin 401 · unauthorized 401 · nicknameTaken 409 · islandFull 409 · hasIsland 409 · noRequest 409 · notOwner 403 · rateLimited 429
- 쿠키 이름 `sid` (httpOnly, Secure, SameSite=Lax, 30일). 개발 http에서 Secure를 끄려면 `COOKIE_SECURE=0` (localhost는 켜도 동작)
- 로그인 실패는 없는 닉네임·잠긴 계정·틀린 비밀번호 모두 badLogin (응답 시간도 같게: 없는 닉네임도 해시 검사 1회)
- 시도 제한은 앱 메모리 (재시작하면 비워짐). 로그인 잠금은 DB(failed_logins·locked_until), 복구 코드 연속 실패 잠금은 메모리
- 정리: 만료 세션·30일 지난 auth_log를 시작할 때 + 한 시간마다 삭제
- 개발: Vite가 `/api`를 게임 서버(2567)로 넘김 (같은 출처 → 쿠키 전달)

### 통신 보안 구현 (M5 5-2, server/src/http/security.ts)
- `PUBLIC_ORIGIN`(우리 사이트 주소)을 정하면: `/api` POST·WebSocket 연결은 Origin이 그것이거나 없을 때(봇·curl)만 받음 (다르면 403 / 소켓 거절), 매치메이킹 CORS는 그 주소로 고정. 비어 있으면 개발 (제한 없음)
- 보안 헤더 (모든 응답): CSP `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'`(DOM 폼·index.html <style>)`; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' wss://<도메인>; object-src 'none'; frame-ancestors 'none'`, nosniff, Referrer-Policy same-origin, X-Frame-Options DENY, COOP same-origin. HSTS는 Nginx
### 운영 구현 (M5 5-3)
- 관리자 명령줄 server/src/admin.ts (배포 dist/admin.mjs, 개발 `pnpm admin`): users · suspend <닉네임> [--days N] · unsuspend · kick · backup. 모두 auth_log에 `admin:*` (ip admin)
- 정지: users.suspended_until까지 로그인(비밀번호가 맞을 때만 403 suspended, 틀리면 그대로 badLogin)·세션·게임 입장 막힘, 정지하면 세션도 지움. 이미 열린 게임 연결은 다음 재접속부터 막힘
- 백업: SQLite 온라인 백업 API (서버가 돌아도 됨) → <폴더>/game-<UTC 시각>.sqlite, 권한 600, 최근 keep개(기본 7)만. 매일 cron (docs/deploy.md 6장)

- 배포(NODE_ENV=production): 로그인 없는 개발 던전 방(?online=1) 거절, 개발 명령(dev·give·giveCoins) 무시, 게임 서버는 127.0.0.1에서만
