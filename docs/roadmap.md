# 로드맵 (docs/roadmap.md)

MVP 범위, 마일스톤별 목표·읽을 문서·완료 기준, 세션 단위 작업 목록. 진행 체크는 CLAUDE.md "개발 순서".

---

## 1. MVP 범위

### 포함
- 계정: 가입·로그인·로그아웃, Argon2id, 쿠키 세션, 복구 코드, 요청 제한, 입력 검증
- 섬: 생성·섬 목록에서 입장 신청(주인 허용, 주민 10명), 고정 시설 5종(CD에서 카드 상점 더해 6종), 장식 10종 + 분수, 배치·회전·이동·치우기, 잡화점(물약·장식), 게시판 기록, 우물 출발 대기
- 캐릭터: 16px 기본 캐릭터, 머리 모양 3종, 초보 모험가 의상, 표정 3종
- 무기: 대검(평타·대시 공격·기본 스킬 2) + 스태프(같은 구성)
- 조작·전투: 걷기·달리기·백스텝, 경직·다운·바운드, HP·MP, 물약 2종, 기절·부활, 귀환, 정산
- 던전: 버섯 숲 1층 (방 5개 + 보스), 몬스터 5종 전부, 재료 1종(버섯)
- 솔로 규칙: 공격 토큰, 부활의 깃털, 개인 콤보
- 성장: 숙련도 경험치·레벨 (공격력·HP 반영)
- 소통: 텍스트 채팅(섬·던전), 게시판 메모 
- 소리: 합성 효과음 (audio.md 3장 목록), 합성 BGM 3곡 (섬·1층·1층 보스, 확정), 볼륨 설정
- 운영: HTTPS·WSS, 백업, 관리자 명령줄 도구

### 제외 (MVP 이후)
- 2층 이상, 주먹·쌍검, 계열 스킬·공용 패시브·슬롯 장착, 필살기 (기본 스킬 포인트·변형은 MVP 보충 SK-1, 계열 1단계 액티브는 SK-2, 계열 2단계·슬롯 장착은 SK-4, 공용 패시브는 SK-5, 레벨 열림·계열 선택으로 개편은 SK-6, 계열 3단계는 SK-7, 스킬 카드로 개편은 CD)
- 폭탄 버섯 등 환경 기믹, 층 해금 건물·연마, 공방 제작, 낚시
- 의상 판매·장착(마법사·도적·기사), 무기 외형(제작·보스 드롭·색 변형), 개인 집, 섬 방문·확장
- 계정 삭제 화면, 소셜 로그인, 모바일·게임패드, Steam, 2층 이후 BGM

---

## 2. 마일스톤

| 단계 | 목표 | 읽을 문서 | 완료 기준 |
|---|---|---|---|
| M0 스타일 테스트 | 프로젝트 뼈대(pnpm 워크스페이스: client·server·shared), 스프라이트 생성기(마스크 → 자동 음영 → 텍스처), sprite-preview·palette-check·motion-preview, 16px 캐릭터 대검 4포즈, 통통버섯 띄우기·바운드 | art, sprites, motion, refs/README | 승인 캡처(docs/refs/approved)와 같은 모습, 정수 배율에서 도트 깨짐 없음, 스타일리시 데모 수준의 대검 3연타 (motion-preview 포함) |
| M1 로컬 전투 | 혼자 이동·공격·스킬·백스텝, 몬스터 5종 AI, 경직·다운·슈퍼아머, HUD 아래 띠, 효과음(sfx-preview), data-validate·balance-check | combat, data, balance, hud, motion, audio | 1번 방을 혼자 클리어. 조작감 튜닝(balance 9장). 몬스터 피격 프레임(hurt, hurtAir), 대검·스태프 MVP 스킬 포즈(art.md 4장 MVP 표시), 캐릭터 이동·상태 모션(art.md 4장) 추가 — 미리보기 검토 후 반영 |
| M2 멀티플레이 | Colyseus 2인 동기화, 예측·보정, 지연 보정, 히트스톱 동기화 | network | 지연 100ms에서 이동 끊김 없음, 라인 판정 공정 |
| M3 던전 완성 | 1층 방 6개(Tiled), 웨이브, 보스, 귀환, 정산, 솔로 규칙, 접속 끊김 처리, BGM 재생(1층·보스 전환) | dungeon, hud, network 10장, audio 5장 | 1층 한 판 11~13분, 솔로·2인 클리어 |
| M4 섬·계정 | 계정, 섬 화면·배치 모드·잡화점·게시판·우물 출발, DB, 섬 BGM | island, hud 4·8장, security, db, art 6장, audio 5장 | 가입부터 섬 꾸미기·던전 출발·정산·복귀까지 한 바퀴 |
| M5 배포 | 개인 서버 배포 (Nginx, SSL, WebSocket 프록시), 백업 | security 5·6장 | 친구가 링크로 접속해 함께 플레이 |

---

## 3. 작업 단위 (한 세션 = 한 줄)

각 줄을 끝내면 확인 방법을 실행하고 커밋한다. 다음 마일스톤의 작업 단위는 그 마일스톤을 시작할 때 이 표에 추가한다. 끝난 마일스톤(M0~M4·MVP 보충 ST·SK)의 작업 표는 docs/changelog.md 끝으로 옮김.

### M5
| # | 작업 | 확인 |
|---|---|---|
| 5-1 | 프로덕션 빌드·실행: 클라이언트는 같은 주소로 접속, 서버 묶음(esbuild) + 정적 파일도 게임 서버가, 환경 변수 정리 | 로컬 프로덕션 모드로 가입→섬→던전 한 바퀴 |
| 5-2 | 보안 마감 (security.md 5장): Origin 제한(WebSocket·/api), 보안 헤더, 개발 명령 꺼짐 | 서버 테스트 + 응답 헤더 |
| 5-3 | 운영 도구 (security.md 6장): 매일 SQLite 백업 7일치, 관리자 명령(정지·해제·세션 종료·초대 코드) | 백업→복원, 관리 명령 테스트 |
| 5-4 | 배포 파일·문서: Nginx 서브도메인 설정 틀, systemd 유닛, 백업 cron, docs/deploy.md | 실제 배포 후 친구가 링크로 접속해 함께 플레이 |

### 스킬 카드 (CD, skills.md 1장)
SP·레벨 열림·계열 선택 → 카드팩으로 카드를 모으고 3장이면 강화(변형), 액티브 4칸·패시브 비용 한도, 계열 섞기·계열 보너스, 섬 카드 상점·팩 열기 연출. 읽을 문서: skills 1장, balance 7장 카드 경제, island 2·5장, data 10장, db, network 4장, hud 8장, audio 5장

| 단계 | 작업 | 확인 |
|---|---|---|
| CD-1 | 문서 개편 (skills 1장·balance·island·data·db·network·hud·audio·roadmap) | 문서 검토·승인 |
| CD-2 | 데이터·공용 로직: cards.json·packs.json·combat.json card, shared/src/cards/(팩 굴림·합치기·장착 검사·패시브 한도·계열 보너스·카드 빌드), passives 값 [기본, 강화], unlockLevel·SP 코드 뺌, 액티브 칸 4 | pnpm test·data-validate·balance-check |
| CD-3 | DB·서버: users.dust·cards·card_slots·card_pity, skill_nodes·skill_slots·sp·branch 지우는 마이그레이션 + 처음 카드·환영 선물, card 메시지(열기·지정 구매·갈기·변형·장착), 던전 빌드를 카드로, ADMIN 조각, 임시 연결(shared cards/interim.ts·server skillStore.ts·`skill` 메시지) 지움 | pnpm test·net-smoke·run-sim |
| CD-4 | 카드 창(K, 임시 스킬 창 stage/islandSkills.ts 대신)·던전 HUD A S D F 4칸 | 새 승인 데모 HTML → 반영 |
| CD-5 | 카드 상점 시설 그림·자리 + 카드 상점 화면·팩 열기·합치기 연출, 카드 테두리(티어·강화), palette.json global.ui.card 임시 색 확정 | sprite-preview·데모 HTML 승인 → 반영 |
| CD-6 | 효과음(팩 흔들기·찢기·뒤집기·티어 2·3 빛·공개·합치기·갈기·지정 구매) + 카드 상점 BGM(층 3겹) | sfx-preview·bgm-preview 승인 → 반영 |
| CD-7 | 가격·확률·한도·계열 보너스 조정 | run-sim·ttk-sim·실제 플레이 |
