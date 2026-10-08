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
3. 우물에서 출발 → IslandRoom이 DungeonRoom을 만들고 파티원 자리를 예약 → 클라이언트가 예약으로 입장
4. 던전 종료 → 정산을 DB에 저장 → 클라이언트는 IslandRoom으로 복귀
- 던전 중에도 IslandRoom 연결은 유지 (섬 주민 상태 표시용, 가벼운 연결)
- 같은 계정이 새로 접속하면 기존 연결을 끊는다

---

## 4. 클라이언트 → 서버 메시지

### 던전
| 메시지 | 내용 | 비고 |
|---|---|---|
| input | `{ seq, t, mx, my, run }` | mx·my ∈ {−1,0,1}. seq는 1씩 증가 |
| action | `{ seq, t, kind, skillId?, x, y, facing }` | kind: basic / dash / skill / ultimate / backstep / chargeStart / chargeRelease. x·y는 클라이언트가 본 내 위치 |
| item | `{ seq, t, slot }` | 물약 Z / X |
| interact | `{ targetId }` | 부활, 줍기, 레버 |

### 공통 (섬·던전)
| 메시지 | 내용 | 비고 |
|---|---|---|
| emote | `{ id }` | 1~4 |
| chat | `{ text }` | 1~60자 (hud.md 4장) |
| ping | `{ t }` | 시계 맞추기 |

### 섬
| 메시지 | 내용 |
|---|---|
| place / move / remove | 장식 배치 `{ itemId, x, y, rot }` / `{ placementId, x, y, rot }` / `{ placementId }` |
| buy | `{ itemId, count }` |
| well | `{ op: "join" | "leave" | "depart", floor? }` |
| memo | `{ text }` (1줄, 길이 제한) |
| loadout | 무기 교체·스킬 장착·의상 장착 (MVP 이후 의상) |

### 검증과 제한
- 모든 메시지는 서버에서 형식 검사 (shared/src/messages.ts의 zod 스키마)
- 횟수 제한: input 초당 30, action 초당 10, 섬 메시지 초당 5, chat 3초에 3회. 넘으면 무시, 계속되면 연결 종료
- 서버가 거절한 행동은 `rejected { seq, reason }`으로 알린다 (쿨타임, MP 부족, 상태 불가)

---

## 5. 서버 상태 구조 (Colyseus Schema)

### DungeonState
```
DungeonState
  floor, roomIndex (0~5), doorOpen, phase ("play" | "result")
  partySize, teamCombo
  players: Map<id, PlayerState>
  monsters: Map<id, MonsterState>
  zones: Map<id, ZoneState>
  objects: Map<id, ObjectState>      문, 레버, 누름돌, 폭탄 버섯 등 기믹

PlayerState
  id, name, look            look = 외형 키 (머리·머리색·의상·플레이어 색 번호, 스프라이트 캐시 키)
  weapon, x, y, facing      x·y는 정수 px
  state                     idle / walk / run / action / hitstun / down / getup / knocked / disconnected
  actionId, actionStart     진행 중 행동과 시작 서버 시각 (구간은 데이터로 계산)
  hp, maxHp, ultGauge
  reviveProgress            쓰러진 동안 동료 부활 진행도 (0~1)
  lastInputSeq              ★ 본인 전용: 서버가 처리한 마지막 입력 번호

PlayerPrivate (본인에게만 필터링해서 전송)
  mp, cooldowns (skillId → 끝나는 서버 시각), potions {hp, mp}, feather

MonsterState
  id, type, x, y, z, facing
  state                     idle / chase / action / hitstun / airborne / bounce / down / getup / groggy / stunned
  actionId, actionStart     예고·공격 표시를 클라이언트가 데이터로 그린다
  hpRatio                   체력 비율 (0~1, uint8로 양자화)
  superArmor
```
- 수치는 정수로 양자화 (위치 int16, hp uint16, 비율 uint8)
- 쿨타임·MP·물약은 본인만 필요하므로 필터로 본인에게만 전송
- 예고 범위, 포즈, 이펙트는 상태로 보내지 않는다: actionId + actionStart만 받으면 클라이언트가 data로 그린다

### 투사체
- 상태에 넣지 않고 이벤트로 처리: `projSpawn { id, kind, owner, x, y, z, dir, t0 }`, `projEnd { id, reason, x, y }`
- 클라이언트는 데이터(속도·사거리)로 직접 날려 그리고, 적중·소멸은 서버 이벤트로 확정

### IslandState
```
IslandState
  residents: Map<id, Resident>     이름, 접속 여부, 위치, 상태("섬" | "탐험 중 2층")
  placements: Map<id, Placement>   itemId, x, y, rot, placedBy
  treasury
  well: { members[], floor, countdownEnd }
```
- 개인 지갑·인벤토리는 본인 전용 메시지로 전송
- 게시판 기록은 요청할 때 메시지로 가져온다 (상태에 넣지 않음)

---

## 6. 서버 → 클라이언트 이벤트 메시지

| 이벤트 | 내용 | 클라이언트 처리 |
|---|---|---|
| hit | `{ attacker, target, damage, strength, flags, hitstop, x, y, z, t }` | 데미지 숫자, 섬광, 흰색 번쩍임, 히트스톱, 흔들림 |
| projSpawn / projEnd | 위 참고 | 투사체 그리기 |
| playerHit | 내가 맞음 `{ damage, strength, from }` | 피격 표정, 화면 붉은 테두리 없이 흔들림 |
| reward | `{ coins, material?, exp }` | 획득 표시 |
| combo | `{ count, milestone? }` | 콤보 표시, 단계 달성 연출 |
| roomClear / doorOpen | 방 클리어 | 문 열림 연출 |
| result | 정산 내용 | 정산 화면 |
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

### 행동 예측
- 공격·스킬·백스텝 입력 시 클라이언트가 바로 windup 포즈를 시작하고 이동을 잠근다 (서버를 기다리지 않음)
- 클라이언트도 쿨타임·MP·상태를 미리 검사해서 안 되는 행동은 아예 보내지 않는다
- 서버 확인: PlayerState.actionId/actionStart가 오면 그 시각 기준으로 맞춘다 (차이가 작으면 그대로)
- 서버 거절(rejected): 행동을 취소하고 대기 포즈로 (드문 경우)
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

---

## 9. 지연 보정 (좁은 판정 때문에 필수)

### 내 공격 판정
- 플레이어 화면의 몬스터는 100ms 과거 모습. 그래서 서버는 **그 플레이어가 본 시점으로 되감아** 판정한다
- 되감는 시각 = action.t − 보간 지연(100ms). 최대 150ms까지만 (그 이상은 150ms로 제한)
- 서버는 몬스터 위치 기록을 300ms 보관
- 공격자 위치: action에 담긴 x·y가 서버 기록과 12px 이내면 그 값을, 아니면 서버 위치를 사용

### 내 회피 판정
- 백스텝 무적은 입력 시각(t) 기준으로 소급 적용: 서버가 백스텝 입력을 받기 전에 처리한 피격이라도, 피격 시각이 t 이후이고 100ms 이내면 그 피격을 취소
- 그래서 내 화면에서 피했으면 대부분 피한 것으로 처리된다

### 히트스톱 동기화
- 서버: 적중 시 공격자와 대상만 hitstop 시간만큼 정지 (월드는 계속 진행)
- 클라이언트: hit 이벤트를 받으면 해당 두 엔티티의 표시를 같은 시간 멈춘다. 내가 공격자면 예측 중인 내 행동도 같은 시간 늦춘다

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
| 서버 재시작 | 진행 중이던 판은 무효. 그 판에서 쓴 물약을 돌려준다 |

- 재접속 시 전체 상태를 다시 받고, 확인 대기 목록과 보간 버퍼를 비운다

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

---

## 12. 공유 코드 (shared/src)

| 파일 | 내용 |
|---|---|
| messages.ts | 메시지·이벤트 타입과 zod 스키마 |
| movement.ts | 입력 → 이동 (속도, 걷기·달리기, 깊이 이동 배율) |
| collision.ts | 맵 충돌 (Tiled walls) |
| actions.ts | 행동 구간 계산, 행동 중 이동, 판정 모양 계산 |
| constants.ts | 틱 속도, 보간 지연, 보정 임계값 등 이 문서의 숫자 |

- 클라이언트·서버가 같은 결과를 내도록 이동 계산은 고정 시간 간격(1/60초) 단위로

---

## 13. 대역폭과 테스트

- 예상: 4인 + 몬스터 12마리 기준 변경분 전송으로 1인당 초당 수 KB 수준
- 개발 모드에 지연 시뮬레이터: 지연 0~300ms, 흔들림 ±50ms, 패킷 손실 0~5%를 조정 패널에서 설정
- M2 확인 기준: 지연 100ms·흔들림 ±20ms에서 내 이동이 끊기지 않고, 13px 라인 판정이 체감상 공정한가
