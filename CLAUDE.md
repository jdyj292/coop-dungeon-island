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
maps/                    Tiled 원본 (docs/dungeon.md 10장)
tools/                   개발 도구 (아래 표)
```

### 도구 (tools/)
| 도구 | 상태 | 용도 |
|---|---|---|
| bgm-preview | 완성 | bgm.json 재생. reference.html = 승인 원본 |
| sprite-preview | M0 | 스프라이트 조합·확대 보기 |
| motion-preview | M0 | 모션 슬로우·프레임 조정 (reference.html = 승인 데모) |
| sfx-preview | M1 | 효과음 재생·조정 (reference-*.html = 승인 데모) |
| palette-check | M0 | palette.json 색 규칙 검사 (art.md 8장) |
| data-validate | M1 | shared/data 교차 참조 검사 (data.md 5장) |
| balance-check, ttk-sim | M1 | 스킬 예산·처치 시간 (balance.md 10장) |

## 문서 지도 — 작업에 필요한 문서만 읽는다
| 작업 | 문서 |
|---|---|
| 지금 할 일·범위 | roadmap (마일스톤별 읽을 문서 표) |
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
- [ ] M0 스타일 테스트
- [ ] M1 로컬 전투
- [ ] M2 멀티플레이
- [ ] M3 던전 1층 완성
- [ ] M4 섬·계정
- [ ] M5 배포

## 현재 상태
- 설계 문서·게임 데이터·스프라이트 데이터·효과음·BGM(엔진 포함) 완료. 코드는 아직 없음
- 다음: M0 — 프로젝트 뼈대(Vite + Phaser + TS, pnpm 워크스페이스) → 스프라이트 생성기 → sprite-preview
