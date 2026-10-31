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
| skill_window.html | 스킬 창 K (SK-6, 기준 = 시안 10): 계열 버튼(고른 계열 스킬만 보임)·액티브/패시브 탭·오른쪽 상세(포인트 −/+, 변형 카드, 패시브 포인트별 효과)·아래 U I O P 장착(끌어다 놓기)·레벨 잠금(자물쇠 + Lv). 아이콘 없는 스킬·패시브는 10×10 임시 그림, 패널 명암 색은 데모 안 값 (승인되면 palette.json). 데모용 레벨 막대는 게임에 없음. 글자는 client/public/fonts .bin (dev 서버 /@fs/ 경로로 열기) |
| character_expressions.html, character_outfit_layers.html, character_weapon_poses.html | 캐릭터 |
| floor1_monster_animations.html | 몬스터 동작 |

## tools/ 쪽 승인 원본 (도구를 만들 때 이 코드와 같은 결과가 나와야 함)
| 파일 | 내용 |
|---|---|
| tools/motion-preview/reference.html | 대검 3연타 스타일리시 모션 (docs/motion.md 기준 데모) |
| tools/sfx-preview/reference-action.html | 전투 효과음 (action 버스) |
| tools/sfx-preview/reference-clear.html | UI·보상 효과음 (clear 버스) |
| tools/bgm-preview/reference.html | BGM 3곡 (engine.js + bgm.json과 일치 검증됨) |
