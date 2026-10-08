# 게임 데이터 형식 (docs/data.md)

shared/data/의 weapons.json, skills.json, monsters.json 형식 기준 문서.
규칙의 의미는 docs/combat.md, 수치 근거는 docs/balance.md, 스킬 목록은 docs/skills.md, 그림 데이터는 docs/sprites.md.
단위: 거리·크기 px (1타일 16), 시간 초, 속도 px/s.

---

## 1. 공통: 행동(action)

평타, 대시 공격, 스킬, 몬스터 공격은 모두 같은 행동 형식을 쓴다. 서버 전투 코드는 하나로 처리한다.

```json
{
  "id": "gs_b3",
  "phases": { "windup": 0.25, "active": 0.10, "recovery": 0.40 },
  "coef": 350,
  "hitbox": { "forward": 2, "width": 20, "depth": 13, "z": "both" },
  "strength": "heavy",
  "flags": ["knockback"],
  "poses": { "windup": "ready", "active": "slash", "recovery": "slash" },
  "fx": { "grade": "heavy" }
}
```

| 필드 | 필수 | 설명 |
|---|---|---|
| id | O | 전체 데이터에서 고유 |
| phases | O | windup / active / recovery 길이. 몬스터는 windup = 예고 시간 |
| coef | 플레이어 | ATK 대비 % (balance.md 공식) |
| damage | 몬스터 | 고정 데미지. 0이면 판정 없이 효과만 |
| 판정 (아래 중 하나) | O* | hitbox / area / projectile / zone (*damage 0이고 zone도 없으면 생략 가능) |
| strength | | light / medium / heavy → 경직·밀림(combat.md 3장). 몬스터 공격이 heavy면 플레이어 다운 |
| flags | | combat.md 2장 속성 플래그 (launch, knockback, down, downhit, pull, hold, grab, multi, projectile) |
| launchVz | | launch 세기. 생략 시 combat.md 기본값 |
| hits | | 다단히트 `{ "count": 6, "interval": 0.1 }` (multi 플래그와 함께) |
| move | | 행동 중 이동 `{ "distance": 32, "during": "active" }` 또는 `{ "speed": 160, "maxDistance": 96, "during": "active", "stopOnWall": true }` |
| status | | 상태이상 `{ "type": "freeze", "time": 1.5 }` (freeze / slow / stun) |
| poses | 플레이어 | 구간별 포즈 이름 (poses.json의 해당 무기 세트) |
| fx | | `{ "grade": "light|medium|heavy|ultimate", "shake": "vertical|horizontal" }` 연출 등급은 combat.md 5장 |
| sfx | | `{ "windup"?, "active"?, "hit"? }` 소리 이름 (client/data/sfx.json, docs/audio.md) |
| telegraph | 몬스터 | 예고 표시 `{ "type": "shake|area|line|glow|shake+line", "length": 96 }`. area는 판정 모양을 그대로 표시 |
| cooldown | | 스킬: 기준 쿨. 몬스터: 같은 공격 재사용 대기 |

### 판정 모양
| 종류 | 형식 | 위치 기준 |
|---|---|---|
| hitbox | `{ forward, width, depth, z, back? }` 사각형 | 바라보는 방향으로 forward만큼 떨어진 곳부터 width 길이. back은 뒤쪽 추가 |
| area | `{ shape: "circle|rect|fan", at: [x, y], radius / width·depth / angle, z }` | at = 행동자 기준 상대 위치 (x는 바라보는 방향 +) |
| projectile | `{ speed, range, radius, pierce, reflectable? }` | 손 위치에서 바라보는 방향으로 발사 |
| zone | `{ shape, at, radius, duration, effect }` | 바닥에 남는 지속 장판 |

- z: ground / air / both (combat.md 2장)
- depth 기본 13 (좁은 판정 원칙). 광역만 넓게

---

## 2. weapons.json

```json
"greatsword": {
  "name": "대검", "moveMul": 0.9,
  "visual": "greatsword_basic", "poseSet": "greatsword",
  "trait": { "type": "charge", "maxTime": 1.0, "bonusMax": 0.5, "superArmorWhileCharging": true },
  "comboWindow": 0.3,
  "basic": [ action, action, action ],
  "dash": action,
  "baseSkills": ["gs_launch", "gs_earthsplit"]
}
```

| 필드 | 설명 |
|---|---|
| moveMul | 이동 속도 배율 (combat.md 기본 속도에 곱함) |
| visual | weapons_visual.json 프로필 |
| poseSet | poses.json 세트 |
| backstepStyle | 생략 = 기본 백스텝, "teleport" = 스태프 순간이동 (성능 동일) |
| trait | 무기 고유 특성. charge(대검) / cast(스태프, 설명용) / backAttack(쌍검) / null |
| comboWindow | recovery가 끝난 뒤 다음 평타 입력을 받아주는 시간. 넘기면 1타로 돌아감 |
| basic | 평타 단계별 행동 |
| dash | 달리기 중 평타 |
| baseSkills | 공용 기본 스킬 id (skills.json) |

### 평타 입력 규칙
- active~recovery 중 J 입력은 다음 단계로 예약 (선입력). recovery가 끝나면 바로 다음 단계
- 평타 recovery 중 스킬 입력 → 스킬로 캔슬 (combat.md 캔슬 규칙)

---

## 3. skills.json

행동 형식 + 아래 필드.

| 필드 | 설명 |
|---|---|
| weapon | 무기 id |
| name | 표시 이름 |
| branch | base / A / B |
| tier | 계열 스킬의 단계 (1~3, 각성 4) |
| cooldown | 기준 쿨 (실제 = × COOLDOWN_SCALE) |
| mp | 기준 쿨 × 2 (반올림). 검증 대상 |
| variants | 변형. 기본 스킬 필드를 덮어쓰는 객체 `{ "name": ..., 덮어쓸 필드 }`. 값이 null이면 기본 필드 제거 (예: hitbox → area로 바꿀 때 `"hitbox": null`) |
| note | 예산 규칙(balance.md 3장)을 벗어난 이유 |

- 변형의 특수 필드: reinput(재입력 횟수), repeat(`{count, interval}` 반복), after(`{delay, coef}` 후속 판정), onStatusEnd(상태이상 해제 시 판정)
- 현재 파일: MVP 범위(대검·스태프 공용 기본 스킬). 나머지는 skills.md 표를 이 형식으로 옮겨 추가

---

## 4. monsters.json

```json
"boar": {
  "name": "아기 멧돼지", "floor": 1, "rank": "normal", "sprite": "boar",
  "hp": 80, "weight": "medium",
  "hurtbox": { "width": 16, "height": 12, "depth": 10 },
  "move": { "x": 40, "y": 25, "style": "walk" },
  "detectRange": 96, "usesToken": true, "superArmor": "none",
  "ai": { "type": "charger", "preferRange": [32, 96] },
  "attacks": [ action ],
  "pattern": { "type": "choose", "rules": [ { "attack": "boar_charge", "range": [24, 96], "alignDepth": 6 } ] },
  "reward": { "coins": [6, 9], "exp": 8, "material": 0.15 }
}
```

| 필드 | 설명 |
|---|---|
| rank | normal / elite / boss |
| sprite | client/data/sprites/monsters.json id |
| hp | 그 층의 실제 체력 (층 배율은 새 층을 만들 때 적용하는 설계 규칙. 실행 중에는 인원 배율만 곱함) |
| weight | light / medium / heavy / fixed(띄우기·넉백 불가) / boss |
| hurtbox | 피격 판정 크기 (그림 크기와 최대한 일치) |
| move | 이동 속도(x 좌우, y 깊이)와 모양(hop / walk). null = 고정 |
| detectRange | 이 거리 안에 플레이어가 들어오면 반응 |
| usesToken | 공격 토큰 사용 여부 (일반 true, 정예·보스 false) |
| superArmor | none / attack(windup~active 동안) / always(그로기 때만 해제) |
| ai.type | melee(다가가서 때림) / charger(거리 두고 돌진) / turret(제자리 발사) / boss |
| ai.preferRange | 공격 준비를 시작하는 거리 범위 |
| ai.idleBetween | 보스: 공격 사이 쉬는 시간 범위 |
| attacks | 행동 목록 (예고 = windup) |
| pattern | 공격 선택 규칙 (아래) |
| groggy | 보스 그로기 `{ duration, superArmor, extend }` (dungeon.md 연장 규칙) |
| onWallHit | 공격 중 벽 충돌 시 `{ "selfStun": 1.0 }` 또는 `{ "groggy": true }` |
| reward | coins `[최소, 최대]`, exp, material(확률, 1 이상이면 개수), trophy, firstClear, skinDrop `{skin, chance, pity, perPlayer}` (보스 무기 외형, {weapon} = 쓰던 무기 종류) |

### pattern
- choose: 조건이 맞는 규칙 중 무작위 선택. 조건 = range(거리 범위), alignDepth(깊이 차이 이내일 때만, 돌진·발사형에 사용), hp 조건
- loop: 보스용. phases 배열을 순서대로, 각 phase는 sequence를 반복. `until: "hp<0.5"`를 만족하면 다음 phase로

---

## 5. 검증 (로드 시, zod)

- 플래그·strength·판정 모양 값이 정의된 것인지
- 포즈 이름이 poses.json의 해당 세트에 있는지, visual이 weapons_visual.json에 있는지
- 스킬 mp = 기준 쿨 × 2
- 몬스터 패턴이 참조하는 공격 id가 attacks에 있는지, sprite가 존재하는지
- 경고(오류 아님): 미작성 스킬 id, 디자인 미정 스프라이트
- 평타 초당 계수를 계산해 balance.md 4장 목표와 ±15% 넘게 차이 나면 경고
