# 스프라이트 데이터 형식 (docs/sprites.md)

client/data/sprites/의 JSON 형식과 합성 절차의 기준 문서.
그림의 방향(비율, 의상 원칙, 음영 규칙, 이펙트 모양)은 docs/art.md. 색 값은 client/data/palette.json.

---

## 1. 파일 구성

| 파일 | 내용 | 상태 |
|---|---|---|
| materials.json | 마스크 글자 → 색 연결 | 확정 |
| character/base.json | 기본 몸(머리 피부, 스카프), 표정 3종, 머리 모양 3종, 어깨·손 기준점, 레이어 순서 | 확정 |
| character/outfits.json | 의상 아이템(슬롯별)과 세트 | 확정 |
| weapons_visual.json | 무기 외형 프로필 | 확정 |
| poses.json | 무기 종류별 포즈(손 위치, 무기 방향, 이펙트), 걷기 순환 | 확정 |
| monsters.json | 몬스터 스프라이트 (1층 다섯 종) | 확정 |
| props.json | 환경 소품 (장애물·문·귀환 고리·보물상자, 11장) | 확정 (3-2 승인) |
| island.json | 섬 사물 (시설·장식·배경, 12장) | 확정 (승인 데모에서 옮김 + 4-4 초안 승인) |

- "확정" 데이터는 검토를 거친 디자인. 수정하면 docs/refs/approved/ 캡처와 비교 검토
- 확정 데이터는 이 문서의 합성 절차로 승인 디자인과 픽셀 단위로 일치함을 검증함

---

## 2. 마스크

- 마스크 = 문자열 배열. 한 글자 = 한 픽셀
- `.` 빈칸(아래 층이 보임), `_` 지우기(아래 층을 빈칸으로 만듦, 예: 모자가 머리 삐침을 지움)
- 그 외 글자는 materials.json에 정의된 재질
  - shaded: 음영 대상 재질. 값은 palette.json 경로, 또는 특수값 `$hairColor`(선택한 머리색), `$playerColor`(플레이어 색)
  - fixed: 음영 없는 고정색 (눈 E, 볼터치 B, 입 M)
- 같은 재질이라도 글자가 다르면 경계로 취급되어 음영이 갈린다 (예: 모자 H와 로브 R은 같은 색이지만 다른 글자)
- 새 재질은 materials.json과 palette.json(global.materials)에 함께 추가

---

## 3. 좌표

- 모든 캐릭터 데이터는 **기본 상자** 기준: 가로 12 × 세로 17, (0,0) = 왼쪽 위, 0행 = 머리 위 삐침 줄
- 발밑 중앙 = (6,16). 화면에 그릴 때 이 점을 캐릭터 위치에 맞춘다
- 오른쪽을 보는 기준으로 정의. 왼쪽은 합성 결과를 좌우 반전
- 파츠의 offset = 기본 상자 기준 그 파츠 마스크의 왼쪽 위 좌표 (음수·상자 밖 허용)

---

## 4. 파츠와 레이어

```json
{ "layer": "hat", "offset": [-1, -3], "rows": ["...", "..."] }
{ "layer": "bottom", "offset": [0, 14], "frames": { "stand": [...], "walkA": [...], "walkB": [...] } }
```
- layer: 그리는 순서를 정함. 순서는 base.json `layerOrder`:
  weapon_back → cape → back_arm → bottom → top → neck → head → face → hair → hat → shoulder → weapon → front_arm
  (앞팔·손이 무기를 덮는다: 무기를 쥔 손이 보이고, 대검 손잡이 끝은 소매 아래로 숨음. 승인 데모와 같은 순서)
- 같은 층 안에서는 목록 순서대로
- frames가 있는 파츠는 현재 걷기 프레임의 rows를 쓴다 (stand / walkA / walkB)

### 기본 몸 (base.json)
- parts: 머리 피부(head), 스카프(neck)
- faces: normal / hurt / smile — face 층
- hairStyles: short / ponytail / spiky — hair 층 (여러 파츠 가능)
- shoulders, defaultHands: 팔 그리기 기준점

### 의상 아이템 (outfits.json)
```json
"top_armor": { "slot": "top", "name": "기사 갑옷", "sleeve": "A",
  "parts": [ {"layer":"top", ...}, {"layer":"shoulder", ...} ] }
```
- slot: hat / top / bottom / cape (슬롯당 하나만 착용)
- sleeve: 상의만. 팔 소매에 쓰는 재질 글자
- 한 아이템이 여러 층에 걸칠 수 있다 (갑옷의 어깨 보호대는 스카프 위에 그려야 해서 shoulder 층)
- sets: 미리 정의한 조합 (beginner, wizard, rogue, knight)

---

## 5. 팔과 무기

### 팔
- 팔은 마스크가 아니라 포즈 데이터로 그린다
- 어깨(shoulders)에서 손 위치까지 소매 재질로 잇고(대각선 우선, 최대 6칸), 손 픽셀은 피부(s). 상의가 없으면 소매도 피부(s)
- 건틀릿(gauntlet: true)이면 손 대신 2×2 덩어리: (x..x+1, y−1..y). 재질은 무기 외형의 gauntlet.mat
- detached: true면 어깨에서 잇지 않고 손(또는 건틀릿)만 그린다 (몸 앞으로 나온 뒷손 → front_arm 층)
- back: null이면 뒷팔을 그리지 않는다

### 무기 외형 (weapons_visual.json)
```json
"greatsword_basic": { "type": "greatsword", "parts": [
  {"at":-1,"mat":"y"}, {"at":1,"mat":"G"}, {"at":2,"mat":"y","width":3},
  {"from":3,"to":12,"mat":"m","width":2}, {"at":13,"mat":"m"} ] }
```
- 손에서 무기 방향(dir)으로 뻗는 1차원 프로필. at / from~to = 손으로부터 칸 수 (음수 = 반대쪽)
- width: 홀수는 가운데 정렬로 무기 방향에 수직(대각선이면 반대 대각선, 예: 대검 가드). 짝수는 기본선 + 한쪽 — 곧은 방향이면 수직 이웃, 대각선이면 가로 이웃(+x) 칸을 한 칸 더(폭 2 → 줄마다 3칸) 채워 곧은 방향과 같은 두께로 보이게 (예: 대검 날)
- 파츠는 목록 순서로 그려 뒤 파츠가 앞 파츠를 덮는다
- block: 끝에 붙는 정사각 덩어리 (스태프 보석). 그 칸에서 +x·+y로 펴되, 무기 방향이 음수인 축은 반대쪽으로
- 같은 종류의 다른 디자인 무기는 프로필만 추가
- diagFrom: 대각선 방향이면 손에서 이 칸 뒤로는 거리를 1/√2로 줄여(반올림, 겹치는 칸은 하나로) 곧은 방향과 같은 길이로 보이게 한다. 대각선 날이 1.4배 길어 막대처럼 보이던 문제 (대검 2)
- 프로필 추가 필드: `source` (base / craft / boss / recolor), `floor`, `smearColor`(보스 외형, palette 경로), `recolorOf`+`materials`(색 변형: 원본 프로필 + 재질 덮어쓰기)

### 포즈 (poses.json)
```json
"slash": { "front": {"hand":[10,11]},
  "weapons": [ {"hand":"front","dir":[1,0]} ],
  "fx": {"type":"smear","pivot":[9,11],"r":[9,14],"arc":[-1.7,0.35]} }
```
- dir: 8방향만 ([±1,0], [0,±1], [±1,±1])
- body: 몸 전체 변화 (art.md 4장 "몸 자체가 달라지는 경우") `{ bob?, legs?, lean? }` — bob = 다리를 뺀 몸을 내리는 px(웅크림), legs = 다리(bottom) 프레임 이름, lean = 다리를 뺀 몸을 앞(+)·뒤(-)로 px(모션 lean이 있으면 모션 우선). 걷기 bob과 더해진다
- 두 손으로 쥔 느낌은 뒷손을 detached로 앞손 근처에 둔다 (팔은 어깨에서 최대 6칸이라 머리 위로는 못 올림)
- behind: true면 weapon_back 층 (몸 뒤에 그림)
- origin: 손 대신 무기 시작점 지정 (광역 시전의 세운 스태프)
- fx: 공격 순간 이펙트. smear(pivot, 반지름 r, 각도 arc, reverse), spark, bolt, circle, lines, throw. 모양은 art.md 7장
- 행동과 포즈 연결은 행동 데이터에 적는다: `"poses": {"windup":"ready","active":"slash","recovery":"slash"}` (weapons.json, skills.json)
- 걷기: bottom 프레임을 poses.json walk.cycle 순서로 순환. walk.bob = 박자별로 bottom 층을 뺀 나머지(몸·팔·무기)를 내리는 px. walk.pxPerBeat = 이동 거리 몇 px마다 한 박자 넘기는지(시간이 아니라 거리 기준이라 발이 미끄러져 보이지 않음). 박자 → 프레임·내림은 compose.ts walkStep
- 이동·상태 모션 (art.md 4장, 1-8c 확정): poses.json `motions` = 무기와 상관없는 몸 변화 `{ legs?, bob?, lean?, face?, weaponPose?, lie? }`
  - legs = 다리(bottom) 프레임, bob = 다리를 뺀 몸 내림 px, lean = 다리를 뺀 몸을 앞(+)·뒤(-)로 px, face = 표정, weaponPose = 그동안의 무기 포즈
  - lie = 누움 (back 뒤로 / front 엎드림): 합성한 재질 격자를 90° 돌린 뒤 음영을 입힌다 (빛이 다시 왼쪽 위 → 회전한 그림과 달리 음영이 맞음). 누우면 무기는 그리지 않음. 발밑 = 누운 몸 아래 가운데 (compose.ts lieDown)
  - 새 다리 그림 없이 기존 프레임(stand·walkA·walkB)과 내림·기울이기로 표현한다. 모션 고르기는 client/src/view/playerView.ts, 시간 값은 fx.json playerMotion

---

## 6. 몬스터 (monsters.json)

몬스터는 의상 조합이 없으므로 **프레임마다 완성된 재질 격자**를 저장한다 (레이어 합성 없음).

```json
"boar": {
  "materials": { "b": "floors.1.monster.boar", ... },
  "fixedExtra": { "n": "..." },
  "frames": {
    "idle1":  { "rows": [...], "foot": [8, 11] },
    "windup": { "rows": [...], "foot": [8, 11], "shake": true, "fx": [ {"type":"dust","at":[8,0]} ] },
    "charge": { "rows": [...], "foot": [8, 11], "fx": [ ... ] }
  },
  "states": { "idle": ["idle1","idle2"], "move": ["walk1","walk2"],
              "windup:boar_charge": "windup", "active:boar_charge": "charge", "recovery:boar_charge": "idle1",
              "selfStun": "dizzy" }
}
```

| 필드 | 설명 |
|---|---|
| materials | 이 몬스터의 재질 글자 → palette 경로 (materials.json의 공용 정의보다 우선) |
| fixedExtra | 이 몬스터만 쓰는 고정색 글자 (예: 이끼곰 코, 혀) |
| frames.rows | 재질 격자. 오른쪽을 보는 방향 |
| frames.foot | 발밑 기준점 (격자 좌표). 화면의 몬스터 위치에 맞춘다 |
| offset | 그릴 때 추가로 옮기는 양 (튀어오름 [0,−3], 앞으로 기울기 [3,0]) |
| shake | 그리는 동안 좌우 1px 떨림 (예고 동작) |
| spin | 90°씩 돌려 그림 (1/8초마다). 구르기. 회전 중에는 모든 각도에서 그림 가운데를 축으로 돌리고, 돌린 뒤 아래 끝을 발밑 줄에 맞춘다 (공중 회전·다운 눕힘도 같음) |
| superArmorOutline | 이 프레임 동안 외곽선을 슈퍼아머 색으로 (art.md 8장) |
| fx | 프레임에 붙는 이펙트: dust, ring(r), stars, spore, sparks, zz, bubble(r), cloud, lines. at은 발밑 기준 상대 좌표 |
| idleSec | 대기(idle) 순환 한 프레임 길이 (초) |
| states | 상태 → 프레임. 배열이면 순환(대기·이동), `구간:공격id`는 shared/data/monsters.json 공격과 연결, selfStun·groggy는 해당 상태 |

- shared/data/monsters.json의 sprite 값 = 이 파일의 키
- 피격 흰색 번쩍임과 다운(90° 눕힘)은 자동 처리
- 피격 프레임 `hurt`(찌그러짐: 한 줄 낮고 좌우 1칸 넓게 + 감은 눈)·`hurtAir`(늘어남: 한 줄 높고 좌우 1칸 좁게 + 감은 눈). 없으면 windup 프레임으로 대체 (docs/motion.md 4장)
  - 포자꽃(고정형, 띄우기 불가)은 hurt만, 이끼곰(보스, 경직 없음)은 둘 다 없음. 어지러움·그로기 중에는 그 자세가 피격 프레임보다 우선
- 1층 이후 몬스터도 같은 절차(사양 → 실루엣 → 색 → 동작 검토)로 추가

## 7. 합성 절차

1. 파츠 수집: 기본 몸 + 표정 + 머리 모양 + 착용 의상 + 포즈의 팔·무기
2. 걷기 프레임이 있는 파츠는 현재 프레임 rows 선택
3. layerOrder 순서로 격자에 찍기 (`.`은 건너뜀, `_`는 지움)
4. 완성된 격자에 자동 음영·외곽선 1회 적용 (art.md 5장)
5. 텍스처로 캐시. 키 = 머리 모양 + 머리색 + 플레이어 색 + 의상 4칸 + 무기 외형 + 포즈 + 걷기 프레임 + 몸 내림 + 표정
6. 왼쪽을 볼 때는 캐시된 텍스처를 좌우 반전해서 그림 (다시 생성하지 않음)

- 장비를 바꿀 때 그 캐릭터의 텍스처만 다시 생성
- 이펙트(fx)는 스프라이트에 굽지 않고 별도로 그린다

---

## 8. 검증

- 로드 시 스키마 검사(zod): rows 길이 일치, 정의된 글자만 사용, 슬롯·층 이름 유효, dir은 8방향
- tools/sprite-preview (`pnpm sprite-preview`, localhost:5174): 게임과 같은 합성 코드로 확대 표시. 캐릭터 조합·걷기 재생 / 승인 캡처와 나란히 비교 / 몬스터 프레임·상태 재생(offset·shake·spin·슈퍼아머 외곽선 반영) / HUD 아이콘(승인·초안을 게임과 같은 슬롯 모양으로, 무기별 J U I)
- 확정 데이터 회귀 테스트: 기본 세트 4종의 합성 결과(재질 격자)를 스냅샷으로 저장하고 비교

---

## 9. 새 의상 추가 순서
1. 실루엣(재질 글자 마스크) 초안 → 검토
2. 필요하면 materials.json·palette.json에 재질 추가
3. outfits.json에 아이템 추가 (slot, parts, 상의면 sleeve)
4. sprite-preview로 모든 포즈·걷기 프레임에서 확인
5. 확정되면 docs/refs/approved/에 캡처

---

## 10. 초안 검토 (그림 추가·수정)
- 승인 데이터는 바로 고치지 않는다. 새 그림은 client/data/sprites/drafts/에 먼저 그린다
  - drafts/monsters.json: 몬스터 프레임 초안 (monsters.json과 같은 형식, frames·states, 새 재질 글자가 필요하면 materials도 — 승인 재질에 더해진다)
  - drafts/poses.json: 포즈 초안 (무기 종류 → 포즈 이름 → 포즈), 모션 초안 (motions → 모션 이름 → 모션)
  - drafts/props.json: 소품 초안 (새 소품은 통째로, 있는 소품은 frames·states만)
  - drafts/island.json: 섬 사물 초안 (새 사물은 통째로, 있는 사물은 frames를 겹치고 rot·animSec은 바꿈)
- 보기: sprite-preview 몬스터·캐릭터·소품 탭 "초안 보기" (초안은 이름 옆에 "(초안)", 캐릭터 탭 "포즈 모아 보기"·"모션 모아 보기"로 나란히), 게임은 개발 모드에서 `?drafts=1`
- 승인되면 초안을 승인 파일로 옮기고 초안 파일에서 지운다. 코드: client/src/sprites/data.ts setUseDrafts·withMonsterDrafts

## 11. 환경 소품 (props.json)

- 형식은 monsters.json과 같다 (materials, fixedExtra, idleSec, frames, states). 레이어 합성 없이 프레임 격자를 자동 음영·외곽선 (art.md 5장)
- 소품 id·상태
  | id | 프레임·상태 | 놓는 곳 (맵) |
  |---|---|---|
  | rock, stump | idle | walls 레이어 장애물 칸 (타일 속성 kind = 소품 id). 칸 가운데 아래(가장 앞 줄)에 발밑 |
  | door | closed / open | door_in(항상 닫힘)·door_out(방 클리어 시 open). 뒤쪽 벽에 붙는 아치: 발밑을 문 x의 바닥 맨 위 줄(깊이 0)에 |
  | returnRing | off / lit(순환) | return_point. 바닥에 깔림 (캐릭터보다 뒤), 방 클리어 시 lit |
  | chest | closed / open | chest. 여는 것은 3-4 보상 |
- 깊이 정렬: 장애물·상자는 캐릭터와 같이 y, 귀환 고리는 바닥 높이, 문은 벽 높이 (항상 캐릭터 뒤)
- 그리기 client/src/view/props.ts (PropLayer), 텍스처 sprites/textures.ts propTexture. props.json에 없는 장애물 종류는 임시 판으로 표시
- 보기: sprite-preview "소품" 탭 (모든 프레임 나란히, 순환 상태 재생)

---

## 12. 섬 사물 (island.json)

섬 사물은 **승인 데모(island_screen_hud_mockup.html)의 그리기 방식**을 따른다: 자동 음영 없이 픽셀마다 색을 정해 두고, 바깥 4방향에 1px 외곽선(global.outline)만 붙인다.

```json
"bench": {
  "colors": { "a": "island.wood:0", "b": "island.wood", "c": "island.woodDark" },
  "frames": { "front": { "rows": [...], "foot": [14, 12] }, "side": { ... } },
  "rot": ["front", "side", "back", "side|flip"],
  "animSec": 0.3
}
```

| 필드 | 설명 |
|---|---|
| colors | 글자 → 팔레트 경로, 또는 `경로:단계` = 그 색의 램프(art.md 5장) 단계 (0 밝음, 1 기본, 2 그림자, 3 가장 어두움) |
| frames.rows / foot | 색 격자와 발밑. 발밑 = 가운데 아래 (데모 put(): 왼쪽 = x − floor(외곽선 포함 폭 / 2), 아래 줄 = y) |
| rot | 회전 방향별 모습, 길이 1(대칭)·2·4 (art.md 6장 회전). `이름|flip` = 좌우 반전. 배열이면 순환 (모닥불·깃발·분수) |
| animSec | 순환 한 프레임 길이 (초) |

- 사물 id: 시설 well·shop·board·weaponRack·storage, 장식 flowerBed·stonePath(아래)·fence·pot·flag·mailbox·tree·bench·lamp·campfire·fountain, 배경 treeBig (섬 가장자리, 판매 안 함)·dock (선착장, 바닥 높이). 크기(칸)·가격은 shared/data/items.json (4-6)
- 꽃밭은 회전하면 꽃 색이 바뀜 (분홍·노랑 ↔ 하늘·흰색, 데모의 두 꽃밭)
- **돌길**은 그림이 아니라 바닥 무늬: 데모의 길 무늬(흙길 색 + 자갈 점)를 돌길이 놓인 칸에 월드 좌표로 깐다 → 이웃 돌길과 이어짐 (client/src/view/islandGround.ts)
- **바닥** (islandGround.ts `paintGround`): 잔디(16×10 두 색 + 점·풀 포기, 씨앗 난수) → 모래 8 → 흙 절벽 10 → 물 12. 물은 2프레임 (반짝임·거품 위치), 프레임 0이 데모
- 검증: island.test.ts·islandGround.test.ts가 데모 그리기 코드를 가짜 캔버스로 돌려 **픽셀 단위로 비교** (사물 9개 프레임·바닥, 우물·잡화점은 크기·발밑만)
- **우물**은 2026-10 우물 입장 개편으로 그림을 바꿨다 (지붕 → 도르래 들보, 물 → 버섯빛 구멍, 포자 2프레임 front·front2, art.md 6장). 데모와는 크기(외곽선 포함)·발밑만 같게 검사한다. 승인 캡처 island_hud.png·데모의 우물은 예전 그림 그대로 (refs는 수정 금지)
- **잡화점·공용 창고**는 2026-10 입체감 작업으로 그림을 바꿨다 (art.md 6장 건물 입체감). 잡화점은 데모와 크기(외곽선 포함)·발밑만 같게 검사한다 (공용 창고는 데모에 없음)
- **땅 그림자**는 데이터가 아니라 그림에서 자동으로 만든다 (client/src/sprites/castShadow.ts, art.md 6장). sprite-preview 섬 탭 장면에도 그려진다
- 코드: client/src/sprites/island.ts (`islandObjects`, `renderIslandFrame`, `islandView`), 보기: sprite-preview "섬" 탭 (데모와 같은 배치 장면 + 승인 캡처, 초안 배치, 모든 회전·프레임)
