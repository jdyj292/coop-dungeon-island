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
| floor1_room_hud_mockup.html | 1층 방 + HUD (전투 중 / 보스전 HUD / 방 클리어 전환) |
| island_screen_hud_mockup.html | 섬 기본 화면 / 배치 모드 |
| character_expressions.html, character_outfit_layers.html, character_weapon_poses.html | 캐릭터 |
| floor1_monster_animations.html | 몬스터 동작 |

## tools/ 쪽 승인 원본 (도구를 만들 때 이 코드와 같은 결과가 나와야 함)
| 파일 | 내용 |
|---|---|
| tools/motion-preview/reference.html | 대검 3연타 스타일리시 모션 (docs/motion.md 기준 데모) |
| tools/sfx-preview/reference-action.html | 전투 효과음 (action 버스) |
| tools/sfx-preview/reference-clear.html | UI·보상 효과음 (clear 버스) |
| tools/bgm-preview/reference.html | BGM 3곡 (engine.js + bgm.json과 일치 검증됨) |
