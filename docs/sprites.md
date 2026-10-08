# 스프라이트 데이터 형식 (docs/sprites.md)

client/data/sprites/의 JSON 형식과 합성 절차의 기준 문서.
그림의 방향(비율, 의상 원칙, 음영 규칙, 이펙트 모양)은 docs/art.md. 색 값은 client/data/palette.json.

---

## 1. 파일 구성

| 파일 | 내용 | 상태 |
|---|---|---|
| materials.json | 마스크 글자 → 색 연결 | 확정 |
| character/base.json | 기본 몸(머리 피부, 스카프), 표정 3종, 머리 모양 3종, 어깨·손 기준점, 레이어 순서 | 확정 |
| character/outfits.json | 의상 아이템(슬롯별)과 세트 | 확정 (걷기 프레임은 M0에서 검토) |
| weapons_visual.json | 무기 외형 프로필 | 확정 |
| poses.json | 무기 종류별 포즈(손 위치, 무기 방향, 이펙트), 걷기 순환 | 확정 |
| monsters.json | 몬스터 스프라이트 (1층 다섯 종) | 확정 |

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
- width: 홀수는 가운데 정렬로 무기 방향에 수직(대각선이면 반대 대각선, 예: 대검 가드). 짝수는 기본선 + 한쪽 — 곧은 방향이면 수직 이웃, 대각선이면 가로 이웃(+x) 칸 (예: 대검 날)
- 파츠는 목록 순서로 그려 뒤 파츠가 앞 파츠를 덮는다
- block: 끝에 붙는 정사각 덩어리 (스태프 보석). 그 칸에서 +x·+y로 펴되, 무기 방향이 음수인 축은 반대쪽으로
- 같은 종류의 다른 디자인 무기는 프로필만 추가
- 프로필 추가 필드: `source` (base / craft / boss / recolor), `floor`, `smearColor`(보스 외형, palette 경로), `recolorOf`+`materials`(색 변형: 원본 프로필 + 재질 덮어쓰기)

### 포즈 (poses.json)
```json
"slash": { "front": {"hand":[10,11]},
  "weapons": [ {"hand":"front","dir":[1,0]} ],
  "fx": {"type":"smear","pivot":[9,11],"r":[9,14],"arc":[-1.7,0.35]} }
```
- dir: 8방향만 ([±1,0], [0,±1], [±1,±1])
- behind: true면 weapon_back 층 (몸 뒤에 그림)
- origin: 손 대신 무기 시작점 지정 (세워 든 스태프)
- fx: 공격 순간 이펙트. smear(pivot, 반지름 r, 각도 arc, reverse), spark, bolt, circle, lines, throw. 모양은 art.md 7장
- 행동과 포즈 연결은 행동 데이터에 적는다: `"poses": {"windup":"ready","active":"slash","recovery":"slash"}` (weapons.json, skills.json)
- 걷기: bottom 프레임을 poses.json walk.cycle 순서로 순환
- 이동·상태 모션(art.md 4장)이 추가되면 몸 프레임은 bottom의 frames 키(run1~4, backstep1~2, hurt, down, getup1~2, knocked)로, 상체 변화는 base.json에 몸 포즈로 추가. 형식 확정은 그릴 때

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
| spin | 90°씩 돌려 그림 (1/8초마다). 구르기 |
| superArmorOutline | 이 프레임 동안 외곽선을 슈퍼아머 색으로 (art.md 8장) |
| fx | 프레임에 붙는 이펙트: dust, ring(r), stars, spore, sparks, zz, bubble(r), cloud, lines. at은 발밑 기준 상대 좌표 |
| states | 상태 → 프레임. 배열이면 순환(대기·이동), `구간:공격id`는 shared/data/monsters.json 공격과 연결, selfStun·groggy는 해당 상태 |

- shared/data/monsters.json의 sprite 값 = 이 파일의 키
- 피격 흰색 번쩍임과 다운(90° 눕힘)은 자동 처리
- 피격 프레임 `hurt`(찌그러짐)·`hurtAir`(늘어남)는 M1에서 추가 예정. 없으면 windup 프레임으로 대체 (docs/motion.md 4장)
- 1층 이후 몬스터도 같은 절차(사양 → 실루엣 → 색 → 동작 검토)로 추가

## 7. 합성 절차

1. 파츠 수집: 기본 몸 + 표정 + 머리 모양 + 착용 의상 + 포즈의 팔·무기
2. 걷기 프레임이 있는 파츠는 현재 프레임 rows 선택
3. layerOrder 순서로 격자에 찍기 (`.`은 건너뜀, `_`는 지움)
4. 완성된 격자에 자동 음영·외곽선 1회 적용 (art.md 5장)
5. 텍스처로 캐시. 키 = 머리 모양 + 머리색 + 플레이어 색 + 의상 4칸 + 무기 외형 + 포즈 + 걷기 프레임 + 표정
6. 왼쪽을 볼 때는 캐시된 텍스처를 좌우 반전해서 그림 (다시 생성하지 않음)

- 장비를 바꿀 때 그 캐릭터의 텍스처만 다시 생성
- 이펙트(fx)는 스프라이트에 굽지 않고 별도로 그린다

---

## 8. 검증

- 로드 시 스키마 검사(zod): rows 길이 일치, 정의된 글자만 사용, 슬롯·층 이름 유효, dir은 8방향
- tools/sprite-preview: JSON을 읽어 확대 표시 + 의상·포즈·표정 조합 전환
- 확정 데이터 회귀 테스트: 기본 세트 4종의 합성 결과(재질 격자)를 스냅샷으로 저장하고 비교

---

## 9. 새 의상 추가 순서
1. 실루엣(재질 글자 마스크) 초안 → 검토
2. 필요하면 materials.json·palette.json에 재질 추가
3. outfits.json에 아이템 추가 (slot, parts, 상의면 sleeve)
4. sprite-preview로 모든 포즈·걷기 프레임에서 확인
5. 확정되면 docs/refs/approved/에 캡처
