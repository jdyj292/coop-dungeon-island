# 네트워크 설계 (docs/network.md)

클라이언트-서버 메시지, 상태 구조, 예측·보정, 지연 보정, 접속 끊김 처리의 기준 문서.
전투 규칙은 docs/combat.md, 데이터 형식은 docs/data.md.

---

## 1. 원칙

1. **서버가 진실**: 위치, 데미지, 보상, 쿨타임, 자원은 모두 서버가 결정. 클라이언트는 입력만 보낸다
2. **내 캐릭터만 예측**: 내 이동과 내 행동 시작은 즉시 화면에 반영하고, 서버 결과로 보정
3. **나머지는 보간**: 다른 플레이어·몬스터는 약간 과거(100ms)를 부드럽게 보여준다
4. **같은 코드 공유**: 이동·충돌·행동 구간 계산은 shared/에 두고 클라이언트·서버가 같은 함수를 쓴다
5. **상태는 동기화, 순간 사건은 메시지**: 계속 존재하는 것(위치, HP)은 Colyseus 상태, 한 번 일어나는 것(적중, 보상, 연출)은 이벤트 메시지

---

## 2. 시간

| 항목 | 값 |
|---|---|
| 서버 시뮬레이션 | 60Hz (16.7ms) |
| 상태 전송(패치) | 20Hz (50ms) |
| 클라이언트 입력 전송 | 이동 중 20Hz + 입력이 바뀔 때 즉시 |
| 보간 지연 | 100ms (다른 엔티티를 이만큼 과거로 그림) |

- 시계 맞추기: 클라이언트가 2초마다 ping, 서버 시각과의 차이를 이동 평균으로 추정 (서버 시각 = 클라이언트 시각 + offset)
- 모든 입력·이벤트에는 서버 기준 시각(추정)을 담는다

---

## 3. 방(Room) 흐름

1. 로그인 → 세션 쿠키 발급 (HTTP, docs/security.md)
2. IslandRoom 입장 (토큰 + islandId). 섬 주민만 입장 가능
3. 우물에서 출발 → IslandRoom이 파티 정보(파티원 userId·닉네임·플레이어 색·머리·무기·그 무기 숙련도·가져갈 물약)로 DungeonRoom을 만들고(비공개) 파티원마다 `depart { roomId, floor }` → 클라이언트는 섬 방을 나가 그 방에 joinById (DungeonRoom.onAuth가 세션 쿠키로 그 파티원인지 확인)
4. 던전 종료(정산·이탈) → 사람마다 정산을 DB에 저장(db/runStore.ts) → 섬 방에 "돌아옴" 알림 → 클라이언트는 정산 화면 뒤 아무 키로 섬 씬(IslandRoom 다시 입장, 우물 앞)
- 던전 중에는 섬 연결을 끊는다. 대신 서버가 "탐험 중"을 들고 있다 (systems/islandBus.ts: 같은 서버 프로세스 안 섬 방 ↔ 던전 방 알림, 섬 방이 새로 만들어져도 이 표로 상태를 채움). 주민 목록은 검 아이콘 + 층
- 개발용 `?online=1` 던전 방(joinOrCreate, 로그인 없이)은 그대로: 저장·알림 없음
- 접속 주소: 개발은 ws://<호스트>:2567, 빌드(배포)는 페이지와 같은 주소 (Nginx 뒤 게임 서버가 정적 파일·/api·소켓을 모두 받음, docs/deploy.md)
- 같은 계정이 새로 접속하면 기존 연결을 끊는다

---

## 4. 클라이언트 → 서버 메시지

### 던전
| 메시지 | 내용 | 비고 |
|---|---|---|
| input | `{ seq, t, mx, my, run }` | mx·my ∈ {−1,0,1}. seq는 1씩 증가. run = 클라이언트가 두 번 누르기로 판정한 달리기 (서버는 간격을 다시 재지 않음) |
| action | `{ seq, t, kind, skillId?, x, y, facing }` | kind: basic / dash / skill / ultimate / backstep / chargeStart / chargeRelease. x·y는 클라이언트가 본 내 위치 |
| item | `{ seq, t, slot }` | 물약 Z / X |
| interact | `{ targetId }` | 부활, 줍기, 레버. "chest" (클리어 뒤, interactRange 안, 방마다 한 번), "revive:<pid>" (E를 누르는 동안 150ms마다, 300ms 안에 안 오면 손 뗀 것) |

### 공통 (섬·던전)
| 메시지 | 내용 | 비고 |
|---|---|---|
| emote | `{ id }` | 1~4 |
| chat | `{ text }` | 1~60자 (hud.md 4장) |
| ping | `{ t }` | 시계 맞추기 |

### 섬
| 메시지 | 내용 |
|---|---|
| place / move / remove | 장식 배치 `{ itemId, x, y, rot, from: "mine" | "storage" }` / `{ placementId, x, y, rot }` / `{ placementId }`. 칸 좌표. 받은 순서대로 처리, 실패는 `placeFail { op, reason }` (본인에게) |
| give | 개발 명령 (개발 모드만): `{ itemId, count }` 가방에 장식 |
| buy | `{ itemId, count }` 잡화점 구매. 장식·물약 = 개인 지갑 → 가방, 공용 장식 = 공동 금고 → 공용 창고 (트랜잭션, 조건부 차감). 결과 `buyResult { ok, itemId, count, reason? }`, 지갑은 `me`, 가방은 `inv`, 금고·창고는 상태 |
| board | `{}` 게시판 열기 → `board { log(최근 100), memos(최근 20) }` (최신이 앞) |
| giveCoins | 개발 명령 (개발 모드만): `{ to: "wallet" | "treasury", amount }` |
| well | `{ op: "join" | "leave" | "depart", floor? }` |
| memo | `{ text }` 1줄 1~40자 (NET.memoMaxLen, 제어 문자·줄바꿈은 공백으로). 저장 후 `board` 다시 보냄 |
| look | `{ hair: 0~2, hairColor: 0~3 }` (shared LOOK) 외형 바꾸기 → users.hair_style·hair_color 저장, 주민 상태 hair·hairColor |
| weapon | `{ id }` (shared MVP_WEAPONS) 무기 고르기 → users.weapon 저장, 주민 상태 weapon, `me` 다시 보냄(그 무기 숙련도). 출발 카운트다운 중인 대기자는 무시 |
- chat·emote는 섬에서도 같은 메시지: 섬에 있는 주민 모두에게 `chat { player, text, t }`·`emote { player, id }` (저장 안 함). 제한은 던전과 같음 (3초에 3회), 섬 메시지(buy·board·memo·place 등)는 초당 5회
| loadout | 무기 교체·스킬 장착·의상 장착 (MVP 이후 의상) |

### 검증과 제한
- 모든 메시지는 서버에서 형식 검사 (shared/src/messages.ts의 zod 스키마)
- 횟수 제한: input 초당 30, action 초당 10, 섬 메시지 초당 5, chat 3초에 3회. 넘으면 무시, 계속되면 연결 종료
- 서버가 거절한 행동은 `rejected { seq, reason }`으로 알린다 (쿨타임, MP 부족, 지구력 부족 stamina, 상태 불가). 받을 때 검사: 장착하지 않은 스킬·필살기·충전(MVP 이후)은 state
- 회피 보관: 회피는 쿨타임·지구력은 되는데 서버 캐릭터가 아직 후딜레이 전(적중 역경직으로 클라이언트보다 늦음)이면 거절하지 않고 보관했다가, 후딜레이에 들어가는 틱에 그때 누른 방향으로 실행한다. 보관 중에는 lastInputSeq를 회피 앞까지만 올린다. 보관 중 맞거나 NET.dodgeBufferMs(500ms)가 지나면 state로 거절하고, 보관 중 또 회피를 보내도 state로 거절한다. 클라이언트는 다시 적용할 때 회피 누름을 시작될 때까지 이어 눌러 서버와 맞춘다 (이전에는 거절되어 화면에서 살짝 떴다가 제자리로 돌아감)
- 형식이 틀린 메시지도 횟수에 든다. 5초 안에 30개를 버리면 연결 종료 (NET.limits)
- 구현: server/src/systems/ (dungeonGame = 진행, inputs = 입력 대기열·거절, rateLimit, sync = 상태 반영, events = 이벤트). rooms/DungeonRoom은 연결·전송만

---

## 5. 서버 상태 구조 (Colyseus Schema)

### DungeonState
```
DungeonState
  serverTime                이 상태의 서버 시각 ms (패치마다 바뀜, 보간 기준)
  floor, roomIndex (0~5), roomCount, wave, doorOpen, exitAt·exitNeed (출구 앞 인원/필요 인원), chestOpen, returnLeft (귀환 카운트다운), phase ("play" | "result")
  partySize, teamCombo
  players: Map<id, PlayerState>
  monsters: Map<id, MonsterState>
  zones: Map<id, ZoneState>
  objects: Map<id, ObjectState>      문, 레버, 누름돌, 폭탄 버섯 등 기믹

PlayerState
  id, name, look            look = 외형 키 "의상:머리 번호:머리색 번호:플레이어 색" (예: beginner:1:2:0, 섬 출발 파티 정보에서)
  weapon, x, y, facing      x·y는 정수 px
  dodgeDir, dodgeDy         회피 이동 방향 좌우 (1/−1/0)·깊이 (1 아래/−1 위/0). 회피 아니면 둘 다 0. 앞회피면 dodgeDir = facing
  dodgeStart                회피 시작 서버 시각 (회피 아니면 0). 본인 예측 재계산의 회피 진행 시간 (state 바뀐 걸 받은 시각은 최대 한 패치 늦어 회피 끝에 앞으로 당겨짐)
  state                     idle / walk / run / action / backstep / hitstun / down / knocked / disconnected / arrive(층 첫 방에 우물에서 떨어지는 중, 클라이언트는 상태가 시작된 뒤 흐른 시간으로 높이를 그리고 본인 예측도 입력을 받지 않음) (기상 무적은 연출만)
  actionId, actionStart     진행 중 행동과 시작 서버 시각 (구간은 데이터로 계산). 1ms 이상 바뀌면 갱신 (히트스톱으로 멈춘 동안만 바뀜. 20ms로 두면 본인 예측 재계산이 대시를 약 5px 앞서 계산했다가 뒤로 당겨짐)
  hp, maxHp, ultGauge
  reviveProgress            쓰러진 동안 동료 부활 진행도 (0~255)
  lastInputSeq              서버가 처리한 마지막 입력 번호 (본인 보정용, 작아서 전원에게 보냄)
  priv: PlayerPrivate       @filter로 본인에게만

PlayerPrivate (본인에게만 필터링해서 전송)
  mp, stamina, tired (달리다 지구력이 바닥나 걷는 중), cooldowns (skillId → 끝나는 서버 시각 ms, 20ms 이상 바뀔 때만 갱신), potionHp, potionMp, feathers, coins, materials, exp, bonusPct (이번 판 보상)

MonsterState
  id, type, x, y, z, facing
  state                     idle / chase / action / hitstun / airborne / down / getup / dizzy(멧돼지 어지러움) / groggy / frozen(빙결, 몸이 idle일 때) / sleep(층 첫 방에서 잠든 채, 몸이 idle일 때) / stunned (바운드는 airborne 안에서 z로)
  actionId, actionStart     예고·공격 표시를 클라이언트가 데이터로 그린다
  hpRatio                   체력 비율 (0~1, uint8로 양자화)
  superArmor

ZoneState
  id, attackId, x, y, endsAt (사라지는 서버 시각 ms)
```
- 스키마 기본값과 같은 값은 전송되지 않아 클라이언트에서 비어 있을 수 있다 → Connection.progress가 기본값으로 채움
- 개발 명령 `dev { cmd: "clear" | "down" }`: 지금 방 몬스터를 모두 기절 / 나를 쓰러뜨림 (NODE_ENV=production이면 무시). 지연 시뮬레이터 패널 버튼
- 수치는 정수로 양자화 (위치 int16, hp uint16, 비율 uint8). 시각은 방 생성부터의 서버 ms (float64)
- actionStart = 서버 시각 − 행동 경과. 같은 행동이 이어지면 다시 쓰지 않는다
- 입장 위치: 왼쪽 3타일, 깊이를 인원 수로 나눔 (shared/src/sim/roomSetup.ts entryPos)
- 쿨타임·MP·물약은 본인만 필요하므로 필터로 본인에게만 전송
- 예고 범위, 포즈, 이펙트는 상태로 보내지 않는다: actionId + actionStart만 받으면 클라이언트가 data로 그린다

### 투사체
- 상태에 넣지 않고 이벤트로 처리: `projSpawn { id, kind, owner, x, y, z, dir, dy, t0 }` (dy = 진행 1px당 깊이 변화, 비스듬히 쏜 포자탄), `projEnd { id, reason, x, y }`
- 클라이언트는 데이터(속도·사거리)로 직접 날려 그리고, 적중·소멸은 서버 이벤트로 확정

### IslandState
```
IslandState
  serverTime, name, treasury
  residents: Map<userId, Resident> id, name, color(가입 순서 0~3 = 플레이어 색), hair·hairColor(외형 번호), weapon(고른 무기), online, status("island" | "away" | "dungeon:<층>"),
                                   x, y, facing, state(idle/walk/run), lastInputSeq,
                                   wellAt(던전에서 돌아와 우물 앞으로 들어온 서버 시각 ms, 선착장 입장은 0 — 우물에서 튀어나오는 연출, island.md 6장)
  placements: Map<id, Placement>   id, itemId, x, y, rot, placedBy, communal (칸 좌표)
  storage: Map<itemId, count>      공용 창고
  well: { members[], floor, countdownEnd } (4-8)
```
- 구현 (4-5): server/src/rooms/IslandRoom.ts (섬마다 한 방, `filterBy(['islandId'])`), 진행 systems/islandGame.ts. 입장 인증은 onAuth에서 세션 쿠키(sid) → 그 섬 주민만, 같은 계정의 이전 연결은 종료 코드 4002로 끊음
- 이동: 클라이언트는 던전과 같은 input 메시지, 서버 60Hz로 마지막 입력 적용(shared/src/island/walker.ts), 내 캐릭터는 같은 함수로 예측·보정(client/src/net/walkPredict.ts, 7장 보정 규칙), 다른 주민은 100ms 보간
- 입장 때 본인에게 `me { wallet, level }`, 가방이 바뀔 때마다 `inv { items }` 메시지. 배치는 systems/islandPlacement.ts (규칙 검사 → DB 트랜잭션 db/islandStore.ts → 상태), 걸을 수 없는 장식은 서버·클라이언트 예측 모두 장애물. 끊기면 2초마다 다시 입장 (섬은 전체 상태를 새로 받으면 됨)
- 개발: `pnpm island-bot --island <섬 번호>` 봇 주민이 가입·입장 신청 → 섬 주인이 게시판 주민 탭에서 허용하면 입장해 우물 앞을 걷는다 (브라우저 하나로 2인 확인). 섬 번호는 `GET /api/me`의 island.id
- 섬 방 최대 접속 10명 (AUTH.islandResidents). 섬 주인에게만 `joinRequest { nickname }` (입장 신청 알림). 신청이 허용되면 접속 전에도 주민 목록에 넣음 (islandBus joined)
- 개인 지갑·인벤토리는 본인 전용 메시지로 전송
- 게시판 기록은 요청할 때 메시지로 가져온다 (상태에 넣지 않음)

---

## 6. 서버 → 클라이언트 이벤트 메시지

| 이벤트 | 내용 | 클라이언트 처리 |
|---|---|---|
| hit | `{ attacker, target, damage, strength, flags, hitstop, recoil, act, actT, x, y, z, t }` (recoil = 공격자 멈춤 초, act·actT = 맞힌 행동 id·진행 시간, 히트스톱 동기화) | 데미지 숫자, 섬광, 흰색 번쩍임, 히트스톱, 흔들림 |
| projSpawn / projEnd | 위 참고 | 투사체 그리기 |
| bolt / boltEnd | 플레이어 마법탄 `bolt { id, kind(행동 id), pid, x, y, dir, t0 }`, `boltEnd { id, reason, x, y }` | 마법탄 그리기 (MVP 보충 ST-2) |
| playerHit | 내가 맞음 `{ damage, strength, from }` | 피격 표정, 화면 붉은 테두리 없이 흔들림 |
| reward | `{ coins, material, exp }` 본인에게 (몬스터 기절·보물상자) | coin 효과음, HUD 숫자 튐 |
| comboBonus | `{ count, rate }` 본인에게 | "+5%" 표시 |
| combo | `{ count, milestone? }` | 콤보 표시, 단계 달성 연출 |
| roomClear / doorOpen | 방 클리어 | 문 열림 연출 |
| roomEnter | `{ roomIndex }` 다음 방 | 클라이언트는 상태 roomIndex가 바뀌면 같은 접속으로 Dungeon 씬을 다시 시작 (배경·소품·예측 범위 교체, 보간 버퍼 비움, 0.3초 페이드인) |
| result | `{ kind: clear·return·wipe, lines[pid·코인·보너스·잃은 코인·지갑·금고·재료·경험치·레벨 전후], treasury }` | 정산 화면. 서버는 phase "result"로 세계를 멈춤 |
| rejected | `{ seq, reason }` | 예측했던 행동 취소 |
| emote | `{ player, id }` | 머리 위 표시 |
| chat | `{ player, text, t }` | 말풍선 + 대화 기록 (같은 방에만 전달, 저장 안 함) |

---

## 7. 내 캐릭터 이동 예측과 보정

1. 입력이 생기면 seq를 붙여 서버로 보내고, **같은 이동 함수(shared/src/movement.ts)로 즉시 내 위치를 움직인다**
2. 보낸 입력은 "확인 대기 목록"에 보관
3. 서버 패치가 오면 서버 위치와 lastInputSeq를 받는다
4. 확인 대기 목록에서 lastInputSeq 이하를 지우고, 서버 위치에서 남은 입력을 다시 적용 → 예측 위치 재계산
5. 화면 위치와 재계산 위치의 차이
   - 2px 이하: 무시
   - 2~24px: 100ms에 걸쳐 부드럽게 이동
   - 24px 초과: 즉시 이동 (벽에 막히는 등 큰 차이)

- 구현: client/src/net/predict.ts (Predictor). 틱마다 (보낸 마지막 seq, 입력)을 보관하고, 패치가 오면 서버 상태(mirror)에서 남은 입력을 다시 적용
- 이동 입력은 "바뀔 때 + 20Hz"로 보내므로 서버가 한 입력을 적용한 틱 수가 2~3틱 다를 수 있다 (걷기 1~3px, 위 보정 규칙이 흡수)
- 보정할 때 바꾸는 것: 위치·백스텝, 행동이 서로 다르면 행동. HP·MP·지구력·물약은 서버 값, 쿨타임은 예측과 서버 중 긴 쪽
- 상태 이름(idle·walk·action 등)은 shared playerStateName으로 서버·클라이언트가 같게
- 개발용 지연: `?lag=왕복ms` (보낼 때·받을 때 절반씩). 흔들림·손실 조정 패널은 roadmap 2-6

### 행동 예측
- 공격·스킬·백스텝 입력 시 클라이언트가 바로 windup 포즈를 시작하고 이동을 잠근다 (서버를 기다리지 않음)
- 클라이언트도 쿨타임·MP·상태를 미리 검사해서 안 되는 행동은 아예 보내지 않는다
- 서버 확인: PlayerState.actionId/actionStart가 오면 그 시각 기준으로 맞춘다 (차이가 작으면 그대로)
- 서버 거절(rejected): 행동을 취소하고 대기 포즈로 (드문 경우). 다시 적용할 때도 그 누름은 뺀다
- 행동 중 이동(대시 공격, 돌진 스킬)도 같은 공유 함수로 예측

### 예측하지 않는 것
- 내가 맞는 것(경직·넉백·다운): 서버 상태가 오면 반영. 넉백은 서버 위치를 향해 부드럽게
- 적중 여부와 데미지: hit 이벤트로만 표시 (헛스윙 표시가 먼저 나가도 됨)

---

## 8. 다른 엔티티 보간

- 받은 상태를 시각과 함께 버퍼에 쌓고, (현재 서버 시각 − 100ms) 시점을 두 스냅샷 사이에서 보간
- 높이(z)도 보간. 띄우기 포물선은 20Hz 스냅샷으로도 충분히 부드럽다 (0.7초 체공에 14개 이상)
- 몬스터 행동은 actionId + actionStart로 포즈·예고를 클라이언트가 직접 재생 (보간 대상 아님)
- 버퍼가 비면(지연 급증) 마지막 속도로 최대 200ms 외삽 후 멈춤
- 적중 연출(hit 이벤트)은 그리는 시점이 이벤트의 t에 닿을 때 재생해 보간된 화면과 맞춘다. 투사체는 projSpawn 데이터로 직접 날리고 projEnd 시각에 지운다
- 행동 시작·active 진입·백스텝·다운 등의 소리와 연출은 그리는 시점의 상태 변화로 낸다 (로컬의 SimEvent 대신)
- 구현: client/src/net/ (connection = 접속·스냅샷, clock, interp, mirror = 스냅샷 → 그리기 객체, inputSender, transitions), client/src/stage/onlineStage.ts
- 개발용 접속: `?online=1&room=1&party=2` → 같은 방 번호·인원 조건의 빈자리에 들어가고 없으면 새로 (서버 filterBy). 다른 플레이어는 플레이어 색 번호로 구분

---

## 9. 지연 보정 (좁은 판정 때문에 필수)

### 내 공격 판정
- 플레이어 화면의 몬스터는 100ms 과거 모습. 그래서 서버는 **그 플레이어가 본 시점으로 되감아** 판정한다
- 되감는 시각 = action.t − 보간 지연(100ms). 최대 150ms까지만 (그 이상은 150ms로 제한)
- 서버는 몬스터 위치 기록을 300ms 보관
- 공격자 위치: action에 담긴 x·y가 서버 기록과 12px 이내면 그 값을, 아니면 서버 위치를 사용 (행동 중이 아닐 때, 방 범위 안으로)
- 구현: shared/src/sim/history.ts (몬스터 위치 기록), RoomSim SimPlayer.rewind (행동 메시지마다 갱신, 그 플레이어의 active 판정에 사용), 서버 dungeonGame.lagCompensate

### 내 회피 판정
- 백스텝 무적은 입력 시각(t) 기준으로 소급 적용: 서버가 백스텝 입력을 받기 전에 처리한 피격이라도, 피격 시각이 t 이후이고 100ms 이내면 그 피격을 취소
- 그래서 내 화면에서 피했으면 대부분 피한 것으로 처리된다
- 구현: shared/src/sim/hitLog.ts (피격 직전 HP·경직·다운·쓰러짐·깃털·무적·행동 기록, 300ms) → 가장 이른 취소 피격 직전으로 되돌린 뒤 백스텝. 회피 쿨타임 중이거나 지구력이 모자라면 취소하지 않음

### 히트스톱 동기화
- 서버: 적중 시 공격자와 대상만 hitstop 시간만큼 정지 (월드는 계속 진행)
- 클라이언트: hit 이벤트를 받으면 해당 두 엔티티의 표시를 같은 시간 멈춘다. 내가 공격자면 예측 중인 내 행동도 같은 시간 늦춘다
- 구현: RoomSim 옵션 `hitstop: 'entity'`(서버). 멈춘 동안 들어온 누름은 멈춤이 끝난 틱에 적용 (연타가 끊기지 않게, 예측도 같게)
- 다른 플레이어·몬스터는 서버 데이터가 이미 멈춰 있어 보간으로 그대로 보인다. 내 예측 멈춤은 적중 연출이 재생되는 순간 (Predictor.stop)
- 공격자 멈춤 시간은 hit의 recoil (근접 역경직 포함, combat.md 5장). 서버는 적중 틱 **바로 뒤**를 멈추는데 클라이언트는 지연만큼 늦게 알므로, hit에 맞힌 행동 id·진행 시간(act, actT)을 실어 보낸다. Predictor는 예측 기록에서 그 틱을 찾아 뒤 recoil만큼을 "서버가 멈춘 틱"으로 표시하고 다시 계산할 때 그 틱만 멈춘다. 화면은 지금부터 recoil만큼 제자리에서 기다리고 그동안 위치를 뒤로 당기지 않는다 (두 번 멈춰 대시가 뒤로 갔다 앞으로 가 보이던 문제, 테스트 predict.test.ts)
- 솔로 로컬은 `hitstop: 'none'` + 화면 전체 멈춤(승인 데모와 같은 방식, motion.md 3장)을 유지. 둘을 함께 쓰면 두 번 멈춘다

---

## 10. 접속 끊김

### 던전
| 상황 | 처리 |
|---|---|
| 파티원 1명 끊김 | 캐릭터는 제자리에서 반투명(disconnected), 무적, 몬스터가 노리지 않음. 30초 재접속 대기 |
| 30초 안에 재접속 | 그대로 이어서 진행 (상태·자원 유지) |
| 30초 지남 | 던전에서 이탈 처리. 그 플레이어는 전멸과 같은 정산(이번 판 코인 50%, 재료 유지). 남은 인원 기준으로 몬스터 체력 배율 재계산 (현재 체력 비율은 유지) |
| 솔로 끊김 | 방 시뮬레이션을 일시정지하고 60초 대기. 재접속하면 그대로 재개 |
| 전원 끊김 | 60초 대기 후 방 종료, 전원 이탈 처리 |
| 서버 재시작 | 진행 중이던 판은 무효. 그 판에서 쓴 물약을 돌려준다: 물약은 출발 때 가방에서 빼지 않고 정산 때 쓴 만큼만 빼므로 저장 전에 끊긴 판은 아무것도 빠지지 않음 (탐험 중 표시는 서버 메모리라 재시작하면 풀림) |

- 재접속 시 전체 상태를 다시 받고, 확인 대기 목록과 보간 버퍼를 비운다
- 구현 (3-8):
  - 서버: DungeonRoom.onLeave(동의 여부) → 스스로 나감은 바로 이탈, 끊김은 Colyseus allowReconnection(위 대기 시간). 판정은 server/src/systems/presence.ts + DungeonGame.disconnect·reconnect·leave
  - 끊긴 사람: RoomSim SimPlayer.away (멈춤·무적·대상 제외, 출구 인원·귀환·전멸 판정에서 뺌), 상태 "disconnected". 솔로·전원 끊김이면 시뮬레이션 멈춤
  - 이탈: 그 사람은 wipe 정산 (DungeonGame.dropped, 저장은 M4). RoomSim.setPartySize로 몬스터 체력 배율(비율 유지)·공격 토큰 다시 계산
  - 클라이언트: 우리가 나가지 않았는데 끊기면 2초마다 reconnect(token) 최대 60초 (화면 가운데 RECONNECT 깜빡임, 조작 정지). 성공하면 같은 접속으로 씬을 다시 시작, 실패하면 LOST → 아무 키로 새 판
  - 다른 사람이 끊기면 반투명(45%) + 파티원 프레임 흐림·점 세 개
  - 개발: 지연 시뮬레이터 패널 "연결 끊기" (소켓만 닫음)

### 섬
- 섬 변경(배치, 구매)은 즉시 DB에 저장되므로 끊겨도 손실 없음
- 재접속하면 IslandRoom에 다시 입장해 전체 상태를 받는다
- 출발 대기 중 끊기면 대기 목록에서 빠진다

---

## 11. 저장 시점 (DB)

| 시점 | 저장 내용 |
|---|---|
| 섬 배치·구매 | 즉시 (트랜잭션) |
| 던전 정산 | 지갑, 금고, 인벤토리(재료·물약 차감), 숙련도 경험치, 첫 처치 보상, 활동 기록을 한 트랜잭션으로 |
| 이탈·전멸 | 정산 규칙 적용 후 위와 동일 |

- 던전 진행 상태는 메모리에만 (중간 저장 없음)
- 던전 정산 구현 (4-8): DungeonGame이 Outbox.settled(결과, 남은 물약)를 부르면 DungeonRoom이 사람마다 saveRun (지갑·금고·재료(층 재료 items.json materials)·쓴 물약·weapon_mastery·활동 기록 dungeon:<결과>)

---

## 12. 공유 코드 (shared/src)

| 파일 | 내용 |
|---|---|
| messages.ts | 클라이언트 → 서버 zod 스키마(`C2S`, `parseC2S`), 서버 → 클라이언트 이벤트 타입(`S2C`) |
| movement.ts | 입력 → 이동 (속도, 걷기·달리기, 깊이 이동 배율) |
| map/collision.ts · map/tiled.ts · map/maps.ts | 장애물 충돌 (Bounds.blocks) · Tiled 맵 읽기 · 맵 목록 (dungeon.md 10장) |
| actions.ts | 행동 구간 계산, 행동 중 이동 |
| shapes.ts | 판정 모양 (hitbox · area circle/rect/fan · projectile · zone) |
| tick.ts | 고정 1/60초 틱 누적기 (FixedStep) |
| player.ts | 플레이어 한 틱 (행동·대시·회피·지구력·쿨타임·이동) |
| monster/ | 몬스터 상태·AI·공격·토큰·투사체·장판 |
| sim/room.ts | 방 한 틱 (RoomSim): 몬스터 → 투사체·장판 → 플레이어 → 겹침 풀기. 플레이어 여럿(pid), `step(dt, 입력 Map)`. 솔로는 `tick(dt, 입력)`. 서버 DungeonRoom이 그대로 돌린다 |
| sim/aim.ts · sim/strike.ts | 몬스터 대상 선택 (dungeon.md 3장) · 플레이어 행동 적중 |
| sim/roomSetup.ts | 방 고르기·크기, 입장 위치, 웨이브 출현 위치(Tiled 전 임시), WaveRunner (웨이브 → 클리어) |
| constants.ts | 틱 속도, `NET` (보간 지연, 보정 임계값, 되감기, 횟수 제한 등 이 문서의 숫자) |

- 클라이언트·서버가 같은 결과를 내도록 이동 계산은 고정 시간 간격(1/60초) 단위로

---

## 13. 대역폭과 테스트

- 예상: 4인 + 몬스터 12마리 기준 변경분 전송으로 1인당 초당 수 KB 수준
- 개발 모드에 지연 시뮬레이터: 지연 0~300ms, 흔들림 ±50ms, 패킷 손실 0~5%를 조정 패널에서 설정
  - `?online=1`에서 ` 키로 패널 열기 (client/src/net/lagPanel.ts). 초기값 `?lag=왕복ms&jitter=±ms&loss=%`. RTT·보정 횟수·최대 오차 표시
  - 손실 흉내: WebSocket(TCP)은 패킷을 잃지 않고 재전송하므로 손실 확률만큼 재전송 지연(+200ms)을 더하고 순서는 유지 (뒤 메시지도 밀림). 상태 패치는 변경분이라 버리지 않는다 (client/src/net/delayLine.ts)
- `pnpm net-smoke` (서버가 떠 있을 때): 봇 2개가 접속해 이동·평타·핑·채팅·거절을 보내고 적중·본인 전용 필터·lastInputSeq를 확인
- 측정 (2026-10, 지연 100ms·흔들림 ±20ms, 2인): 내 화면 위치 프레임당 이동 95% 1.8px·최대 4.3px, 보정 무시 199·부드럽게 19·즉시 0 (최대 오차 7.6px). 다른 플레이어 보간 프레임당 95% 1.2px·최대 2.5px
- M2 확인 기준: 지연 100ms·흔들림 ±20ms에서 내 이동이 끊기지 않고, 13px 라인 판정이 체감상 공정한가
