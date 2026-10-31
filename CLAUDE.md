# 협동 던전 + 공용 섬 꾸미기 웹게임 (가칭)

혼자 또는 친구 1~4명이 섬 아래 던전에서 몬스터를 기절시켜 코인·재료를 모으고, 함께 사는 공용 섬을 꾸민다.
던전은 구 던전앤파이터식 묵직하고 약간 답답한 2D 도트 액션(의도된 제약), 섬은 힐링. 피·잔혹 표현 없음.

## 기술 스택
- 클라이언트: Phaser 3 + TypeScript (Vite), 2D 도트, 정수 배율
- 서버: Node + Colyseus (TypeScript), 모든 판정은 서버 (server-authoritative)
- DB: SQLite (better-sqlite3, WAL) + Drizzle
- 맵: Tiled → JSON
- 그림·소리: 외부 에셋 없음. 스프라이트는 마스크 → 자동 음영, 효과음·BGM은 Web Audio 런타임 합성

## 좌표 규칙
- 로직: x = 좌우, y = 깊이, z = 높이. 단위 px, 1타일 = 16px
- 서버는 화면을 모른다. 화면 투영은 클라이언트에서만 (docs/art.md 1장)
- 캐릭터·몬스터는 좌우로만 바라봄

## 폴더
```
docs/                    설계 문서 (아래 문서 지도)
docs/refs/               승인 캡처·데모 (수정 금지, 목록은 docs/refs/README.md)
shared/src/              공용 코드: messages, movement, collision, actions, constants
shared/data/             게임 데이터 JSON — 수치는 여기서만 (docs/data.md)
client/src/scenes/       Boot, Island, Dungeon, 씬 전환
client/src/sprites/      마스크 합성 → 자동 음영 → 텍스처 캐시 (docs/sprites.md)
client/src/fx/           히트스톱, 흔들림, 스미어, 파티클, 도트 숫자, hitPackage
client/src/audio/        효과음(synth, buses, player), bgm/ (docs/audio.md)
client/src/net/          Colyseus 연결, 예측·보정·보간
client/src/ui/           HUD·패널 (캔버스 안 도트 UI, docs/hud.md)
client/data/palette.json 모든 색의 단일 출처
client/data/sfx.json     효과음 레시피 (승인)
client/data/bgm.json     BGM 레시피 (승인, 3곡)
client/data/sprites/     스프라이트 데이터 (승인 디자인, 임의 수정 금지)
client/public/           글꼴(갈무리, OFL 고지 포함), Tiled export
server/src/rooms/        IslandRoom, DungeonRoom
server/src/schema/       Colyseus 상태 스키마
server/src/systems/      combat, ai, spawn, reward
server/src/http/         인증 API (docs/security.md)
server/src/db/           Drizzle 스키마·마이그레이션 (docs/db.md)
maps/                    Tiled 원본 JSON 맵 (게임이 직접 읽음, docs/dungeon.md 10장)
tools/                   개발 도구 (아래 표)
deploy/                  서버 설치 파일: Nginx 틀·systemd·백업 cron·install.sh (docs/deploy.md 5장, 항상 LF)
```

### 도구 (tools/)
| 도구 | 상태 | 용도 |
|---|---|---|
| bgm-preview | 완성 | bgm.json 재생. reference.html = 승인 원본 |
| sprite-preview | 완성 | 스프라이트 조합·확대 보기, 승인 캡처 비교, HUD 아이콘 탭. `pnpm sprite-preview` |
| motion-preview | 완성 | 모션 슬로우·프레임 넘기기·값 조정 → JSON 복사, 승인 데모와 비교, 변형·보조 노드 고르기. `pnpm motion-preview` |
| sfx-preview | 완성 | 효과음 재생·조정 → JSON 복사, 승인 원본 나란히 듣기·자동 비교. `pnpm sfx-preview` |
| palette-check | 완성 | palette.json 색 규칙 검사 (art.md 8장). `pnpm palette-check`, 기준 rules.json |
| data-validate | 완성 | shared/data 형식·교차 참조 검사 (data.md 5장). `pnpm data-validate`, 기준 rules.json |
| map-gen | 완성 | 1층 방 Tiled 맵 초기 생성 + 편집용 타일셋 (dungeon.md 10장). `pnpm map-gen [--force]` |
| run-sim | 완성 | 봇으로 1층 한 판 (서버 규칙) 시간·클리어율·보상 (balance.md 10장). `pnpm run-sim --party 2 --runs 5 [--invincible]` |
| net-smoke | 완성 | 봇 2개로 서버 던전 방 접속 확인 (network.md 13장). `pnpm net-smoke` |
| balance-check | 완성 | 스킬 예산 자동 계산·±25% 경고 (balance.md 3장). `pnpm balance-check`, 기준 rules.json |
| font-gen | 완성 | 갈무리 BDF → 캔버스용 도트 글꼴 .bin (hud.md 7장). `pnpm font-gen <갈무리 dist 폴더>` |
| island-bot | 완성 | 봇 주민이 가입·섬 입장 신청 → 주인이 허용하면 입장해 걷기, `--well`이면 우물 대기 합류 → 함께 던전 (network.md 3·5장). `pnpm island-bot --island <섬 번호> [--well]` |
| deploy-build / deploy-local | 완성 | 배포 묶음 dist/ 만들기 / 이 PC에서 프로덕션 모드로 띄우기 (localhost:8080) (deploy.md). `pnpm deploy-build` · `pnpm deploy-local` |
| admin | 완성 | 관리자 명령: 계정 목록·정지·해제·세션 종료·온라인 백업 (deploy.md 6장). `pnpm admin <명령>`, 배포 `node admin.mjs` |
| ttk-sim | 완성 | 예상 처치 시간·목표 비교 (balance.md 5장). `pnpm ttk-sim --weapon greatsword --level 1` |

## 문서 지도 — 작업에 필요한 문서만 읽는다
| 작업 | 문서 |
|---|---|
| 지금 할 일·범위 | roadmap (마일스톤별 읽을 문서 표) |
| 사람 플레이 테스트 | playtest |
| 조작·판정·상태·연출 시간 값 | combat |
| 무기·스킬 | skills (계열 스킬은 MVP 이후) |
| 수치 공식·쿨타임·보상 | balance |
| 데이터 JSON 형식 | data (게임), sprites (그림), audio (소리) |
| 층·몬스터 행동·솔로 규칙·Tiled | dungeon |
| 그림 규칙·화면 구성·색 | art |
| 모션·타격 패키지·피격 반응 | motion |
| 효과음·BGM | audio |
| HUD·패널·채팅 | hud |
| 섬 규칙·가격 | island |
| 네트워크 | network |
| 계정·보안 / DB | security / db |
| 배포·운영 | deploy |
- 같은 정보는 한 문서에만. 문서와 다르게 결정하면 그 문서를 함께 고친다

## 작업 규칙
- 한 번에 한 작업. 세션 시작 시 roadmap에서 현재 마일스톤 행의 "읽을 문서"만 읽는다
- 3개 이상 파일을 고치거나, 새 기능이거나, 문서와 다르게 결정해야 하면 먼저 계획(바꿀 파일, 영향받는 문서, 확인 방법)을 제시하고 승인을 기다린다
- 그림·색·연출·소리 변경은 미리보기(sprite-preview, motion-preview, sfx-preview, bgm-preview)로 먼저 보여주고 승인 후 데이터에 반영
- 승인 원본(docs/refs/, tools/*/reference*.html)은 수정 금지. 구현 결과가 원본과 같아야 한다
- 설계와 다른 결정은 해당 docs 문서를 함께 고친다 (코드만 바꾸지 않는다)
- 큰 JSON은 통째로 읽지 말고 필요한 키만 뽑아 본다 (jq·grep). client/data/sprites/monsters.json(40KB)은 읽기 금지
- 데이터 검증은 tools/의 스크립트로 (직접 눈으로 대조하지 않는다)
- 작업이 끝나면: 바뀐 파일, 직접 확인하는 방법, 고친 문서를 3~5줄로 요약하고 아래 "현재 상태"를 3줄 이내로 갱신

## 핵심 게임 규칙
- 한 판 10~15분: 방 5개 + 보스 방, 몬스터를 모두 기절시키면 다음 문이 열림. 3번째 방 뒤 귀환 지점
- 전멸: 이번 판 코인 50% 손실, 재료 유지. 정산: 코인 30% 공동 금고, 70% 개인 지갑
- 물약은 섬 상점에서 구매, 던전 반입 개수 제한. 섬은 주민 누구나 꾸미는 공용 공간

## 방 구조
- IslandRoom: 섬당 하나. 장식 배치는 서버가 순서대로 처리 → 같은 칸 충돌은 먼저 온 요청만 성공
- DungeonRoom: 출발 시 생성, 정산 후 삭제 (흐름은 docs/network.md 3장)

## 코딩 규칙
- 파일은 역할별로 작게 (300줄 이하)
- 공용 타입·메시지·이동·충돌·행동 계산은 shared/에, 클라이언트·서버가 같은 함수 사용
- 수치는 shared/data, 색은 palette.json, 소리는 sfx.json·bgm.json에서만 읽는다 (하드코딩 금지)
- 클라이언트는 입력만 보내고 결과는 서버에서 받는다
- 사용자 입력은 텍스트로만 표시 (innerHTML 금지), DB 쿼리는 매개변수 바인딩

## 개발 순서 (상세: docs/roadmap.md)
- [x] M0 스타일 테스트
- [x] M1 로컬 전투
- [x] M2 멀티플레이
- [x] M3 던전 1층 완성
- [x] M4 섬·계정
- [ ] M5 배포

## 현재 상태
- M0~M4 완료. M5 5-1(프로덕션 빌드 dist/), 5-2(Origin 제한·CSP), 5-3(관리자 명령·온라인 백업), 5-4(deploy/: Nginx 틀·systemd·백업 cron·install.sh·coop-admin, docs/deploy.md 5장), 섬 목록·입장 신청(초대 코드 없앰, 섬 주인이 게시판 주민 탭에서 허용, 섬 주민 10명·던전 파티는 4명, island.md 7장), 숙련도 ATK 반영, 던전 말풍선, 보스 한글 이름, 볼륨 설정(Esc 설정 패널), 이모트 1~4, 머리 모양·머리색(설정 외형 탭), 섬 걷기 다리 떨림(고주사율) 수정, 회피(백스텝 → 방향키 쪽, 쿨 0.6초)·지구력(회피·달리기 소모, HUD 바), 난이도 1단계(웨이브 하나로·몬스터 이동 +40%·공격 범위 확대·플레이어 −20%·근접 역경직), 2단계(피격 넉백), 3단계(몬스터 퍼지기·대각선 조준), 2차 튜닝(바로 덤벼듦·포자꽃 사거리 224·버섯 박치기 28px·둘레에서 기다리기, run-sim 무적 2인 약 8분), 대시 역경직 보정, 회피 개선(앞회피 예측 수정·지구력 17.5)·대검 평타 전진·대시 후딜 0.55, 대검 평타 타마다 다른 포즈(2타 draw→sweep, 3타 heave→rise), 회피는 행동 후딜레이(recovery)에서만·바로 끊음, 평타 전진 각 타 끝 0.15초 전 멈춤, 포자꽃 비스듬히 조준, 대검 3타 띄우기·평타 중 방향 전환 불가, 위아래·대각선 회피(깊이 24px), 섬 배치 모드 마우스 커서는 시야 고정(키보드 커서만 카메라 추적), 온라인 회피 끝 앞으로 당겨짐 수정(서버 dodgeStart), 온라인 대시 적중 뒤로 당겨짐 수정(플레이어 시작 시각 1ms 단위), 던전 아래 HUD 묶음형(상태·스킬·소지품 묶음 3개, 반투명, 승인 데모 hud_bottom_cluster.html), 섬 아래 HUD·배치 모드 띠 묶음형(island_hud_cluster.html, B 울타리·M 그림이 키 글자 안 가림), 섬 카메라 세로 추적(몸 가운데 기준·데드존 ±12), 달리기 유지(위아래만 눌러도 달림, 대시 공격은 좌우를 누를 때만), 근접 역경직 양쪽(맞은 몬스터도 히트스톱 × 2)·솔로 토큰 간격 0.6초, 통통버섯 박치기 예고 0.8초, 온라인 적중 직후 회피 거절(제자리 점프) 수정(서버 회피 보관), 섬 꾸미기(접속은 남쪽 선착장·던전 복귀는 우물 앞, 가장자리 숲 겹치기, 새 섬 기본 장식, 얼룩 잔디) 완료, 우물 입장 개편(섬: 던전 입구 우물 그림·우물로 뛰어들기·우물에서 튀어나오기 / 던전 1번 방 "우물 밑 숲": 흙 천장·밧줄·빛줄기, 우물에서 떨어져 착지(서버 arrive 0.5초 조작 불가·무적), 버섯 잠든 채 시작(wakeSec 1.5초, 맞으면 그 버섯만 깸) / 효과음 wellJump·wellLand·monWake, run-sim 봇 장애물·방 끝 고침) 완료, 우물에 뛰어든 뒤 원래 자리에 캐릭터가 다시 보이던 문제 수정, 던전 배경 숲으로(벽돌·돌 타일·흙 천장·뿌리·밧줄 → 나무줄기·둥근 덤불·풀밭·햇빛 얼룩·잎 덮개, art.md 6장), 섬 구름 그림자(뭉게구름 윤곽·가로로만 천천히, islandSky.ts·fx.json islandSky, 햇빛 효과는 검토 후 뺌), 섬 건물 입체감(정면형 좌우 대칭: 공용 창고 지붕 윗면·처마 그늘·들어간 문·양옆 창, 잡화점 안쪽 뒷벽·진열대 윗면)·섬 사물 땅 그림자(castShadow.ts, fx.json islandShadow), 스태프 마법 이펙트 다듬기(색 단계·바둑판 사라짐·준비 모으기·도는 마법진·구슬 마법탄, spellDraw·spellFire·spellIce 분리), 시설 옮기기(우물 빼고 주민 누구나 배치 모드에서, 섬마다 DB island_facilities, island.md 2장), 무기 고르기를 우물 패널 → 가방 장비 탭으로(hud.md 8장), 스킬 포인트 SK-1(기본 스킬 1~3포인트·레벨 배율·변형 택1·초기화, SP = 숙련도 레벨 − 1, 가방 스킬 탭, DB skill_nodes, 변형 특수 판정 재입력·후속·반복·해제·감속, skills.md 1·7장), 개발 테스트 계정 ADMIN(섬 입장마다 Lv20·지갑 99,999, production 꺼짐, playtest.md 1장), 대검 이펙트 개선(2타 가로베기·3타 올려베기 궤적 추가, 궤적 유지 등급별, 대지가르기 땅 균열·링·먼지, 대시 찌르기 5줄·출발 먼지, art.md 7장·motion.md 2장), 스킬 창 분리(K, 무기별 탭, 가방은 장비·장식·물약·재료)·설명 상자(skills.json desc, hud.md 8장), 섬 HUD 처음 하는 사람용(아래 띠는 가운데 버튼 묶음 하나: 16px 칸·그림 망치/배낭/별/게시판·키 꼬리표(island_hud_icons.html A)·마우스 이름표, Esc 설정 도움말 탭(섬·던전), 돈은 가방 아래 상자, 얼굴·지갑 묶음·주민 목록·시설 이름표·우물 화살표 뺌, 승인 데모 island_hud_help.html), 카메라 멀리(내부 288×162 → 384×216, 1920px 창 6배 → 5배, 던전 전투 구역 세로 가운데, art.md 1장), 던전 방 크게(가로 ×4/3·깊이 11~14타일, FIELD_BOTTOM 190, 화면 높이 186 미만 배율 안 씀·낮으면 맨 위 장식 자름, 깊이 이동 +25% 40/76, 섬 입장 때 카메라가 내 캐릭터 가운데로 바로(로직 좌표를 화면 좌표로 착각하던 버그, 접속·내 주민 상태 도착 전에는 어둡게 가렸다가 맞춘 뒤 0.25초 밝힘), 맵 비율 이동, run-sim 봇 12초 못 잡으면 목표 바꿈, 무적 2인 약 8분, dungeon.md 5·10장), 변형 연출(동토 장판·감속 몬스터 발밑 눈송이(서버 slowed), 부채꼴 균열 5줄, 검풍 등 뒤 스미어, motion-preview 변형 고르기, art.md 7장), SK-2 1차 계열 1단계 액티브 8개+변형 16개(0포인트 시작·같은 단계 택1·O/P 슬롯, 새 판정 다단·슈퍼아머·hold·pull·벽꿍·여러 줄·연발·반복 이동, 연출·아이콘은 기존 재사용·임시, skills.md 1장·roadmap SK-2), SK-2 2a 계열 스킬 연출(회전 고리·속도선·발도 섬광·초승달 검기·얼음 창·불기둥·부유 구슬·끌어올림, fx.json branch, 온라인 bolt에 speed·r 추가로 계열 투사체도 보임, art.md 7장), SK-2 2b 계열 스킬 효과음 8개(skill_whirl·shoulder·wave·draw·pillar·icelance·orb·lift, audio.md 3장), SK-2 2c O·P 아이콘 8개(hud_icons.json, sprite-preview HUD 탭 J U I O P) → SK-2 2차 완료, SK-2 3차 계열 1단계 보조 노드 8개(passives.json·passives.ts, 같은 계열 보조 택1·1포인트, 스킬 창 "보조 이름 N/1", 무거운 손 = 충전 전 대체(스킬 준비 ×0.77·시전 중 피해 −30%), 가벼운 발 쿨 −0.2초, skills.md 1~3·7장), SK-3 1차 대검 충전(스킬 키 누르고 있기 → 준비 끝에서 최대 1초, 피해·범위 최대 +50%, 충전 중 슈퍼아머, 무거운 손 원래 효과 충전 속도 +30%·충전 중 피해 −30%, charge.ts, 온라인 chargeRelease, skills.md 2장), 보조 노드 연출(연소 = 머리 위 불꽃·떠오르는 불씨, 무중력 = 몸 둘레 도는 반짝이, fx.json spell.burning·weightless, 서버 burning·weightless, motion-preview 보조 고르기, art.md 7장), SK-4 1차a 계열 2단계(같은 계열 1단계 3포인트에서 열림·조건 깨지면 자동 지움·SP 반환, 슬롯 장착 U I O P(스킬 창 Enter·장착 버튼, DB skill_nodes.slot, 마이그레이션 0010), 지진·회오리 검기·중력 우물·중력장(부양장), 감속은 공격 쿨·쉬는 시간도 늦춤, skillLoadout.ts, skills.md 1·2·3장), SK-5 공용 패시브(스킬 캔슬 1~3 = 스킬 후딜레이 → 다른 스킬, 이은 스킬 준비 ×1.5/1.3/1.15 · 기상 회피 1 = 다운 중 회피 키로 기상, passives.json weapon "*" → 무기마다 greatsword.cancel 등, 스킬 창 맨 위, skills.md 1장), SK-6 1차 스킬 개편 규칙(단계·택1 없앰 → 숙련도 레벨로 열림·무기마다 계열 하나 선택·계열마다 장착 기억 skill_slots·SP로 액티브 2·3포인트·패시브 1~3포인트 포인트별 값·변형은 열리면 바로, 던전은 출발 때 effectiveBuild, 마이그레이션 0011, skills.md 1장, 승인 데모 skill_window.html), SK-6 2차 트리형 스킬 창(계열 버튼·액티브/패시브 탭·상세·끌어다 장착·키보드, ui/skillWindow.ts·skillDetail.ts·skillParts.ts, 상태 stage/islandSkills.ts, 임시 그림 hud_icons.json glyphs, 색 palette global.ui.skill*, hud.md 8장), SK-6 3차 정식 16×16 아이콘 14개(계열 2단계 액티브 4·보조 8·공용 2, hud_icons.json slots, 안 배운 패시브 회색, 임시 그림 glyphs 없앰, sprite-preview HUD 탭 초안은 스킬 창 22px 칸·회색으로도 보임, hud.md 2·8장)
- 명령: `pnpm dev`(첫 화면 = 로그인, 개발 ?room=1~6, ?online=1&party=2&lag=100, ?weapon=staff, ?skills=gs_launch:3:double, ?drafts=1, ` 키 패널) / `pnpm test` / `pnpm typecheck` / `pnpm run-sim` / `pnpm net-smoke` / `pnpm map-gen` / `pnpm palette-check` / `pnpm data-validate` / `pnpm balance-check` / `pnpm ttk-sim` / `pnpm sprite-preview` / `pnpm motion-preview` / `pnpm sfx-preview` / `pnpm font-gen` / `pnpm island-bot` / `pnpm --filter @game/server db:generate`
- 다음: SK-4 1차b(대검 투척·승천검·번개 연쇄·화염구·가속장 새 판정). 또는 실제 배포 (docs/deploy.md 5장 순서) → 친구 접속 확인. MVP 빈 곳 없음
