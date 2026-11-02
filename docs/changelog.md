# 완료 기록 (docs/changelog.md)

마일스톤·작업이 끝날 때마다 한 줄씩 덧붙이는 기록. 자동으로 읽히지 않는다 (CLAUDE.md "현재 상태"는 3줄만).
규칙의 기준은 각 문서 — 이 파일은 "언제 무엇을 했나"만. 자세한 변경은 git log.

- M0~M4 완료. M5 5-1(프로덕션 빌드 dist/)
- 5-2(Origin 제한·CSP)
- 5-3(관리자 명령·온라인 백업)
- 5-4(deploy/: Nginx 틀·systemd·백업 cron·install.sh·coop-admin, docs/deploy.md 5장)
- 섬 목록·입장 신청(초대 코드 없앰, 섬 주인이 게시판 주민 탭에서 허용, 섬 주민 10명·던전 파티는 4명, island.md 7장)
- 숙련도 ATK 반영
- 던전 말풍선
- 보스 한글 이름
- 볼륨 설정(Esc 설정 패널)
- 이모트 1~4
- 머리 모양·머리색(설정 외형 탭)
- 섬 걷기 다리 떨림(고주사율) 수정
- 회피(백스텝 → 방향키 쪽, 쿨 0.6초)·지구력(회피·달리기 소모, HUD 바)
- 난이도 1단계(웨이브 하나로·몬스터 이동 +40%·공격 범위 확대·플레이어 −20%·근접 역경직)
- 2단계(피격 넉백)
- 3단계(몬스터 퍼지기·대각선 조준)
- 2차 튜닝(바로 덤벼듦·포자꽃 사거리 224·버섯 박치기 28px·둘레에서 기다리기, run-sim 무적 2인 약 8분)
- 대시 역경직 보정
- 회피 개선(앞회피 예측 수정·지구력 17.5)·대검 평타 전진·대시 후딜 0.55
- 대검 평타 타마다 다른 포즈(2타 draw→sweep, 3타 heave→rise)
- 회피는 행동 후딜레이(recovery)에서만·바로 끊음
- 평타 전진 각 타 끝 0.15초 전 멈춤
- 포자꽃 비스듬히 조준
- 대검 3타 띄우기·평타 중 방향 전환 불가
- 위아래·대각선 회피(깊이 24px)
- 섬 배치 모드 마우스 커서는 시야 고정(키보드 커서만 카메라 추적)
- 온라인 회피 끝 앞으로 당겨짐 수정(서버 dodgeStart)
- 온라인 대시 적중 뒤로 당겨짐 수정(플레이어 시작 시각 1ms 단위)
- 던전 아래 HUD 묶음형(상태·스킬·소지품 묶음 3개, 반투명, 승인 데모 hud_bottom_cluster.html)
- 섬 아래 HUD·배치 모드 띠 묶음형(island_hud_cluster.html, B 울타리·M 그림이 키 글자 안 가림)
- 섬 카메라 세로 추적(몸 가운데 기준·데드존 ±12)
- 달리기 유지(위아래만 눌러도 달림, 대시 공격은 좌우를 누를 때만)
- 근접 역경직 양쪽(맞은 몬스터도 히트스톱 × 2)·솔로 토큰 간격 0.6초
- 통통버섯 박치기 예고 0.8초
- 온라인 적중 직후 회피 거절(제자리 점프) 수정(서버 회피 보관)
- 섬 꾸미기(접속은 남쪽 선착장·던전 복귀는 우물 앞, 가장자리 숲 겹치기, 새 섬 기본 장식, 얼룩 잔디) 완료
- 우물 입장 개편(섬: 던전 입구 우물 그림·우물로 뛰어들기·우물에서 튀어나오기 / 던전 1번 방 "우물 밑 숲": 흙 천장·밧줄·빛줄기, 우물에서 떨어져 착지(서버 arrive 0.5초 조작 불가·무적), 버섯 잠든 채 시작(wakeSec 1.5초, 맞으면 그 버섯만 깸) / 효과음 wellJump·wellLand·monWake, run-sim 봇 장애물·방 끝 고침) 완료
- 우물에 뛰어든 뒤 원래 자리에 캐릭터가 다시 보이던 문제 수정
- 던전 배경 숲으로(벽돌·돌 타일·흙 천장·뿌리·밧줄 → 나무줄기·둥근 덤불·풀밭·햇빛 얼룩·잎 덮개, art.md 6장)
- 섬 구름 그림자(뭉게구름 윤곽·가로로만 천천히, islandSky.ts·fx.json islandSky, 햇빛 효과는 검토 후 뺌)
- 섬 건물 입체감(정면형 좌우 대칭: 공용 창고 지붕 윗면·처마 그늘·들어간 문·양옆 창, 잡화점 안쪽 뒷벽·진열대 윗면)·섬 사물 땅 그림자(castShadow.ts, fx.json islandShadow)
- 스태프 마법 이펙트 다듬기(색 단계·바둑판 사라짐·준비 모으기·도는 마법진·구슬 마법탄, spellDraw·spellFire·spellIce 분리)
- 시설 옮기기(우물 빼고 주민 누구나 배치 모드에서, 섬마다 DB island_facilities, island.md 2장)
- 무기 고르기를 우물 패널 → 가방 장비 탭으로(hud.md 8장)
- 스킬 포인트 SK-1(기본 스킬 1~3포인트·레벨 배율·변형 택1·초기화, SP = 숙련도 레벨 − 1, 가방 스킬 탭, DB skill_nodes, 변형 특수 판정 재입력·후속·반복·해제·감속, skills.md 1·7장)
- 개발 테스트 계정 ADMIN(섬 입장마다 Lv20·지갑 99,999, production 꺼짐, playtest.md 1장)
- 대검 이펙트 개선(2타 가로베기·3타 올려베기 궤적 추가, 궤적 유지 등급별, 대지가르기 땅 균열·링·먼지, 대시 찌르기 5줄·출발 먼지, art.md 7장·motion.md 2장)
- 스킬 창 분리(K, 무기별 탭, 가방은 장비·장식·물약·재료)·설명 상자(skills.json desc, hud.md 8장)
- 섬 HUD 처음 하는 사람용(아래 띠는 가운데 버튼 묶음 하나: 16px 칸·그림 망치/배낭/별/게시판·키 꼬리표(island_hud_icons.html A)·마우스 이름표, Esc 설정 도움말 탭(섬·던전), 돈은 가방 아래 상자, 얼굴·지갑 묶음·주민 목록·시설 이름표·우물 화살표 뺌, 승인 데모 island_hud_help.html)
- 카메라 멀리(내부 288×162 → 384×216, 1920px 창 6배 → 5배, 던전 전투 구역 세로 가운데, art.md 1장)
- 던전 방 크게(가로 ×4/3·깊이 11~14타일, FIELD_BOTTOM 190, 화면 높이 186 미만 배율 안 씀·낮으면 맨 위 장식 자름, 깊이 이동 +25% 40/76, 섬 입장 때 카메라가 내 캐릭터 가운데로 바로(로직 좌표를 화면 좌표로 착각하던 버그, 접속·내 주민 상태 도착 전에는 어둡게 가렸다가 맞춘 뒤 0.25초 밝힘), 맵 비율 이동, run-sim 봇 12초 못 잡으면 목표 바꿈, 무적 2인 약 8분, dungeon.md 5·10장)
- 변형 연출(동토 장판·감속 몬스터 발밑 눈송이(서버 slowed), 부채꼴 균열 5줄, 검풍 등 뒤 스미어, motion-preview 변형 고르기, art.md 7장)
- SK-2 1차 계열 1단계 액티브 8개+변형 16개(0포인트 시작·같은 단계 택1·O/P 슬롯, 새 판정 다단·슈퍼아머·hold·pull·벽꿍·여러 줄·연발·반복 이동, 연출·아이콘은 기존 재사용·임시, skills.md 1장·roadmap SK-2)
- SK-2 2a 계열 스킬 연출(회전 고리·속도선·발도 섬광·초승달 검기·얼음 창·불기둥·부유 구슬·끌어올림, fx.json branch, 온라인 bolt에 speed·r 추가로 계열 투사체도 보임, art.md 7장)
- SK-2 2b 계열 스킬 효과음 8개(skill_whirl·shoulder·wave·draw·pillar·icelance·orb·lift, audio.md 3장)
- SK-2 2c O·P 아이콘 8개(hud_icons.json, sprite-preview HUD 탭 J U I O P) → SK-2 2차 완료
- SK-2 3차 계열 1단계 보조 노드 8개(passives.json·passives.ts, 같은 계열 보조 택1·1포인트, 스킬 창 "보조 이름 N/1", 무거운 손 = 충전 전 대체(스킬 준비 ×0.77·시전 중 피해 −30%), 가벼운 발 쿨 −0.2초, skills.md 1~3·7장)
- SK-3 1차 대검 충전(스킬 키 누르고 있기 → 준비 끝에서 최대 1초, 피해·범위 최대 +50%, 충전 중 슈퍼아머, 무거운 손 원래 효과 충전 속도 +30%·충전 중 피해 −30%, charge.ts, 온라인 chargeRelease, skills.md 2장)
- 보조 노드 연출(연소 = 머리 위 불꽃·떠오르는 불씨, 무중력 = 몸 둘레 도는 반짝이, fx.json spell.burning·weightless, 서버 burning·weightless, motion-preview 보조 고르기, art.md 7장)
- SK-4 1차a 계열 2단계(같은 계열 1단계 3포인트에서 열림·조건 깨지면 자동 지움·SP 반환, 슬롯 장착 U I O P(스킬 창 Enter·장착 버튼, DB skill_nodes.slot, 마이그레이션 0010), 지진·회오리 검기·중력 우물·중력장(부양장), 감속은 공격 쿨·쉬는 시간도 늦춤, skillLoadout.ts, skills.md 1·2·3장)
- SK-5 공용 패시브(스킬 캔슬 1~3 = 스킬 후딜레이 → 다른 스킬, 이은 스킬 준비 ×1.5/1.3/1.15 · 기상 회피 1 = 다운 중 회피 키로 기상, passives.json weapon "*" → 무기마다 greatsword.cancel 등, 스킬 창 맨 위, skills.md 1장)
- SK-6 1차 스킬 개편 규칙(단계·택1 없앰 → 숙련도 레벨로 열림·무기마다 계열 하나 선택·계열마다 장착 기억 skill_slots·SP로 액티브 2·3포인트·패시브 1~3포인트 포인트별 값·변형은 열리면 바로, 던전은 출발 때 effectiveBuild, 마이그레이션 0011, skills.md 1장, 승인 데모 skill_window.html)
- SK-6 2차 트리형 스킬 창(계열 버튼·액티브/패시브 탭·상세·끌어다 장착·키보드, ui/skillWindow.ts·skillDetail.ts·skillParts.ts, 상태 stage/islandSkills.ts, 임시 그림 hud_icons.json glyphs, 색 palette global.ui.skill*, hud.md 8장)
- SK-6 3차 정식 16×16 아이콘 14개(계열 2단계 액티브 4·보조 8·공용 2, hud_icons.json slots, 안 배운 패시브 회색, 임시 그림 glyphs 없앰, sprite-preview HUD 탭 초안은 스킬 창 22px 칸·회색으로도 보임, hud.md 2·8장)
- 공중 이점 노드 교체(보스는 뜨지 않음: 날 선 칼날 = 48px 넘게 떨어진 적 피해, 회오리 검기·부유 구슬 = hold 대신 감속(구슬은 땅 적도), 무중력 → 중압(내 감속 대상 받는 피해, id st_weightless·그림 그대로), 부양장 → 압축장(60%·2초), 문서만: 승천검 → 검흔 베기·공중 연계 → 검기 순환·구슬 확장, 원칙 skills.md 6장)
- SK-4 1차b 새 판정 5개(대검 투척 = 돌아오는 관통 투사체 갈 때·올 때 각 300%·꽂기·부메랑, 검흔 베기 = 표식 3초·내 투사체가 맞히면 터짐 200%·연쇄/깊은 검흔, 번개 연쇄 = 앞 7타일부터 최대 5마리, 화염구 = 착탄 폭발·분열·관통 다단, 가속장 = 나와 범위 안 동료 스킬 쿨 4초 ×1.2, sim/echoes.ts·bolts.ts·chain.ts·scar.ts, 연출·소리·아이콘은 임시 재사용, skills.md 2·3장·data.md 3장)
- SK-4 3차 2단계 보조 8개(여진·짓밟기·올려 검기(옛 검풍)·검기 순환·냉기 강화·과열·구슬 확장·역장, passives.json 새 effect 키, 다운 대상 피해 ×0.5 combat.json downDamageMul 실제 적용, skills.md 2·3장)
- SK-4 2차 연출·효과음·아이콘(도는 대검·화염구·번개 줄·검흔 표식/터짐·꽂기·여진·구슬 끝 폭발·가속·역장 보호막, fx/tier2Fx.ts·statusFx.ts, 서버 echo look·scarred·hasted·shielded, 효과음 12개, 아이콘 12개, 미리보기 생략 요청)
- SK-3 2차 대검 충전 연출(충전 포즈 허리 옆 쥐기 skills.json poses.charge·머리 위 스킬은 그대로, 모이는 빛 fx/chargeFx.ts·fx.json chargeGlow, 효과음 charge_start·charge_full, 서버 chargeMs·chargeLv·충전 중 actionStart 고정, 미리보기 생략 요청)
- 대검 스킬 모션·이펙트 다듬기(스킬 전용 포즈 6개 spinBack·tackle·throwWind·throwRelease·iai·cleave, 포즈 body.lean, 회전베기·회오리 검기 방향 번갈아 돌기 playerMotion.spin, 회오리 = 솟는 회오리(화염 폭발로 그려지던 버그 수정), 지진 사방 균열·충격파, 검흔 X자 스미어, 발도 늦은 베기 자국, 들이받기 흙먼지·충격파, 회전베기 바닥 고리, art.md 4·7장, 미리보기 생략 요청)
- 스태프 스킬 모션·이펙트 다듬기(스킬 전용 포즈 9개 gather·skyRaise·aimBack·plantRaise·scoop → thrust·plantDeep·channel·upswing, 중력 우물·중력장이 화염 폭발로 그려지던 버그 → 나선 우물·조여드는 장(spellGravity.ts, branch.well·gravfield), 불 아닌 원형 마법 표적 하늘색, 지팡이 꽂기 충격 stamp, art.md 4·7장·motion.md 7장, 미리보기 생략 요청)
- 보스 이끼곰 도트 다시 그리기 승인·반영(귀엽게: 크고 둥근 머리·동그란 눈·볼터치·웃는 입·동그란 배, 머리는 같은 털색 다른 글자 F로 선 없이 턱 아래 그림자·이끼 갈기로 구분, 9프레임 monsters.json, 초안 materials 지원 data.ts, art.md 몬스터 크기·sprites.md 10장)
- 아기 멧돼지 크게·도트 다시 그리기 승인·반영(19×14 → 34×21, 멧돼지답게 어깨 혹·짙은 갈기·쐐기 머리·엄니 + 통통한 몸·짧고 굵은 다리, 9프레임 monsters.json, hurtbox 16×12×10 → 26×16×12, run-sim 무적 2인 3판 평균 7분 07초, art.md 몬스터 크기·외형·data.md 예시)
- 이끼곰 패턴 추가(땅울림 원형 충격파·이끼 가시 5발 부채꼴·빠른 앞발·튕기는 구르기, 3단계(50%·25%)·분노 쉬는 시간, 그림은 기존 프레임 재사용 poses, dungeon.md 5장·data.md·balance.md)
- SK-7 1차 대검 A 계열 3단계(Lv11 파쇄참 = 슈퍼아머 경직 0.3초·3단 충전/즉발, Lv12 거인의 힘 = 충전 최대 +80%, Lv13 대지붕괴 = 3초 장판·다운 유지·확산/솟구침, Lv14 전장 장악 = 둘레 3타일 감속, 연출 fx/tier3Fx.ts·효과음 4·아이콘 4·스킬 창 6칸, skills.md 1·2장, 미리보기 생략 요청)
- SK-7 2차 대검 B 계열 3단계(Lv11 십자 검기 = 2연발·사방(앞뒤위아래)/교차점(엇갈림 폭발), Lv12 잔상 = 베기·검기 0.5초 뒤 같은 자리 반투명 50%, Lv13 일섬 = 앞 12타일 한 줄·이중/반환, Lv14 검의 춤 = 캔슬로 이은 스킬 +20%, 연출 fx/tier3bFx.ts·효과음 5·아이콘 4, skills.md 2장, 미리보기 생략 요청)
- SP 계열마다 따로(계열 노드는 자기 계열 SP만·기본/공용은 양쪽, spSpent branch, skills.md 1장·balance.md)
- 공용 패시브 스킬 캔슬 없앰(스킬 → 스킬 불가, 배운 포인트는 SP로 돌아옴)·검의 춤 = 스킬 끝 1초 안 다음 스킬 +20~30%(skills.md 1·2장·combat.md)
- 키 바꿈(이동 방향키만·Z 평타·Space 회피·스킬 A S D F G H 6칸(SLOT_COUNT 6)·물약 1 2, 섬 스킬 창 B = 계열 바꾸기, combat.md 1장·hud.md 1장)·이모트 없앰
- 던전 HUD 평타 칸 뺌(G·H 칸 아이콘 안 보이던 것 수정)
- 대검 B 계열 개편(십자 검기 → 검의 장막 = 방 깊이 끝까지 빛 벽 2초·지날 때 다단 감속(id gs_cross 그대로), 일섬 = 300% + 칼바람 다단 10번, repeat.coef 다단(light·시전 소리 없음), 포즈 lead·follow(combat.json poseSplit)·새 포즈 waveWind·waveRelease·plunge·flashHold, 검기 그림·출발 섬광, curtainFx.ts, skills.md B 계열·art.md 4·7장·motion.md 7장, 미리보기 생략)
- 일섬 연출 개선(기 모으기 = 바람이 손으로 소용돌이·준비 0.45초 → 크게 한 번 베기 + 판정 끝까지 바람 → 칼바람마다 맞은 몬스터 몸에 검기 박힘, fx/flashFx.ts·fx.json flash, art.md 7장, 미리보기 생략)
- 일섬 개편(충전할수록 앞 부채꼴 범위 커짐(반지름 96·100°) → 떼면 발도 한 번·칼 거두기, 그 순간 피해 없음 → 0.35초 뒤 검기가 사방에서 긁으며 다단 피해, 새 필드 repeat.delay, 반환은 첫 검기에서만, skills.md·data.md·art.md 7장)
- 일섬 연출 다듬기(떼면 바람이 부채꼴 범위를 휩쓸고, 검기는 캐릭터에서 날아가지 않고 몬스터마다 그 자리에서 다단으로 베고 지나감, 다단엔 몬스터 흰 번쩍임 뺌)
- 일섬 기 모으기 충전 내내 유지·충전할수록 넓게·천천히
- 바람 = 물결치는 바람 띠
- 일섬 충전 최대 2초(chargeRule.timeMul 2, 새 필드 chargeRule.stages = 파쇄참 3단 표시)
- 일섬 바람 그림 뺌·검기 데미지 11번 각 80%(이중 80+10×50+300·반환 300, 예산 −33% note)·검기 굵게(2px 줄·섬광·불꽃)·한 줄
- 검기 데미지 뗀 뒤 0.5초
- 떼면 부채꼴을 아래 → 위로 훑는 파란 칼빛
- 수련장(우물 "수련장" 탭, rooms.json training·maps/training/room1, 허수아비 dummy immortal·ai dummy, PlayerState.free 쿨타임·MP 없음, 귀환 고리로 바로 섬, 보상·저장 없음, 층은 서버 상태 floor, 허수아비 그림 승인·반영 22×27, dungeon.md 11장·art.md 몬스터 크기)
- 우물 E 자동 합류는 누가 대기 중일 때만(빈 우물은 탭에서 층 골라 합류 → 수련장 안 가지던 것 수정, island.md 6장)
- 공중 콤보 개선(내려올 때 중력 ×0.45·공중 피격 vz 최소 120·공중 밀림 ×0.35·중력 누적 ×1.05 → 0.4초 간격 평타로 11타 이어짐, combat.md 3장)
- 대검 3타 제자리 띄우기(새 플래그 inplace = 좌우 밀림 없음, knockback 뺌, skills.md·combat.md)
- 발도 개편(active 0.08초 사라짐(안 보임·무적·제자리, 새 필드 vanish) → 끝에 4타일 앞에 한 번에(move.instant) → 0.38초 뒤 지나온 길 전체 늦은 판정(repeat.delay)·섬광은 그때, 사라질 때 dash·벨 때 skill_draw(sfx.delayed), 후퇴 발도 2타일 뒤, skills.md·data.md·art.md 7장, 미리보기 생략)
- 발도 거리 +30%(5타일 84px·판정은 이동 거리까지(폭 84)·후퇴 42px)
- 검기 날리기 연출 다시 그림(크게 휜 초승달 약 32px·깃털 꼬리·긴 속도선·반짝임·흙먼지, 날아가며 커짐, 끝은 미끄러지며 얇아진 흰 호가 금빛 가루로 흩어짐, 대형은 크기 절반만 커짐, fx/waveFx.ts·fx.json branch.wave, art.md 7장)
- 회오리 검기 개선(반경 16 → 24·가운데로 조금씩 끌어당김(pull, 새 필드 pullMul 0.3)·공중 띄움 약하게(새 필드 airVz 40), 파란 회오리 다시 그림: 반복 내내 하나로 나아가는 깔때기·빨려드는 바람 줄, fx/cycloneFx.ts, skills.md·data.md·art.md 7장)
- 대검 충전 개선(다 차도 바로 안 나감·다 찬 뒤 holdMax 2초 들고 있기·보너스 최대 그대로, 충전 중 모이는 소리 charge_gather 반복·다 차면 charge_ready + 큰 별·빛살·몸 둘레 고리·들고 있는 동안 손 반짝이, run-sim 봇은 다 차면 뗌, skills.md 2장·art.md 7장·audio.md 3장, 미리보기 생략)
- 검의 장막 개편(빛 벽 → 꽂은 자리 둘레 반지름 40 영역 3초, 펼칠 때 200% + 0.25초마다 85%·감속·밀리지 않음(inplace), 변형 조여드는 장막(끝 300%)·따라다니는 장막(새 필드 repeat.follow), 연출 = 충전하면 범위 고리가 커짐(최대 범위 점선·밀려나는 물결·바깥 화살표)·따라다니는 금빛 고리(온라인 안 따라오던 것 수정)·맞은 몬스터 X자 베기(다단은 흰 번쩍임 뺌)·조여드는 끝 그림, 판정마다 흰 물결은 뺌, 온라인 다단 X자 베기가 첫 판정 뒤 안 나오던 것 수정(hit 메시지 by = 때린 행동 id, network.md 6장), curtainFx, skills.md 2장·data.md·art.md 7장, 미리보기 생략)
- CD-1 스킬 카드 개편 문서(SP·계열 선택 → 카드팩(무기별·팩 번호)·티어 숫자·3장 강화+변형·조각(갈기·지정 구매, 무기 공용)·액티브 4칸·패시브 비용 한도·계열 섞기·계열 보너스 3/5장·섬 카드 상점·팩 열기 연출, 기록 초기화, skills.md 1장·balance.md 7장·island.md 2·5장·data.md 10장·db·network·hud·audio·roadmap CD)

---

## 끝난 작업 단위 (roadmap 3장에서 옮김, 그때 쓴 그대로)

### M0
| # | 작업 | 확인 |
|---|---|---|
| 0-1 | pnpm 워크스페이스 뼈대 (client: Vite + Phaser + TS, server: Colyseus 빈 방, shared), tsconfig 경로, vitest | `pnpm dev`로 빈 288×162 화면이 정수 배율로 뜸, `pnpm test` 통과 |
| 0-2 | palette.json 로더 + tools/palette-check | 규칙 위반 0건 |
| 0-3 | 스프라이트 합성기 (마스크 → 레이어 → 자동 음영·외곽선 → 텍스처 캐시) | 기본 세트 4종 재질 격자 스냅샷 테스트 |
| 0-4 | tools/sprite-preview (의상·포즈·표정·몬스터 프레임 전환) | docs/refs/approved 캡처와 눈으로 비교 → 승인 |
| 0-5 | 던전 테스트 씬: 바닥·벽, 벨트스크롤 투영, 걷기, 통통버섯 배치 | 화면 구성이 art.md 1장과 같음 |
| 0-6 | 대검 3연타 + 타격 패키지(히트스톱·스미어·번쩍임·숫자) + 띄우기·바운드 (로컬, 서버 없음) | tools/motion-preview/reference.html과 나란히 비교 |
| 0-7 | tools/motion-preview (슬로우·프레임 넘기기·값 조정 → JSON 복사) | M0 체크 포인트(art.md 10장) 통과 → 승인 |

### M1
| # | 작업 | 확인 |
|---|---|---|
| 1-1 | shared: 데이터 로더 + zod 스키마 + tools/data-validate | 현재 shared/data 오류 0건 |
| 1-2 | shared: movement·actions (구간 계산, 판정 모양), 고정 60Hz | 단위 테스트 |
| 1-3 | 로컬 전투 루프: 평타·대시·백스텝·스킬 2개, 캔슬 규칙 | 대검으로 통통버섯 처치 |
| 1-4 | 몬스터 상태 머신 + 5종 AI + 공격 토큰 | 1번 방 혼자 클리어 |
| 1-5 | 플레이어 피격·다운·기상, HP·MP·물약 | balance.md 9장 항목 튜닝 |
| 1-6 | 효과음 엔진 + tools/sfx-preview (reference-*.html과 같은 소리) | 나란히 들어 비교 → 승인 |
| 1-7 | HUD 아래 띠 + 데미지 숫자·콤보 | docs/refs/approved/dungeon_room_hud.png와 비교 |
| 1-8a | 그림 추가: 몬스터 hurt·hurtAir (초안 → sprite-preview "초안 보기") | 미리보기 검토 → 승인 후 데이터 반영 |
| 1-8b | 그림 추가: 대검·스태프 MVP 스킬 포즈 (art.md 4장 MVP 표시) | 미리보기 검토 → 승인 후 데이터 반영 |
| 1-8c | 그림 추가: 캐릭터 이동·상태 모션 (art.md 4장), 몸 포즈 형식 확정 | 미리보기 검토 → 승인 후 데이터 반영 |
| 1-9 | tools/balance-check, ttk-sim | 경고 0건 또는 note 기록 |

### M2
| # | 작업 | 확인 |
|---|---|---|
| 2-1 | shared: RoomSim 여러 명(pid), 몬스터 대상 선택, messages.ts(zod)·NET 상수 | 2인 단위 테스트, 1인 결과는 기존과 같음 |
| 2-2 | 서버: DungeonRoom이 RoomSim을 60Hz로, 상태 스키마(정수 양자화), 메시지 검사·횟수 제한, 20Hz 전송 | 서버 테스트 + 접속 스크립트 |
| 2-3 | 클라이언트 접속(`?online=1`), 시계 맞추기, 다른 엔티티 100ms 보간, 이벤트로 연출 | 브라우저 탭 2개로 2인 플레이 |
| 2-4 | 내 캐릭터 예측·보정(network.md 7장), 행동 예측·거절 처리 | 지연을 넣고 이동·공격이 즉시 반응 |
| 2-5 | 지연 보정: 되감기 판정, 백스텝 소급 무적, 히트스톱 동기화(공격자·대상만) | 단위 테스트 + 2인 확인 |
| 2-6 | 개발용 지연 시뮬레이터 패널, 팀 콤보 | 지연 100ms·흔들림 ±20ms에서 끊김 없음, 13px 라인 판정 공정 |
| 2-7 | 파티원 프레임 (hud.md 2장, 승인 데모 hudTop) | 데모와 같은 모양, 쓰러짐 X·끊김 점 |

### M3
| # | 작업 | 확인 |
|---|---|---|
| 3-1 | 맵 파이프라인: 1층 방 6개 Tiled JSON 맵(map-gen), 맵 로더, 장애물 충돌, 맵 위치로 출현·입장 | data-validate 맵 검사, 장애물에 막힘·돌진 어지러움 |
| 3-2 | 그림: 낮은 바위·그루터기·출구 문·귀환 고리·보물상자 (초안 → sprite-preview) | 미리보기 검토 → 승인 후 반영 |
| 3-3 | 방 진행: 출구 문 열림 → 살아 있는 전원이 출구에 모이면 다음 방, 방 진행 HUD | 1→6번 방 연속 진행 |
| 3-4 | 보상: 코인·재료·경험치 드롭, 콤보 보너스, 인원 체력 보정, HUD 코인·재료 | 한 판 약 350코인 (balance.md 7장) |
| 3-5 | 쓰러짐·동료 부활(E 2초), 전멸, 귀환 지점(성공 귀환), 정산 계산 + 정산 화면 (저장은 M4) | 클리어·귀환·전멸 세 결과 |
| 3-6 | 보스 방: 등장 연출, 여러 줄 HP 바, 졸음 협동 규칙 | 보스 클리어 |
| 3-7 | BGM: bgm-preview 엔진을 게임으로, floor1 → boss1 전환 | 승인 원본과 악기 호출 일치 |
| 3-8 | 접속 끊김 처리 (network.md 10장) | 30초 안 재접속 / 지나서 이탈 |
| 3-9 | 한 판 통합 확인·튜닝 (솔로도 서버 방, 로컬 ?room=은 전투 테스트용) | `pnpm run-sim` 무적 봇 클리어 + docs/playtest.md 사람 기록: 1층 한 판 11~13분, 솔로·2인 클리어 |

### M4
| # | 작업 | 확인 |
|---|---|---|
| 4-1 | 기반: 갈무리 글꼴(OFL 고지), 서버 패키지(better-sqlite3·drizzle·@node-rs/argon2·express), DB 스키마·마이그레이션(db.md MVP 표, WAL) | 마이그레이션 테스트 |
| 4-2 | 계정 API: 가입(초대 코드)·로그인·로그아웃·복구 코드, httpOnly 쿠키 세션, 시도 제한, auth_log (security.md) | 서버 테스트 |
| 4-3 | 로그인 화면 (DOM 폼 + 도트 스타일), 세션 있으면 바로 섬, 한글 이름 표시 | 가입 → 새로고침 뒤 자동 로그인 |
| 4-4 | 그림: 섬 타일·시설 5개·장식 10종·분수 (초안 → sprite-preview) | docs/refs/approved/island_hud.png와 비교 → 승인 후 반영 |
| 4-5 | IslandRoom + 섬 화면: 주민 이동·동기화, 섬 HUD(hud.md 8장), 주민 목록, 섬 BGM | 2탭 확인, 승인 데모 island_screen_hud_mockup과 비교 |
| 4-6 | 배치 모드 + items.json + 인벤토리, 같은 칸은 먼저 온 요청만, 활동 기록 | 동시 배치 충돌 테스트, 재접속 유지 |
| 4-7 | 잡화점·게시판·가방 패널, 섬 채팅 | 구매 → 코인 감소·인벤토리 |
| 4-8 | 우물 출발 → 던전 → 정산 저장(지갑·금고·재료·경험치) → 섬 복귀, 물약 반입·환불, 플레이어 색 저장 | 가입부터 꾸미기·출발·정산·복귀까지 한 바퀴 |

### MVP 보충 (스태프)
| # | 작업 | 확인 |
|---|---|---|
| ST-1 | 규칙: 플레이어별 무기, 마법탄(플레이어 투사체), 빙결, 개발 ?weapon=staff | 테스트, ttk-sim·balance-check, 개발 방에서 마법탄·빙결 |
| ST-2 | 연출·소리: 마법탄·화염 폭발·얼음 장판·빙결·순간이동 백스텝 이펙트, 마법탄 발사·적중 효과음 | motion-preview·sfx-preview 승인 |
| ST-3 | HUD 아이콘: 스태프 J·스킬 2 | sprite-preview 승인 |
| ST-4 | 무기 고르기(섬 우물 패널) → 출발 파티에 무기 → 무기별 숙련도 정산 | 가입부터 스태프 한 판 |

### MVP 보충 (스킬 포인트)
| # | 작업 | 확인 |
|---|---|---|
| SK-1 | 기본 스킬 포인트 1~3(레벨 배율)·변형 택1·초기화: SP = 숙련도 레벨 − 1, 섬 스킬 창(K), DB skill_nodes, 변형 특수 판정(재입력·후속·반복·해제)·감속, 던전 판정은 서버 DB 값, 개발 ?skills= | 테스트, 섬에서 포인트·변형 → 던전에서 변형 확인 |
| SK-2 | 계열 1단계 액티브 8개(대검 회전베기·어깨 들이받기·검기 날리기·발도, 스태프 불꽃 기둥·얼음 창·부유 구슬·끌어올림)+변형 16개. 1차: 규칙(0포인트 시작·같은 단계 택1·O/P 고정 슬롯)·새 판정(다단·슈퍼아머·hold·pull·벽꿍·여러 줄·연발·반복 이동)·스킬 창·HUD (완료). 2차: 연출·motion-preview 계열 스킬(2a 완료, art.md 7장), 효과음(2b 완료, audio.md 3장), HUD 아이콘(2c 완료, hud.md 2장). 2차 완료. 3차: 보조 노드 8개(passives.json, 무거운 손은 SK-3에서 원래 효과·가벼운 발 쿨 −0.2초) 완료, 연소·무중력(→ 중압) 표식 연출(art.md 7장) 완료 | 테스트·balance-check, ?skills=gs_whirl:1,gs_draw:3:back 으로 O·P 확인 |
| SK-4 | 계열 2단계 (skills.md 1장): 같은 계열 1단계 3포인트에서 열림, 액티브 택1·보조 택1, 조건이 깨지면 자동 지움·SP 반환, 슬롯 장착(U I O P에 배운 액티브 4개, DB skill_nodes.slot). 1차a: 열림·슬롯 장착·지진·회오리 검기·중력 우물·중력장(부양장 → 압축장) (완료). 1차b: 대검 투척·검흔 베기·번개 연쇄·화염구·가속장(새 판정: 왕복·관통 다단·끝 폭발·분열 투사체, 검흔 표식, 연쇄, 아군 쿨 가속) (완료). 2차: 연출(2a: 도는 대검·화염구 불덩이·번개 줄·검흔 표식/터짐·꽂기·여진·구슬 끝 폭발·가속 속도선·역장 보호막, 서버 echo look·상태 scarred·hasted·shielded)·효과음(2b: 12개)·아이콘(2c: 새 액티브 4·2단계 보조 8) (완료, 미리보기 생략 요청). 3차: 2단계 보조 8개(여진·짓밟기·올려 검기(옛 검풍)·검기 순환·냉기 강화·과열·구슬 확장·역장, 다운 보정 ×0.5 실제 적용) (완료) | 테스트·balance-check, ?skills=gs_whirl:3,gs_quake:1 로 P 확인, 섬 스킬 창 장착. 1차b: ?skills=gs_throw:1, gs_scar:1,gs_wave:1, ?weapon=staff&skills=st_chain:1,st_fireball:1, st_gravfield:1:haste |
| SK-3 | 대검 충전(skills.md 2장): 스킬 키 누르고 있기 → 준비 끝에서 충전 최대 1초, 피해·범위 최대 +50%, 충전 중 슈퍼아머, 무거운 손 원래 효과(충전 속도 +30%·충전 중 받는 피해 −30%), 온라인 chargeRelease. 1차: 규칙·판정·네트워크 (완료). 2차: 충전 포즈(허리 옆 쥐기, 머리 위 준비 스킬은 그대로)·모이는 빛·충전 효과음(charge_start·charge_full)·온라인 chargeMs·chargeLv (완료, 미리보기 생략 요청) | 테스트, ?weapon=greatsword 길게·짧게, ?online=1&lag=100 |
| SK-5 | 공용 패시브(skills.md 1장): 스킬 캔슬 1~3(스킬 recovery → 다른 스킬, 이은 스킬 windup ×1.5/1.3/1.15)·기상 회피 1(다운 중 회피 키로 기상, 기상 무적 대신 회피 무적), passives.json weapon "*" → 무기마다 노드, 스킬 창 맨 위 (완료). 스킬 캔슬은 2026-11 없앰 | 테스트, ?skills=greatsword.quickrise:1 로 다운 중 K |
| SK-6 | 스킬 창 개편(skills.md 1장, 승인 데모 docs/refs/demos/skill_window.html): 단계·택1 없앰 → 스킬·패시브는 숙련도 레벨로 열림(unlockLevel, 액티브 Lv2·4·6·8·보조 Lv3·5·7·9), 무기마다 계열 하나 선택(weapon_mastery.branch)·계열마다 장착 기억(skill_slots), SP로 액티브 2·3포인트·패시브 1~3포인트(포인트별 값, 굳건함·기상 회피 2·3포인트 새 효과), 변형은 열리면 바로, 던전은 출발 때 effectiveBuild. 1차: 규칙·저장·메시지(마이그레이션 0011), 스킬 창은 임시 목록 (완료). 2차: 트리형 스킬 창(계열 버튼·액티브/패시브 탭·상세·끌어다 장착, 임시 10×10 그림 hud_icons.json glyphs·패널 명암 색 palette.json global.ui.skill*, hud.md 8장) (완료). 3차: 아이콘 없는 스킬·패시브 정식 16×16 아이콘 14개(sprite-preview 승인, hud_icons.json, 임시 그림 glyphs 없앰, hud.md 2·8장) (완료) | 테스트·data-validate·balance-check·net-smoke, 섬 K에서 계열 바꾸기·장착 기억, ?online=1 출발 → 고른 계열 스킬만 U I O P |
| SK-7 | 계열 3단계 (skills.md 1·2장): 액티브 Lv11·13·보조 Lv12·14. 1차: 대검 A 파쇄참(슈퍼아머 경직 armorBreak·3단 충전/즉발 chargeRule)·대지붕괴(다운 유지 keepDown·확산·솟구침 repeatEnd launch)·거인의 힘(chargeBonusAdd)·전장 장악(aura), 연출(fx/tier3Fx.ts·3단 충전 단계 점·온라인 aura)·효과음 4개·아이콘 4개·스킬 창 6칸 (완료, 미리보기 생략 요청). 2차: 대검 B 십자 검기(2연발·사방 projectile.aims·교차점 meet)·일섬(192px 한 줄·이중 after·반환 trail)·잔상(phantom, 같은 자리 반투명 다시 베기·쏘기)·검의 춤(dance, 스킬 끝 1초 안 다음 스킬 계수), 연출(fx/tier3bFx.ts·shotDraw.crossWave·온라인 bolt dy·ghost)·효과음 5개·아이콘 4개 (완료, 미리보기 생략 요청). 다음: 스태프 A·B 3단계 | 테스트·data-validate·balance-check·net-smoke, ?skills=gs_crush:1:tri,gs_giant:1 길게 누르기, ?skills=gs_collapse:1:rise,gs_dominate:3, ?skills=gs_cross:1:meet,gs_flash:1:trail,gs_phantom:1 (O·P), ?skills=gs_scar:1,gs_wave:1,gs_dance:1 (검흔 베기 끝나고 1초 안에 검기) |

## 1층 튜닝 이력 (dungeon.md 5장에서 옮김)

- 3-9 결정 (A안): 한 판이 목표보다 크게 짧아 (run-sim 2인 약 4분 40초) 방마다 웨이브를 2~3개로 늘림. 처치 시간 목표(1~3초)·조작감은 그대로. 바뀐 뒤 run-sim 무적 봇: 2인 약 6분 40초, 솔로 약 8~9분(봇 막힘 제외 추정) — 사람 기록(playtest.md)으로 다시 판단
- 난이도 튜닝(사람 플레이 의견 "너무 쉬움"): 웨이브를 방마다 하나로 합침(마릿수 그대로, 맵 출현 지점도 모두 wave 1), 1층 몬스터 이동 +40%, 공격 범위 hitbox 앞·폭 +30%·깊이 +50%, 원형 반지름 +25% (이끼곰 구르기·포자탄·하품 장판은 그대로). 플레이어 이동 −20%, 근접 역경직(combat.md 5장). run-sim 무적 2인 6분 17초 → 7분 32초, 무적 아닌 봇은 전멸이 5분 13초 → 3분 20초로 빨라짐
- 난이도 튜닝 2차: 움직이는 몬스터는 방에 들어오면 바로 덤벼듦, 포자꽃 사거리 112 → 224px·탄 반지름 3 → 5·깊이 ±16, 통통버섯 박치기 거리 16 → 28px·시작 거리 20 → 34px·판정 앞 8 → 12, 공격 차례가 아닌 몬스터는 둘레에 흩어져 기다림 (combat.md 6장). run-sim 무적 2인 약 7분 50초 (먼저 다가와 짧아짐), 무적 아닌 봇은 1분 39초에 전멸
- 우물 입장: 1번 방은 우물에서 떨어져 들어오고 버섯은 잠든 채 시작 (위 2장, 그 방만 바로 덤벼들기의 예외). run-sim 봇 고침(장애물에서 비킨 뒤 가로로 지나가기, 방 끝에 붙은 몬스터를 칠 목표 깊이를 방 안으로)을 함께 넣어 막힘 없이 무적 2인 3판 평균 7분 01초 (1번 방 약 29초)
- 방 크게(화면 384×216에 맞춤): 가로·깊이 ×4/3 (위 표, 예전 20~28 × 7~9), 몬스터 수 그대로. 맵은 다시 만들지 않고 기존 배치를 같은 비율로 옮김(문·입장 지점은 방 끝에서의 거리 유지). run-sim 봇은 한 몬스터를 12초 넘게 못 잡으면 6초 동안 다른 몬스터부터(넓은 방에서 거리를 벌리는 멧돼지만 쫓다 막힘). 무적 2인 3판 평균 8분 06초 (5번 방 약 82초, 보스 약 3분 56초). 이어서 깊이만 2타일씩 더(최대 14, 위 표) + 플레이어 깊이 이동 +25%(combat.md 1장): 무적 2인 3판 평균 7분 59초
- CD-2 스킬 카드 데이터·공용 로직: cards.json(티어 1~3·카드 46장·처음 카드·계열 보너스)·packs.json(팩 1·2)·combat.json card, shared/src/cards/(목록·보유·3장 합치기·갈기·지정 구매·팩 굴림·천장·장착 4칸·패시브 비용 한도·계열 보너스·던전 빌드), 강화 ×1.2(레벨 배율·SP·unlockLevel·계열 선택 뺌), 패시브 값 [기본, 강화], data-validate 카드 검사. 섬 스킬 창·서버 저장은 CD-3·4 전 임시 연결(모든 카드 보유로 봄, cards/interim.ts)
- CD-3 카드 DB·서버: users.dust·cards·card_slots·card_pity, 마이그레이션 0012(skill_nodes·skill_slots·sp·branch 지움)·0013(카드 테이블)·0014(기존 계정 처음 카드·선물 팩 3), 가입 때 처음 카드·선물, card 메시지(열기·지정 구매·갈기·변형·장착) → cards·pack (server db/cardStore.ts·cardPack.ts, systems/islandCards.ts), 던전 빌드를 DB 보유·장착으로, 티어 3 이상 게시판 기록, ADMIN 조각 99,999. 임시 연결(cards/interim.ts·skillStore.ts·skill 메시지) 지움, 옛 스킬 창은 실제 보유 + 임시 팩 열기(O). run-sim 무적 2인 2판 평균 7분 60초
- CD-4 카드 창(K)·던전 HUD 4칸: 승인 데모 docs/refs/demos/card_window.html, 옛 스킬 창(ui/skillWindow·skillDetail·stage/islandSkills) → ui/cardWindow·cardDetail·cardParts·cardTypes·stage/islandCards·cardText(위 장착 줄 액티브 A S D F·패시브 비용 막대, 계열 보너스 줄·상세, 보유 카드 줄 기본/A/B·티어 짝·카드 24×29, 상세 변형·기본/강화 효과·갈기 두 번 확인·끼우기, 끌어다 장착·빼기, 임시 팩 열기 O는 제목 띠), 던전 아래 HUD 스킬 묶음 4칸(폭 105)·소지품 x 197, 던전 G H 키 뺌, 섬 K 이름표·도움말 "카드"
- CD-5 카드 상점: 승인 데모 docs/refs/demos/card_shop.html, 시설 cardShop 3×2(우물 남서쪽 12,14, 보라·크림 천막 그림 island.json, palette island.awningC), 이미 있는 섬은 기본 칸이 막히면 가장 가까운 빈칸(settleFacility), 카드 테두리 확정 1 은·2 파랑·3 보라(금색 = 강화), 상점 화면(캔버스 텍스처: ui/shopPix·shopCards·shopFx·cardShopScreen, stage/cardShop·cardShopOpen) 카드팩(선물/코인/조각)·팩 열기(떨어짐·찢김·뒷면 빛·티어별 뒤집기·NEW·합치기·변형 고르기·한 팩 더)·지정 구매, 카드 창 임시 팩 열기(O) 지움, 패널 글자는 stage/panelText.ts로
- CD-6 카드 상점 소리: 효과음 10개(card_shake·tear·flip·glow2·glow3·reveal2·reveal3·merge·grind·buy, clear 버스) + BGM cardshop(84 BPM 8마디, 층 3겹: 2 = 마림바·하이햇, 3 = 온음 위 조옮김·패드·큰 스네어·탐·플루트), 엔진 layer·lift·setLevel(올라갈 땐 다음 박·내려갈 땐 다음 마디, engine.js·engine.ts 같게, bgm.test 층 비교), bgm-preview 초안·단계 버튼, 상점 열면 cardshop·닫으면 island
- 고침: 우물 출발 시 던전이 검은 화면 — 섬 씬 종료 때 카드 상점 destroy가 이미 파괴된 이미지의 scene을 읽어 예외 → 던전 씬이 시작되지 않음. CardShop이 텍스처 관리자를 생성 때 들고 있게 (stage/cardShop.ts)
- 카드 개편 (승인 데모 docs/refs/demos/card_redesign.html): 강화를 직접(카드 창 강화 버튼·U, 3장 소모, card enhance 메시지·fail merge, 끼운 패시브는 비용 +1 한도 검사, 팩·지정 구매는 저절로 합치지 않음 → 팩 열기 합치기·변형 고르기 단계와 pack.merged 뺌), 카드 테두리 = 계열 모양·색(ui/cardFrame.ts: 기본 강철·대검 A 돌·B 사선 칼끝·스태프 A 불꽃·B 이중 테두리, 카드 창·상점 공용, 큰 카드 2배), 티어 = 별만, 강화 = 이름 + 금색 + 빛줄기·반짝이는 별(카드 창 fx 층·상점, 던전 HUD 표시 없음), 카드 창 간단히(칸에 보유 점·남는 장수·Lv·변형 점·비용 막대·한도 Lv·줄 안내 뺌, 계열 보너스 한 줄), 화면 글자 기본 갈무리7(fonts.ts DEFAULT_FONT, 도움말 줄 간격 11, 상점 제목·팩 글자도)
- 카드 티어 판: 카드 별 개수 대신 카드 아래 도트 숫자 판(티어 색, 카드 창·카드 상점)·상세 머리 "티어 N". 초안 docs/drafts/card_tier.html
