# 오디오 (docs/audio.md)

효과음·음악의 스타일, 합성 방식, 데이터 형식, 재생 규칙, 라이선스의 기준 문서.
레시피: 효과음 client/data/sfx.json, 음악 client/data/bgm.json (모두 승인된 소리). 타격 패키지와의 연결은 docs/motion.md 3장.

---

## 1. 스타일 (확정, 2026-10)

| 버스 | 쓰는 곳 | 특징 |
|---|---|---|
| **action** | 던전 전투: 휘두르기·타격·스킬·몬스터·백스텝·막기 | 구 던파식. 날카로운 "슈욱", 순간 "딱"(click), 살짝 일그러진 몸통 소리, 금속 울림 "창", 찌그러진 저음 "쾅". 짧은 잔향 |
| **clear** | UI·보상·섬: 코인, 물약, 레벨업, 방 클리어, 버튼, 장식 놓기, 이끼곰 하품(귀여운 연출) | 맑고 둥근 소리. 벨(FM)·실로폰(마림바), 은은한 긴 잔향 |

- 같은 장면에 두 버스가 섞여도 된다 (던전에서 코인 획득 = clear)
- 레트로(사각파 위주) 스타일은 쓰지 않는다

---

## 2. 합성 방식

녹음 파일 없이 Web Audio로 런타임 합성. 소리 하나 = **레이어 목록**, 레이어마다 시작 시각(at)이 있다.

| 레이어 | 필드 | 설명 |
|---|---|---|
| tone | wave, f[시작,끝], dur, v, atk?, lp?, bend?, wet?, dist? | 발진기 + 음높이 변화 |
| noise | f[시작,끝], dur, v, filter, q, swell?, wet?, dist? | 필터 걸린 잡음. swell = 커졌다 끊김(휘두르기) |
| click | v | 아주 짧은 고음 잡음. 타격 순간을 찍는다 |
| boom | f, dur, v | 찌그러진 저음 + 낮은 저음 (강 타격·다운) |
| metal | f, dur, v, wet? | 비정수배 배음 4개 (칼날·얼음·막기) |
| bell | f, dur, v, ratio?, idx?, wet? | FM 벨 (clear) |
| marimba | f, dur, v, wet? | 실로폰 (clear) |
| thump | f[시작,끝], dur, v | 둥근 몸통 소리 (clear) |

- wet = 잔향 보내기 양, dist = action 버스의 일그러짐 통과
- 버스 설정(음량 gain, 압축기, 잔향 길이, 일그러짐 세기)은 sfx.json buses. gain은 승인 데모의 기본 볼륨 (action 0.55, clear 0.6)
- 같은 레이어라도 버스마다 원본 기본값이 다르다 (tone 시작 action 0.002초 / clear 0.005초, noise 시작 action 0.001초 / clear 0.004초(0.15초 넘으면 0.03초), clear noise에는 swell 없음)
- 구현: client/src/audio/ (synth.ts = 레이어 재생, buses.ts, player.ts = 재생 규칙·볼륨, sfxEvents.ts = 전투 이벤트 연결)
- 원본과 같은지: compareRef.ts가 원본 스크립트와 엔진을 기록용 가짜 AudioContext(recorder.ts)로 돌려 노드·값·연결을 소리마다 비교. `pnpm test`와 sfx-preview에서 확인
- 승인 데모의 소리와 같아야 한다. 새 소리·수정은 sfx-preview로 들려주고 승인 후 데이터 반영

---

## 3. 소리 목록

| 분류 | action | clear |
|---|---|---|
| 전투 | swing, swingHeavy, hitLight, hitHeavy, launch, bounce, down, backstep, dash, guard, bolt_cast, bolt_hit, teleport (스태프, MVP 보충 ST-2b) | |
| 스킬 | skill_slash, skill_fireburst, skill_icefield (나머지는 스킬 추가 때) | |
| 몬스터 | mon_mushroom_windup, mon_boar_charge, mon_spore_shot, mon_bear_roar | bearYawn |
| 보상·UI | | coin, potion, levelup, roomClear, click, place |
| 우물 입장 | wellJump (우물로 뛰어듦, 휘익 내려감), wellLand (던전 첫 방 착지, 쿵), monWake (잠든 몬스터가 깨어남, 뽀잉) — 2026-10 승인, 승인 원본 비교 대상 아님 | |

- 데이터 연결: 행동(action) 데이터에 `sfx: { windup?, active?, hit? }` 키로 소리 이름 지정 (예: 대검 평타 active = swing, hit = hitLight). 이름은 두 버스에서 겹치지 않으므로 버스 없이 쓴다. data-validate가 sfx.json에 있는지 검사
- 지금 연결 (데이터 sfx): 대검 1·2타 swing/hitLight, 3타 swingHeavy/hitHeavy, 대시 dash/hitHeavy, 올려베기 launch/hitLight, 대지가르기 skill_slash/hitHeavy, 버섯 박치기 예고 mon_mushroom_windup, 멧돼지 돌진 mon_boar_charge, 포자탄 mon_spore_shot, 이끼곰 하품 예고 bearYawn, 스태프 평타 bolt_cast/bolt_hit, 스태프 대시 dash/hitHeavy, 화염 폭발 준비 skill_fireburst(레시피 안 0.45초 뒤 폭발음 = 준비 0.5초 끝), 얼음 장판 skill_icefield/hitLight
- 지금 연결 (화면 연출): 섬에서 우물로 뛰어들 때 wellJump (client/src/scenes/Island.ts). 던전 층 첫 방: 내가 착지할 때 wellLand, 잠든 몬스터가 깨어날 때 monWake (client/src/stage/combatStage.ts·onlineStage.ts)
- 지금 연결 (이벤트, client/src/audio/sfxEvents.ts): 달리기 시작 dash, 백스텝 backstep(순간이동 무기 = teleport), 몬스터 바운드 bounce·다운 down, 플레이어 피격 hitLight(강 공격이면 hitHeavy), 이끼곰 그로기 진입 mon_bear_roar, 물약 potion, 방 클리어 roomClear
- 아직 연결 안 함 (기능이 생길 때): levelup, click, place, guard
- 아직 없는 소리(멧돼지 벽 충돌, 포자탄 적중, 문 열림, 잡화점 구매, 채팅 알림, 오류 등)는 만들 때 같은 절차로 추가

---

## 4. 재생 규칙

- **타격 패키지와 같은 프레임에**: hit 소리는 적중 이벤트 순간 재생 (히트스톱과 무관하게 즉시)
- 음높이 무작위 ±4% (반복해도 덜 질리게). 레벨업·클리어 같은 음악적 소리는 제외 (sfx.json noJitter)
- 같은 소리 동시 최대 4개, 같은 소리 50ms 안 재생은 하나로 합침
- 동료의 소리는 볼륨 60%, 내 소리 100%. 화면 밖 소리는 생략 (둘 다 M2 멀티플레이에서)
- 볼륨 설정: 전체 / 효과음 / 음악 (로컬 저장, 기본 100 / 100 / 70). 화면: Esc → 설정 패널 (hud.md 8장)
- 브라우저 정책상 첫 클릭·키 입력 전에는 소리를 낼 수 없으므로 첫 입력에서 오디오 시작 (게임 시작 시 한 번 등록, client/src/main.ts. 로그인 화면의 입력도 포함)

---

## 5. 음악 (확정, 2026-10)

효과음과 같은 방식: 녹음 파일 없이 런타임 합성. 레시피는 client/data/bgm.json, 엔진은 tools/bgm-preview/engine.js.
**승인 원본은 tools/bgm-preview/reference.html (수정 금지)**. engine.js + bgm.json은 원본과 악기 호출이 전부 일치함을 검증함.

### 곡
| id | 곡 | 장르 | BPM | 마디 | 쓰는 곳 |
|---|---|---|---|---|---|
| island | 섬 · 오후의 바닷바람 | 로파이 (로즈 피아노, 스윙 드럼, 바이닐 잡음) | 78 | 8 | 섬 |
| floor1 | 던전 1층 · 포자빛 숲길 | 신비로운 숲 (마림바, 피리, 숲 바람, 포자 반짝임) | 96 | 8 | 1층 방 1~5 |
| boss1 | 보스전 · 깨어난 숲의 주인 | 시네마틱 (낮은 맥박, 충격음, 큰 스네어, 신스 리드 + 피리) | 100 | 16 | 1층 보스 방 |

- **floor1과 boss1은 한 쌍**: 같은 D단조, 같은 화음(Dm9, B♭maj7#11), 같은 마림바 음형·숲 바람. boss1 멜로디는 floor1 주제를 한 옥타브 낮추고 B → B♭처럼 반음 내린 변주 ("평화롭던 숲이 어두워졌다")
- boss1 구성: 0~3마디 정적(맥박·패드) → 4~7 드럼 + 피리가 주제를 조용히 → 8~15 전체 + 리드
- 높은 음 제한 (사용자 피드백): 보스 리드는 A5 이하, 하이햇은 대역 필터로 부드럽게. 귀를 찌르는 고음 금지
- 새 층도 같은 원칙: 그 층 던전 곡과 보스 곡은 주제·화음·악기를 공유하는 한 쌍

### bgm.json 형식
```json
"pools": { "spores": ["D6", ...] },  "arps": { "forest": [0, 2, 1, 3, 2, 1, 3, 2] },
"tracks": { "floor1": {
  "bpm": 96, "swing": 0.1, "stepsPerBar": 16, "delaySteps": 3,
  "chords": [["D2", "F3 A3 C4 E4"], ...],
  "melody": ["A5:4:4 C6:8:2 D6:10:6", ...],
  "lead": [{ "inst": "flute", "v": 0.1 }],
  "parts": [{ "inst": "marimba", "every": [2, 0], "note": "arp", "arp": "forest", "arpDiv": 2, "mul": 2, "v": 0.07 }]
} }
```
- chords: 마디마다 [베이스, 화음]. melody: 마디마다 "음:시작칸:길이칸" (빈 문자열 = 쉼). lead: 멜로디를 연주할 악기 (bars로 구간 지정, 여러 개면 겹쳐 연주)

| part 필드 | 설명 |
|---|---|
| inst | 악기 (engine.js CALL: rhodes, sub, kick, pump, snare, bigSnare, hat, shaker, rim, tom, impact, riser, wind, crackle, glock, marimba, pad, pulse / 리드: softLead, flute, mono) |
| bars / barList / barMod | 마디 범위 [시작, 끝] / 마디 목록 / [n, r] = 마디 % n == r |
| steps / every | 칸 목록 / [n, r] = 칸 % n == r (16칸 = 한 마디) |
| note | bass(화음의 베이스) / chord(화음 전체) / arp(arps 패턴 순서) / pick(pools에서 무작위) / 생략 |
| mul, len, hz | 주파수 배율, 길이(칸), 고정 주파수(Hz) |
| 값 형식 (v, pan, mul, hz) | 숫자 / 칸별 배열(16개) / `{mod, eq, then, else}` / `{seq, from}` 칸 from부터 순서대로 / `{base, add, start}` 칸마다 증가 |
| chance, jitter | 칸마다 나올 확률 / 칸 안에서 무작위로 늦게 시작 |
| args | 악기별 값: soft, duck, strum, c1·c2(필터 시작·끝), cut·cutStep, top, depth, noGlide |

- pump = 사이드체인 (duck 버스를 depth까지 눌렀다 복귀). kick과 같은 칸에 함께 둔다
- 버스: dry / duck(사이드체인 대상) / 잔향 3.2초 / 딜레이(delaySteps칸, 피드백 0.36)

### 재생 규칙
- 섬 = island, 던전 방 = 층 곡, 보스 방 입장 = 보스 곡(첫 마디부터). 전환은 1초 크로스페이드
- 정산 화면: 0.5초에 걸쳐 줄이고 정지 (정산 효과음이 주인공)
- 음악 볼륨 기본 70% (4장 볼륨 설정). 첫 입력 전에는 재생 불가 (4장)
- 구현: client/src/audio/bgm/ (engine.js를 TypeScript로 옮김. 악기 코드는 reference.html과 같게)
  - instruments.ts (Rig: 곡 하나의 버스·잔향·딜레이·잡음 버퍼) · voices.ts (악기 21개) · engine.ts (bgm.json 해석, 25ms마다 0.2초 앞까지 예약) · music.ts (재생 규칙)
  - 원본은 전역 하나로 한 곡만 돌렸지만, 크로스페이드를 위해 곡마다 인스턴스 (노드·값·연결은 같음). 곡 출력 → 크로스페이드 게인 → 효과음 플레이어의 음악 버스(전체 × 음악 볼륨)
  - 원본과 같은지: bgm.test.ts가 engine.js와 이식본을 같은 난수·기록용 가짜 AudioContext로 돌려 노드·값·연결 기록 전체를 비교 (섬·1층 2마디, 보스 9마디). `pnpm test`
- 층별 곡: shared/data/rooms.json 층.bgm { room, boss }. 섬 곡 island는 섬 씬(client/src/scenes/Island.ts)에 들어갈 때

### 수정 절차
1. tools/bgm-preview/index.html로 현재 곡 확인
2. 변경안은 미리보기로 들려주고 승인 후 bgm.json 반영
3. 악기 코드까지 바뀌면 승인 후 reference.html도 새 승인본으로 교체

---

## 6. 라이선스 기록

- 직접 합성한 소리는 기록 불필요
- 외부 소리·음악을 쓰면 `CREDITS.md`(저장소 루트)에 파일명, 출처 URL, 작가, 라이선스, 수정 여부를 기록. 게임 크레딧 화면에 같은 내용 (갈무리 글꼴 OFL 고지와 함께)
- 라이선스가 불분명한 소리는 쓰지 않는다

---

## 7. 도구
- tools/sfx-preview (완성, `pnpm sfx-preview`, 포트 5176): sfx.json을 게임과 같은 엔진으로 재생, 레이어 값 슬라이더 조정 → 바꾼 소리만 `{ "버스.이름": [레이어...] }` JSON 복사, 조합(combos) 재생, 승인 원본 두 개를 나란히 띄워 듣기 + 원본 자동 비교(✓/✗)
- 새 효과음 초안: client/data/drafts/sfx.json (sfx.json과 같은 형식). sfx-preview 목록에 "(초안)"으로 나오고, 게임은 개발 모드 `?drafts=1`에서 재생된다 (client/src/audio/player.ts addDraftSounds). 승인되면 sfx.json으로 옮기고 초안 파일에서 지운다
- tools/bgm-preview (완성): index.html = bgm.json 재생 / reference.html = 승인 원본 / engine.js = 합성 엔진
