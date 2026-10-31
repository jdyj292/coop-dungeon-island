# 게임 데이터 형식 (docs/data.md)

shared/data/의 weapons.json, skills.json, monsters.json, player.json, combat.json 형식 기준 문서.
규칙의 의미는 docs/combat.md, 수치 근거는 docs/balance.md, 스킬 목록은 docs/skills.md, 그림 데이터는 docs/sprites.md.
단위: 거리·크기 px (1타일 16), 시간 초, 속도 px/s.

---

## 1. 공통: 행동(action)

평타, 대시 공격, 스킬, 몬스터 공격은 모두 같은 행동 형식을 쓴다. 서버 전투 코드는 하나로 처리한다.

```json
{
  "id": "gs_b3",
  "phases": { "windup": 0.24, "active": 0.10, "recovery": 0.50 },
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
| 판정 (아래 중 하나) | O* | hitbox / area / projectile / zone / chain(스킬만, 3장) (*damage 0이고 zone도 없으면 생략 가능) |
| strength | | light / medium / heavy → 경직·밀림(combat.md 3장). 몬스터 공격이 heavy면 플레이어 다운 |
| flags | | combat.md 2장 속성 플래그 (launch, knockback, down, downhit, pull, hold, grab, multi, projectile) |
| launchVz | | launch 세기. 생략 시 combat.md 기본값 |
| hits | | 다단히트 `{ "count": 6, "interval": 0.1 }` (multi 플래그와 함께). active 시작부터 interval마다 판정 한 번, active 길이 ≥ count × interval |
| move | | 행동 중 이동 `{ "distance": 32, "during": "active" }` 또는 `{ "speed": 160, "maxDistance": 96, "during": "active", "stopOnWall": true }` |
| status | | 상태이상 `{ "type": "freeze", "time": 1.5 }` (freeze / slow / stun / hold = 공중 대상 체공 유지) |
| poses | 플레이어 | 구간별 포즈 이름 (poses.json의 해당 무기 세트). 몬스터: 구간별 스프라이트 상태 이름 — 다른 공격 그림을 같이 쓸 때 (예: `"windup:bear_paw"`, 없으면 `구간:공격 id`, 그것도 없으면 idle) |
| fx | | `{ "grade": "light|medium|heavy|ultimate", "shake": "vertical|horizontal" }` 연출 등급은 combat.md 5장 |
| sfx | | `{ "windup"?, "active"?, "hit"? }` 소리 이름 (client/data/sfx.json, docs/audio.md) |
| telegraph | 몬스터 | 예고 표시 `{ "type": "shake|area|line|glow|shake+line", "length": 96 }`. area는 판정 모양을 그대로 표시 |
| cooldown | | 스킬: 기준 쿨. 몬스터: 같은 공격 재사용 대기 |

### 판정 모양
| 종류 | 형식 | 위치 기준 |
|---|---|---|
| hitbox | `{ forward, width, depth, z, back? }` 사각형 | 바라보는 방향으로 forward만큼 떨어진 곳부터 width 길이. back은 뒤쪽 추가 |
| area | `{ shape: "circle|rect|fan", at: [x, y], radius / width·depth / angle, z }` | at = 행동자 기준 상대 위치 (x는 바라보는 방향 +) |
| projectile | `{ speed, range, radius, pierce, reflectable?, lanes?, burst?, back?, rehit?, blast?, aims?, meet?, fan? }` | 손 위치에서 바라보는 방향으로 발사. 플레이어: lanes = 깊이 오프셋마다 한 발씩 동시에, burst `{count, interval}` = 연발, back = 사거리 끝에서 던진 사람 쪽으로 같은 줄을 따라 돌아오는 왕복 횟수(지나치면 왕복 1번, 다리마다 같은 적을 다시 한 번, 못 따라잡으면 사거리 3배에서 끝), rehit = 관통하며 같은 적을 이 초마다 다시, blast `{radius, coef?, repeat? {count, interval}, shards? {coef, speed, range, radius, lanes}}` = 끝나는 자리(관통 아니면 처음 닿은 적 자리, 아니면 사거리 끝·벽) 원형 판정(coef 없으면 투사체 계수, 관통이 아니면 닿은 적에게 직접 피해 없이 폭발만), repeat = 그 자리에 여러 번, shards = 폭발 뒤 각 깊이 줄에서 앞뒤로 작은 투사체 한 발씩 (SK-4 1차b). aims `[[앞, 깊이], ...]` = 나가는 방향 목록(바라보는 쪽 기준, [1,0] 앞·[-1,0] 뒤·[0,-1] 위·[0,1] 아래, 줄마다 방향마다 한 발, 깊이로 가는 투사체는 방 깊이 끝에서 사라짐), meet `{at, coef, radius}` = 여러 줄(lanes)이 앞 at px 가운데 줄 한 점으로 비스듬히 모여 엇갈리고 엇갈리는 순간 그 자리 원형 폭발 (SK-7 십자 검기, sim/bolts.ts volley·meetPoint). 몬스터: fan `{count, angle}` = 조준 방향을 가운데로 angle도 부채꼴 안에 count발을 한 번에 (이끼곰 가시) |
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
| basicAdvance | `{ speed, stopBefore }` 평타 중 바라보는 방향 키를 누르고 있으면 전진하는 속도 px/s, 각 타 끝 stopBefore초 전부터는 전진 안 함 (생략 = 전진 없음, 대검 20·0.15) |
| recoilMul | 근접 역경직 배율: 내 공격이 맞으면 나만 히트스톱 × 이 값 (생략 = 1, 원거리 무기는 생략, combat.md 5장) |
| basicTurn | false면 평타 콤보 중 방향 전환 불가 (생략 = 평타 단계 사이 turnWindow 동안 가능, 대검 false) |
| backstepStyle | 생략 = 기본 백스텝, "teleport" = 스태프 순간이동 (성능 동일) |
| trait | 무기 고유 특성. charge(대검) / cast(스태프, 설명용) / backAttack(쌍검) / null |
| comboWindow | recovery가 끝난 뒤 다음 평타 입력을 받아주는 시간. 넘기면 1타로 돌아감 |
| basic | 평타 단계별 행동 |
| dash | 달리기 중 평타 |
| baseSkills | 공용 기본 스킬 id (skills.json) |
| branches | 계열 이름·특징 `{ A: { name, desc }, B: {…} }` (스킬 창 계열 버튼). 계열 스킬이 있는 무기는 필수 |

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
| desc | 스킬 창(K) 설명 (필수, 2줄 안: 패널 폭 196px). 변형에도 desc 필수 = 기본 스킬과 무엇이 다른지. 변형 desc는 판정에 덮어쓰지 않음 |
| branch | base / A / B |
| unlockLevel | 계열 스킬이 열리는 숙련도 레벨 (skills.md 1장, 계열마다 2·4·6·8, 3단계 11·13). 기본 스킬은 없음(처음부터) — data-validate가 검사 |
| superArmor | 시전 중 슈퍼아머 (combat.md 3장) |
| repeat | 기본 스킬에도 둘 수 있는 반복 판정 (아래 특수 필드) |
| onWall | 벽꿍 `{coef}` (아래 특수 필드) |
| cooldown | 기준 쿨 (실제 = × COOLDOWN_SCALE) |
| mp | 기준 쿨 × 2 (반올림). 검증 대상 |
| variants | 변형. 기본 스킬 필드를 덮어쓰는 객체 `{ "name": ..., 덮어쓸 필드 }`. 값이 null이면 기본 필드 제거 (예: hitbox → area로 바꿀 때 `"hitbox": null`), 객체 필드는 얕게 합치고 안쪽 null도 그 키를 지움 (예: `"projectile": {"back": null}`) |
| note | 예산 규칙(balance.md 3장)을 벗어난 이유 |
| element | 원소 fire / ice (보조 노드 연소가 봄) |
| lasting | 장판·지속 스킬 (보조 노드 원소 친화가 상태 이상 시간·repeat 횟수·allyBuff 시간을 늘림) |
| chain | 연쇄 판정 `{range, jump, count, interval}` (번개 연쇄): 앞쪽 range px 안 가장 가까운 적부터, 지난 대상에서 jump px 안의 아직 안 맞은 가장 가까운 적으로 interval초마다 최대 count마리. 판정 모양 하나로 셈 (sim/chain.ts) |
| mark | 검흔 `{time, coef, hop? {range, count}}` (검흔 베기): 맞은 적에 time초 표식, 표식을 건 사람의 투사체가 그 적을 맞히면 터지며 coef(표식은 사라짐), hop = 터질 때 range px 안 가장 가까운 다른 적에게 옮겨감(최대 count번) (sim/scar.ts) |
| allyBuff | 아군 버프 `{cooldownMul, time}` (가속장): active 순간 나와 판정 범위 안 동료의 스킬 쿨이 time초 동안 cooldownMul배 빨리 돎 (겹치면 더 센 배율·긴 시간, 물약·회피 쿨은 그대로) |
| chargeRule | 대검 충전 규칙 `{timeMul?, bonusMul?, off?}` (SK-7 파쇄참): 충전 최대 시간 × timeMul, 최대 보너스 × bonusMul, off = 키를 누르고 있어도 충전 없음 (charge.ts) |
| armorBreak | 슈퍼아머 대상도 이 초만큼 경직 (파쇄참, sim/strike.ts) |
| keepDown | true면 땅의 적을 밀지 않고 바로 다운 (다시 맞으면 다운 시간 처음부터, 대지붕괴) |
| repeatEnd | 반복이 끝날 때 마지막 판정 자리에서 한 번 더 `{coef, launch?}` (launch = 땅·공중·다운 모두 띄움, 대지붕괴 솟구침. 보조 구슬 확장도 이 필드를 붙임) |
| trail | `{delay, coef}` 맞힌 적마다 delay초 뒤 그 적에게 한 번 더 coef (어디로 움직였든, 기절·다운이면 없음. 일섬 반환, sim/phantom.ts) |

- 특수 필드: reinput(재입력 횟수), repeat(`{count, interval, step?, seek?, copies?}` 반복: step = 판정마다 앞으로 px, seek = 판정마다 가까운 맞을 몬스터 쪽으로 px, copies = `[[앞, 깊이], ...]` 자리에 같은 반복을 첫 판정부터 더), after(`{delay, coef}` 후속 판정), onStatusEnd(상태이상 해제 시 판정), onWall(`{coef}` 벽꿍). 기본 스킬에 repeat가 있으면 변형은 일부 키만 덮어써도 됨
- 적용은 shared/src/skillTree.ts resolveSkill (덮어쓰기 + 특수 필드 + 계수에 레벨 배율), 특수 판정은 shared/src/sim/skillExtras.ts: 반복·후속 = 시전한 자리·방향에 같은 판정을 예약(반복은 count번 중 첫 판정 뒤 나머지), 해제 = 그 행동이 건 빙결이 풀릴 때 그 몬스터에 한 번(빙결·띄우기 없이), 재입력 = 같은 스킬을 쿨타임·MP 없이 (스킬 recovery 또는 끝난 뒤 combat.json skillTree.reinputWindow 안). status slow = 몬스터 걷는 속도·공격 쿨타임·공격 사이 쉬는 시간이 × (1 − amount)로 흐름
- 현재 파일: 대검·스태프 공용 기본 스킬 + A·B 계열 액티브(Lv 2~8), 대검 A·B 계열 3단계(SK-7). 나머지는 skills.md 표를 이 형식으로 옮겨 추가
- **passives.json (패시브: 계열 보조·공용)**: `{ id, weapon, branch: A|B|common, unlockLevel, name, desc, pointDesc: [1·2·3포인트 줄], effect }`. 0~maxPoints(combat.json skillTree) 포인트, effect 값이 배열이면 포인트별(길이 = maxPoints, data-validate), 숫자 하나면 포인트와 상관없음 (passives.ts perksOf). effect 키: chargeSpeedMul(대검 충전 속도 배율, 최대까지 maxTime / 값), chargeTakenMul(충전 중 받는 피해 배율), skillArmor(모든 스킬 슈퍼아머), skillTakenMul(스킬 시전 중 받는 피해 배율), far `{minDist, mul}`(나와 적 거리가 minDist px 넘으면 피해 배율), projectileRangeMul(투사체 스킬 사거리 배율), lastingMul(lasting 스킬 상태 이상 시간·repeat count 배율, 횟수는 반올림), burn `{element, time, takenMul}`(그 원소 스킬 적중 대상이 time초 동안 받는 피해 배율), press `{takenMul}`(내 status slow에 맞은 적이 감속 동안 받는 피해 배율), dodge `{distanceMul, cooldownAdd}`(회피 거리 배율·쿨 더하기), cancel `{windupMul: [포인트별]}`(스킬 캔슬: 스킬 recovery → 다른 스킬, 이은 스킬 windup 배율), quickRise(다운 중 회피로 기상), quickRiseCooldownAdd(기상 회피로 시작한 회피의 쿨 더하기), SK-4 3차: aftershock `{coef, radius}`(내 down 판정이 맞힌 적 자리 충격파), downDamage(다운 대상 피해 배율, 기본 combat.json downDamageMul), launchWave `{skill, coef, speed, range, radius}`(그 스킬 active 때 관통 검기), cycle `{sec}`(스킬 투사체 적중 시 시전 한 번에 한 번 다른 스킬 쿨 감소), freezeAdd(빙결 시간 더하기), overheat `{time, delay}`(스킬 적중 뒤 time초 동안 평타 투사체 한 발 더), repeatEnd `{skill, radiusMul, coef}`(그 반복 스킬 반지름 배율·마지막 판정 뒤 한 번 더), aegis `{radius, time, cooldown}`(스킬 사용 시 범위 안 아군 피해 1회 무효 보호막·내부 쿨), SK-7: chargeBonusAdd(대검 충전 최대 보너스 더하기), aura `{radius, amount}`(내 둘레 radius px 안 적 감속 amount, 매 틱 0.2초씩 다시 걺), phantom `{delay, mul}`(잔상: 근접 상자·투사체 스킬을 delay초 뒤 같은 자리·방향에서 계수 × mul로 한 번 더, sim/phantom.ts), dance `{mul}`(검의 춤: 스킬 캔슬로 이은 스킬 계수 × mul, actions.ts withWindupMul). launchWave·repeatEnd의 skill은 그 무기 스킬이어야 함(repeatEnd는 repeat 스킬, data-validate). 공용 패시브 = weapon "*"·branch common, 무기마다 `<무기>.<id>` 노드로 펼침 (load.ts). 노드 id는 행동 id와 겹치면 안 됨 (data-validate). 예산 검사 대상 아님
- 예산 검사(balance-check)는 한 번 쓸 때 계수 합 = coef × hits·repeat(copies 포함)·burst·lanes 수 × 왕복(back × 2). 연쇄는 한 대상 기준, blast·mark 계수는 빠짐. 레벨 배율·대검 충전은 blast·shards·mark·trail·meet 계수도 키움 (actions.ts scaleExtraCoefs)

---

## 4. monsters.json

```json
"boar": {
  "name": "아기 멧돼지", "floor": 1, "rank": "normal", "sprite": "boar",
  "hp": 80, "weight": "medium",
  "hurtbox": { "width": 26, "height": 16, "depth": 12 },
  "move": { "x": 40, "y": 25, "style": "walk" },
  "detectRange": 96, "usesToken": true, "superArmor": "none",
  "ai": { "type": "charger", "preferRange": [32, 96] },
  "attacks": [ action ],
  "pattern": { "type": "choose", "rules": [ { "attack": "boar_charge", "range": [24, 96], "alignDepth": 6 } ] },
  "reward": { "coins": [2, 4], "exp": 3, "material": 0.06 }
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
| ai.idleBetween | 보스: 공격 사이 쉬는 시간 범위 (pattern phase에 idleBetween이 있으면 그 단계는 그 값) |
| attacks | 행동 목록 (예고 = windup) |
| pattern | 공격 선택 규칙 (아래) |
| groggy | 보스 그로기 `{ duration, superArmor, extend }` (dungeon.md 연장 규칙) |
| onWallHit | 공격 중 벽 충돌 시 `{ "selfStun": 1.0 }` 또는 `{ "groggy": true, "bounce"?: n }` (bounce = n번은 방향을 뒤집어 이동 구간 처음부터 다시 구르고 그다음 벽에서 그로기) |
| reward | coins `[최소, 최대]`, exp, material(확률, 1 이상이면 개수), trophy, firstClear, skinDrop `{skin, chance, pity, perPlayer}` (보스 무기 외형, {weapon} = 쓰던 무기 종류) |

### pattern
- choose: 조건이 맞는 규칙 중 무작위 선택. 조건 = range(거리 범위), alignDepth(깊이 차이 이내일 때만, 돌진·발사형에 사용), hp 조건
- loop: 보스용. phases 배열을 순서대로, 각 phase는 sequence를 반복. `until: "hp<0.5"`를 만족하면 다음 phase로. phase마다 idleBetween을 따로 둘 수 있다 (분노)
- 깊이 조건: alignDepth가 없으면 공격 판정 깊이의 절반 (hitbox.depth / 2, area면 radius / 2) 안에서만 공격
- loop 공격은 거리 조건이 없으므로 닿을 수 있을 때(판정에 들어옴, 돌진형은 깊이 정렬)까지 다가간 뒤 쓴다. 투사체 공격은 사거리 안이면 쏜다. 공격 사이 ai.idleBetween(또는 phase idleBetween) 쉼
- 공격이 없을 때 위치: melee는 첫 규칙 range 가운데 거리, charger는 combat.json ai.chargerDistance, turret은 제자리, 토큰이 없으면 ai.orbitDistance에서 맴돌기

---

## 5. 검증 (로드 시 zod + `pnpm data-validate`)

- **형식 (로드 시)**: shared/src/data/schema.ts. 게임·서버는 shared/src/data/load.ts의 `WEAPONS`·`SKILLS`·`MONSTERS`·`ROOMS`·`PLAYER`·`COMBAT`만 쓴다 (JSON 직접 import 금지). 틀리면 로드할 때 파일·경로와 함께 오류
  - 모르는 키(오타) 금지, 플래그·strength·판정 모양·telegraph 값은 정의된 것만, 판정은 hitbox / area / projectile / zone / chain 중 하나 (damage 0이면 생략 가능)
- **교차 참조 (`pnpm data-validate`, shared/src/data/crossCheck.ts)**. 오류:
  - 포즈 이름이 무기 poseSet 세트(poses.json)에 있는지, visual이 weapons_visual.json에 있는지
  - 스킬 mp = 기준 쿨 × 2 (반올림), 스킬의 weapon이 있는지, 변형을 적용한 결과도 스킬 형식인지
  - 몬스터 패턴이 참조하는 공격 id가 attacks에 있는지, sprite가 client/data/sprites/monsters.json에 있는지, 보스에 groggy가 있는지
  - rooms.json의 몬스터·보스 id가 있는지, 행동 id가 전체에서 고유한지
  - 맵 (shared/src/map/check.ts, rooms.json `map` → maps/<map>.json): 방 크기가 rooms.json size와 같은지, player_start 4개·door_in·door_out(보스 방 제외)·onClear의 return_point·chest, 웨이브별 spawn 수 ≥ 몬스터 수, 출현·시작 지점이 장애물과 겹치지 않는지, 장애물이 세로줄 전체를 막지 않는지. 장애물 4칸 이상은 경고
- 경고(오류 아님): baseSkills 중 skills.json에 아직 없는 스킬, 평타 초당 계수(계수 합 ÷ 구간 길이 합)가 balance.md 4장 목표와 ±15% 넘게 차이
- 평타 목표값은 tools/data-validate/rules.json (balance.md 4장과 같은 값 유지)

---

## 6. player.json

```json
{ "move": { "walk": { "x": 48, "y": 32 }, "run": { "x": 96, "y": 60 } }, "runDoubleTap": 0.25 }
```
| 필드 | 설명 |
|---|---|
| move.walk / move.run | 기본 이동 속도 px/s (x 좌우, y 깊이). 의미는 combat.md 1장, 무기별 배율은 weapons.json moveMul |
| runDoubleTap | 달리기: 같은 방향 좌우를 두 번 누르는 사이 최대 시간 (초) |
| hp | `{ base, perLevel }` 최대 HP = base × (1 + perLevel × (숙련도 − 1)) (balance.md 5장) |
| mp | `{ max, regen, onHit }` 최대 MP·초당 회복·적중 1회당 회복 (balance.md 6장) |
| revive | `{ feathers, hpRatio, invuln, partyHpRatio, holdSec }` 솔로 부활의 깃털 수·깃털 부활 HP 비율·부활 무적, 동료 부활 HP 비율·E 누르는 시간 (combat.md 4장) |
| level | `{ expBase, expPow }` 숙련도 필요 경험치 = expBase × 레벨^expPow (balance.md 7장) |
| hurt | `{ stunSec, downSec, getupInvuln, push { light, medium, heavy }, pushSec }` 약·중 공격 경직, 강 공격 다운, 기상 무적, 세기별 넉백 거리(px)와 밀리는 시간 (combat.md 4장) |
| potions | `hp { heal(최대 HP 비율), cooldown, carry }`, `mp { amount, cooldown, carry }` (balance.md 6장, carry = 반입 한도) |
| ultimate | `{ max, onHit, onHurt, onTeamMilestone }` 필살기 게이지 최대·적중 1회·피격 1회·팀 콤보 단계 달성 시 전원 증가량 (balance.md 8장) |
| hurtbox | 플레이어 피격 판정 크기 `{ width, height, depth }` (몬스터 공격·투사체) |
| backstep | `{ distance, sec, invuln, cooldown, depthDistance }` 회피 좌우 거리(px)·시간·앞쪽 무적 시간·쿨·위아래(깊이) 거리(px). 행동 중에는 후딜레이에서만 회피 (combat.md 1장) |
| stamina | `{ max, dodge, runPerSec, regen, regenDelay }` 지구력 최대·회피 1회 소모·달리기 초당 소모·초당 회복·회복 시작 대기(초) (combat.md 1장) |

- 이동 계산은 shared/src/movement.ts (클라이언트·서버 공용): 축마다 따로 움직이고 대각선도 정규화하지 않는다. 행동 중 이동(move)은 actions.ts actionMoveDelta, 판정 모양은 shapes.ts
- 모든 진행은 1/60초 고정 틱 (shared/src/tick.ts, docs/network.md 12장)

---

## 7. combat.json

combat.md 3·5장의 공통 수치. 의미·근거는 combat.md, 이 문서는 형식만.

| 필드 | 설명 |
|---|---|
| baseAtk | 숙련도 1레벨 ATK (balance.md 1장). 데미지 = ATK × coef / 100 |
| atkPerLevel | 숙련도 레벨당 ATK 증가율 0.05 (balance.md 1장, 코드 atkFor) |
| gravity, launchVz, airHitVz, airGravityMul, maxAirHits, bounceVz | 높이(z)·공중 콤보 보정 |
| downSec, downSlide, getupSec, wallStunSec | 다운 시간·다운 미끄러짐(px)·기상 무적·벽꿍 추가 경직 |
| pushRate | 밀림이 남은 거리를 줄이는 속도 (초당 비율, 클수록 짧고 세게 밀림) |
| turnWindow | 평타 recovery 진입 직후 방향 전환을 받는 시간 (무기 basicTurn false면 없음) |
| cooldownScale | 전역 쿨타임 배율 (balance.md 2장). 실제 쿨 = 기준 쿨 × 이 값 |
| skillTree | 스킬 포인트 (skills.md 1장): maxPoints(노드 최대, 액티브·패시브), levelMul(액티브 포인트별 레벨 배율, balance.md 1장), reinputWindow(변형 재입력을 받는 시간, 스킬이 끝난 뒤 초) |
| stunExitSec | 기절(체력 0) 뒤 퇴장까지 시간 |
| stun.{light,medium,heavy} | `{ time, push }` 경직 시간·밀림 거리 |
| weightMul | 무게별 경직·밀림 배율 (light·medium·heavy·fixed·boss). fixed는 경직에만 쓰고 밀림·띄우기·넉백은 무시 |
| grades.{light,medium,heavy,ultimate} | `{ hitstop, shake }` 히트스톱 초, 흔들림 px (0 = 없음) |
| shakeAfterHitstop | 흔들림 길이 = 히트스톱 + 이 값 |
| partyHpMul | 인원 1~4명 몬스터 체력 배율 (balance.md 5장) |
| interactRange | E 상호작용 거리 px (보물상자) |
| returnSec | 귀환 지점: 살아 있는 전원이 고리 안에 이만큼 서 있으면 성공 귀환 |
| resultDelaySec | 전멸·보스 처치 뒤 결과 화면까지 |
| settle | `{ treasury, wipeCoinLoss }` 정산: 코인 중 공동 금고 비율, 전멸 시 코인 손실 비율 (CLAUDE.md 핵심 규칙) |
| exit | `{ halfWidth, depth }` 출구 앞 구역: 문 앞 바닥에서 좌우 ±halfWidth, 깊이 depth px까지 (dungeon.md 2장 방 진행) |
| arriveSec | rooms.json wellDrop 방에서 우물로 떨어지는 시간: 조작 불가·맞지 않음 (dungeon.md 2장). 화면의 떨어지는 높이·웅크림은 client fx.json wellHop |
| combo | `{ windowSec, teamMilestones, soloMilestones, coinBonus }` 콤보가 이어지는 시간 (dungeon.md 3장), 팀·개인 콤보 단계와 단계별 코인 보너스 (balance.md 7장) |
| tokens | 공격 토큰 수 (인원 1~4 순서, balance.md·dungeon.md 3장) |
| tokenGap | 토큰 하나를 내준 뒤 다음 토큰까지 초 (인원 1~4 순서, 0 = 간격 없음) |
| ai | 몬스터 AI 공통: hopSec·hopMove(튀기 박자·이동 비율), orbitDistance·orbitDepth(토큰 없을 때 기다리는 타원의 좌우·깊이 반지름, combat.md 6장), chargerDistance(돌진형이 거리 두는 위치), separation(겹침 풀기 여유 px), aimDepth(대각선 조준 최대 깊이 px), spread { x, y, lane }(퍼지기: 자리 겹침 판정 좌우·깊이 px, 옆 줄 간격 px) (combat.md 6장) |

- 행동 진행은 shared/src/actions.ts, 판정·데미지는 hit.ts, 피격 반응·높이는 body.ts (클라이언트·서버 공용)
- 연출 값(번쩍임 프레임, 섬광, 숫자, 스미어 모양, 리듬 오프셋)은 client/data/fx.json (docs/motion.md)

---

## 8. island.json

섬 공간 (island.md 2장). 단위는 칸 (1칸 = 16px, 화면 16×10). 형식 shared/src/data/islandSchema.ts, 계산 shared/src/island/world.ts

| 필드 | 설명 |
|---|---|
| grid | `{ w, h }` 섬 격자 40×30 |
| shoreRows | 맨 앞 줄 수: 모래·흙 절벽·물 (화면 30px = 3칸, 걸을 수 없음) |
| walk | `{ x, y, w, h }` 걸을 수 있는 영역 (가장자리 나무 안쪽) |
| place | 장식을 놓을 수 있는 영역 (약 30×22) |
| facilities | `{ id, name, x, y, w, h, fixed? }` 시설: 그림 id(client/data/sprites/island.json), 이름(게시판 기록), 새 섬의 칸. 걸어서 지나갈 수 없음. fixed = 옮길 수 없음 (우물). 옮긴 위치는 DB island_facilities (island.md 2장) |
| paths | 처음부터 깔린 흙길 (바닥 무늬만, 데모 길 무늬) |
| scenery | `{ id, x, y, ground? }` 배경 사물 (가장자리 숲, 선착장). 칸 = 발밑. ground = 바닥 높이 (캐릭터가 위를 걸음, 늘 캐릭터 아래에 그림) |
| spawn | `{ login, return }` 들어오는 자리 `{ x, y }`: login = 접속 (선착장), return = 던전 복귀 (우물 앞). 사람마다 옆으로 한 칸 (island.md 2장) |
| returnWindowSec | 던전에서 나온 뒤 이 초 안에 들어오면 return 자리 |
| starterDecor | `[{ itemId, x, y, rot }]` 새 섬에 처음부터 놓인 공용 장식 (island.md 7장) |
| interactRange | 시설 [E] 거리 px (시설 앞 가운데부터, 넓은 시설은 폭 안이면 0) |
| well | `{ countdownSec, maxParty, floors }` 우물 출발: 카운트다운 초, 파티 최대, 갈 수 있는 층 (rooms.json 키) |

- data-validate: 그림 id가 섬 사물 그림에 있는지, 칸이 격자(물가 제외) 안인지, starterDecor가 있는 장식인지. 기본 장식이 모두 놓을 수 있는 자리인지는 placement.test.ts

---

## 9. items.json

섬 장식 (island.md 3장). 형식 shared/src/data/islandSchema.ts `items`

| 필드 | 설명 |
|---|---|
| decorations.<id> | `{ name, size: [가로, 세로], price, walkable, source, ground? }` id = 그림 id (client/data/sprites/island.json). source: shop(잡화점·개인 지갑) / treasury(공동 금고 → 공용 창고). ground = 그림 없이 바닥 무늬 (돌길) |
| consumables.<id> | `{ name, price }` 잡화점 소모품 (hpPotion·mpPotion). 가방에 쌓이고 던전 입장 때 한도까지 지참 (4-8) |
| materials.<id> | `{ name, floor }` 층 재료 (1층 mushroom = 버섯). 던전 정산 때 가방으로 (4-8) |
| starter | 가입 선물 `{ 장식 id: 개수 }` |

- 회전 1·3이면 차지하는 칸의 가로·세로가 바뀜 (shared footprint). 그림 모습은 sprites.md 12장 rot
- data-validate: 그림이 있는지(ground 제외), 가입 선물이 있는 장식인지
