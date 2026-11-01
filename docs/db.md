# DB 테이블 (docs/db.md)

모든 테이블의 기준 문서. SQLite + Drizzle (server/src/db/). 저장 시점은 docs/network.md 11장, 보안 규칙은 docs/security.md.
MVP 열: O = MVP에 포함, — = MVP 이후.

| 테이블 | 컬럼 | MVP | 관련 문서 |
|---|---|---|---|
| users | id, nickname, nickname_key(중복 검사용: NFC + 소문자), password_hash, recovery_hash, failed_logins, locked_until, suspended_until(관리자 정지, 0 = 정상), island_id, wallet, dust(카드 조각, 무기 공용), hair_style, hair_color, weapon(고른 무기, 기본 greatsword, 0004_weapon), created_at | O | security, art |
| sessions | token_hash, user_id, created_at, expires_at, last_seen_at | O | security |
| auth_log | user_id(null 가능), ip, event, created_at (30일 보관) | O | security |
| islands | id, name, treasury, owner_id(섬 만든 사람 = 입장 신청 허용, 0005·0006, 초대 코드는 0007에서 뺌) | O | island |
| join_requests | user_id(PK, 섬 없는 계정당 하나), island_id, rejected(거절 알림용), created_at | O | island |
| placements | id, island_id, item_id, x, y, rotation, placed_by, communal(공동 금고 장식), placed_at | O | island |
| memos | id, island_id, user_id, text, created_at (게시판 메모 1줄, 최근 20개 표시) | O | island |
| island_facilities | island_id, facility_id (PK 둘), x, y (옮긴 시설 위치, 없으면 island.json 기본 칸, 0008) | O | island |
| island_storage | island_id, item_id, count (공용 창고: 공동 금고로 산 장식, 치운 공용 장식) | O | island |
| inventory | user_id, item_id, count (장식·재료·물약·의상) | O | island |
| activity_log | id, island_id, user_id, action, item_id, created_at | O | island |
| weapon_mastery | user_id, weapon, level, exp | O | balance, skills |
| buildings | island_id, building_id, x, y, rotation, built_by, built_at | — | island |
| island_upgrades | island_id, upgrade_id, level | — | island |
| trophies | island_id, boss_id, first_cleared_by, cleared_at | — | island |
| equipment | user_id, slot, item_id (의상 장착, slot = hat/top/bottom/cape) | — | island, sprites |
| weapon_skins | user_id, skin_id (보유 무기 외형) | — | island, sprites |
| weapon_loadout | user_id, weapon, skin_id (무기 종류별 장착 외형) | — | island |
| boss_drop_pity | user_id, boss_id, kills_since_drop (천장 카운트) | — | island |
| cards | user_id, card_id, count(보관 중인 기본 카드 장수), enhanced(0·1), variant(강화 액티브 변형, null = 기본). PK(user_id, card_id). 같은 카드 3장이 되면 서버가 바로 count −3·enhanced 1 | O (CD) | skills |
| card_slots | user_id, weapon, kind(active·passive), slot(액티브 0~3 = A S D F, 패시브 0~ 순서), card_id. PK(user_id, weapon, kind, slot). 행이 없는 무기는 기본 배치 (A S = 처음 카드). 바꿀 때는 그 무기의 액티브·패시브 행을 모두 다시 적음 | O (CD) | skills |
| card_pity | user_id, weapon, pack, opened(마지막 높은 티어 뒤로 연 팩 수). PK(user_id, weapon, pack). 천장 있는 팩만 | O (CD) | balance |
- 돈·재고 변경은 항상 트랜잭션 (카드팩: 코인·조각 빼기 + 카드 넣기 + 천장을 한 트랜잭션, 강화: 3장 빼기 + 강화 표시 + 끼운 패시브 한도 검사를 한 트랜잭션)
- 환영 선물 팩은 inventory item `cardpack_gift_1` (팩 1, 무기는 열 때 고름, 가방 목록에는 안 보임). 새 계정은 가입 트랜잭션에서 처음 카드·선물 (cardStore grantStarter)
- 카드 기록 초기화: 0012 skill_nodes·skill_slots·weapon_mastery.sp·branch 지움, 0013 카드 테이블, 0014(손으로 쓴 custom 마이그레이션) 그때 있던 모든 계정에 처음 카드·선물 팩 3개
- 던전 진행 상태는 DB에 저장하지 않는다 (메모리)

## 구현
- 스키마 server/src/db/schema.ts, 열기 client.ts (`openDb`: WAL·외래 키·busy_timeout 5초, 시작할 때 마이그레이션 적용). 파일 위치 환경 변수 `DB_PATH` (기본 data/game.sqlite, 저장소에 넣지 않음)
- 시각은 ms 정수(Date.now()), 돈은 정수 코인
- 스키마를 고치면 `pnpm --filter @game/server db:generate --name <이름>` → src/db/migrations/ SQL 생성 (손으로 고치지 않음, 함께 커밋). 테이블을 지우면서 새로 만들면 drizzle-kit이 이름 바꾸기를 물어 터미널 없이는 멈춤 → 지우기·만들기를 나눠 두 번 생성. 데이터만 옮기는 마이그레이션은 `pnpm --filter @game/server exec drizzle-kit generate --custom --name <이름>`으로 빈 파일을 만들어 SQL을 쓴다
