# DB 테이블 (docs/db.md)

모든 테이블의 기준 문서. SQLite + Drizzle (server/src/db/). 저장 시점은 docs/network.md 11장, 보안 규칙은 docs/security.md.
MVP 열: O = MVP에 포함, — = MVP 이후.

| 테이블 | 컬럼 | MVP | 관련 문서 |
|---|---|---|---|
| users | id, nickname, nickname_key(중복 검사용: NFC + 소문자), password_hash, recovery_hash, failed_logins, locked_until, island_id, wallet, hair_style, hair_color, created_at | O | security, art |
| sessions | token_hash, user_id, created_at, expires_at, last_seen_at | O | security |
| auth_log | user_id(null 가능), ip, event, created_at (30일 보관) | O | security |
| islands | id, name, invite_code, treasury | O | island |
| placements | id, island_id, item_id, x, y, rotation, placed_by, communal(공동 금고 장식), placed_at | O | island |
| memos | id, island_id, user_id, text, created_at (게시판 메모 1줄, 최근 20개 표시) | O | island |
| island_storage | island_id, item_id, count (공용 창고: 공동 금고로 산 장식, 치운 공용 장식) | O | island |
| inventory | user_id, item_id, count (장식·재료·물약·의상) | O | island |
| activity_log | id, island_id, user_id, action, item_id, created_at | O | island |
| weapon_mastery | user_id, weapon, level, exp, sp | O | balance, skills |
| buildings | island_id, building_id, x, y, rotation, built_by, built_at | — | island |
| island_upgrades | island_id, upgrade_id, level | — | island |
| trophies | island_id, boss_id, first_cleared_by, cleared_at | — | island |
| equipment | user_id, slot, item_id (의상 장착, slot = hat/top/bottom/cape) | — | island, sprites |
| weapon_skins | user_id, skin_id (보유 무기 외형) | — | island, sprites |
| weapon_loadout | user_id, weapon, skin_id (무기 종류별 장착 외형) | — | island |
| boss_drop_pity | user_id, boss_id, kills_since_drop (천장 카운트) | — | island |
| skill_nodes | user_id, node_id, points, variant | — | skills |
| skill_loadout | user_id, weapon, slot, skill_id | — (MVP는 기본 스킬 고정 장착) | skills |

- 돈·재고 변경은 항상 트랜잭션
- 던전 진행 상태는 DB에 저장하지 않는다 (메모리)

## 구현
- 스키마 server/src/db/schema.ts, 열기 client.ts (`openDb`: WAL·외래 키·busy_timeout 5초, 시작할 때 마이그레이션 적용). 파일 위치 환경 변수 `DB_PATH` (기본 data/game.sqlite, 저장소에 넣지 않음)
- 시각은 ms 정수(Date.now()), 돈은 정수 코인
- 스키마를 고치면 `pnpm --filter @game/server db:generate --name <이름>` → src/db/migrations/ SQL 생성 (손으로 고치지 않음, 함께 커밋)
