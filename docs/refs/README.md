# 기준 자료 (docs/refs)

대화에서 검토·승인된 원본. **수정 금지.** 이미지는 토큰을 많이 쓰므로 그 작업에 필요할 때만 연다.
그림 세부가 데이터(client/data/sprites/*.json)와 다르면 **데이터가 우선**이다. 데이터는 승인 후 고친 내용까지 반영돼 있다.

## approved/ — 캡처 (PNG)
| 파일 | 내용 | 쓰는 때 |
|---|---|---|
| dungeon_room_hud.png | 1층 방 화면 + 아래 HUD 띠·파티 프레임·콤보 | M0 화면, M1 HUD |
| island_hud.png | 섬 화면 + 섬 HUD | M4 |
| character_expressions.png | 16px 캐릭터 색·표정 3종 | M0 |
| character_outfits.png | 의상 레이어 4세트 | M0 |
| character_weapon_poses.png | 무기 4종 포즈 | M0 |
| floor1_monsters.png | 1층 몬스터 5종 동작 프레임 | M0, M1 |
| greatsword_motion.png | 대검 3연타 기본 vs 스타일리시 | M0 모션 |

## demos/ — 원본 데모 (HTML, 브라우저로 열어 움직임 확인)
| 파일 | 내용 |
|---|---|
| floor1_room_hud_mockup.html | 1층 방 + HUD (전투 중 / 보스전 HUD / 방 클리어 전환). 아래 띠는 예전 통짜 띠 |
| hud_bottom_cluster.html | 던전 아래 HUD 묶음형 (현재 vs 묶음형 비교, 기준 = hudBottomDraft) |
| island_screen_hud_mockup.html | 섬 기본 화면 / 배치 모드. 아래 띠는 예전 통짜 띠 |
| island_hud_cluster.html | 섬 아래 HUD 묶음형 (기본 화면·배치 모드, 현재 vs 묶음형 비교, 기준 = placeDraft. 기본 화면은 island_hud_help.html이 대체) |
| island_hud_help.html | 섬 HUD 처음 하는 사람용 (기준 = helpDraft): 작은 아래 띠(얼굴 14·버튼 B I K M 14), 알림 점, 버튼 이름표, 우물 화살표, Esc 도움말 탭(섬·던전), 가방 아래 돈 상자. 알림 점·시설 이름표·우물 화살표·얼굴 묶음은 승인 뒤 뺌, 버튼 그림은 island_hud_icons.html로 바뀜 (hud.md 8장). 지갑·금고 묶음과 주민 목록 없음. 글자는 client/public/fonts .bin (dev 서버 /@fs/ 경로로 열기) |
| island_hud_icons.html | 섬 아래 띠 버튼 비교 (현재 / A / B, 기준 = optA): 16px 칸, 12×12 그림 B 망치·I 배낭·K 별·M 게시판, 키는 왼쪽 아래 꼬리표, 묶음은 화면 가운데 |
| card_window.html | 카드 창 K (CD-4): 위 장착 줄(액티브 A S D F · 패시브 비용 막대·칸) · 계열 보너스 줄 · 보유 카드(줄 = 기본/A/B, 티어 짝, 카드 24×29 티어 테두리·별·보유 점·강화 금테·남는 장수·그림자·자물쇠) · 오른쪽 상세(변형·기본/강화 효과·갈기·끼우기) · 아래 캔버스 = 던전 아래 HUD 지금(6칸) vs 시안(4칸, 기준 = 시안). 데모용 숙련도 막대·+1장 버튼은 게임에 없음, 임시 팩 열기 버튼은 데모에 없음(게임은 CD-5까지 제목 띠에). 글꼴·데이터는 파일 안에 넣어 따로 열어도 됨 |
| card_shop.html | 카드 상점 화면 (CD-5, 섬 카드 상점 E): 천막 띠·탁자·왼쪽 판·펠트 매트, 카드팩 탭(팩 고르기·선물/코인/조각) · 팩 열기(떨어짐·흔들림·찢김·뒷면 빛·뒤집기 티어 1~3·NEW·합치기·변형 고르기·한 팩 더) · 지정 구매 탭 · 카드 테두리 비교(기준 = B: 1 은 · 2 파랑 · 3 보라, 금색 = 강화). 매트 오른쪽 위 음악 글자·데모 조작 줄(다음 팩 결과·숙련도·선물 +3)은 게임에 없음. 글꼴·데이터는 파일 안에 넣어 따로 열어도 됨 |
| card_tall.html | 카드 24×34 (카드 창·카드 상점): 몸통 = 위 아이콘 칸 + 아래 9줄 티어 띠(띠 색 = 티어 색, 3×5 숫자), 강화 = 띠 숫자 뒤 + 만(별·반짝임·금 모서리 없음), 계열 테두리 5종 · 티어 1~10 · 카드 창 줄 40 간격 · 큰 카드 48×68(아이콘 칸·이름·13줄 띠) · 장착 칸 강화 = 오른쪽 아래 + 판. 큰 카드 이름은 브라우저 글꼴(게임은 갈무리7). card_redesign.html의 카드 크기·티어 표시·강화 표시보다 우선 |
| card_redesign.html | 카드 개편 (카드 창 K·카드 상점 카드 모양·글자 크기): 계열 테두리(기본·공용 강철 / 대검 A 파쇄 돌 / B 검기 사선·칼끝 / 스태프 A 원소 불꽃 / B 중력 이중 테두리·별), 티어 = 별 개수만, 강화 = 이름 뒤 금색 + · 빛줄기·반짝이는 별(카드 창·상점만, 던전 HUD 표시 없음), 직접 강화(3장 모이면 금색 ▲ · 상세 강화 (U) 버튼 · 번쩍 + 조각), 간단한 카드 창(칸 = 아이콘·테두리·별·꼬리표, 보유·남는 장수·잠금 Lv·변형·비용 막대는 상세에만, 계열 보너스 한 줄), 창 안 글자 모두 갈무리7, 섬 패널·알림·이름표 갈무리9 → 7 비교. card_window.html의 카드 모양·보너스 줄·보유 표시와 card_shop.html의 카드 테두리(티어 색·금테)·팩 열기 합치기보다 우선. 데모 조작 줄은 게임에 없음 |
| skill_window.html | 옛 스킬 창 K (SK-6, card_window.html이 대체, 기준 = 시안 10): 계열 버튼(고른 계열 스킬만 보임)·액티브/패시브 탭·오른쪽 상세(포인트 −/+, 변형 카드, 패시브 포인트별 효과)·아래 U I O P 장착(끌어다 놓기)·레벨 잠금(자물쇠 + Lv). 아이콘 없는 스킬·패시브는 10×10 임시 그림(게임은 hud_icons.json glyphs), 패널 명암 색은 게임에서 palette.json global.ui.skill*. 게임 창에는 아직 없는 스킬("준비 중" 칸)은 넣지 않음. 데모용 레벨 막대는 게임에 없음. 글자는 client/public/fonts .bin (dev 서버 /@fs/ 경로로 열기) |
| character_expressions.html, character_outfit_layers.html, character_weapon_poses.html | 캐릭터 |
| floor1_monster_animations.html | 몬스터 동작 |

## tools/ 쪽 승인 원본 (도구를 만들 때 이 코드와 같은 결과가 나와야 함)
| 파일 | 내용 |
|---|---|
| tools/motion-preview/reference.html | 대검 3연타 스타일리시 모션 (docs/motion.md 기준 데모) |
| tools/sfx-preview/reference-action.html | 전투 효과음 (action 버스) |
| tools/sfx-preview/reference-clear.html | UI·보상 효과음 (clear 버스) |
| tools/bgm-preview/reference.html | BGM 3곡 (engine.js + bgm.json과 일치 검증됨) |
