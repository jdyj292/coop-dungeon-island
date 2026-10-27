// 클라이언트 ↔ 서버 메시지 (docs/network.md 4·6장). 클라이언트 → 서버는 zod로 서버가 검사
import { z } from 'zod';
import { LOOK, MVP_WEAPONS, NET } from './constants';

const seq = z.number().int().nonnegative();
/** 서버 기준 시각(추정, ms) */
const t = z.number().nonnegative();
const axis = z.union([z.literal(-1), z.literal(0), z.literal(1)]);
const coord = z.number().finite();
/** 사용자 한 줄 글: 제어 문자·줄바꿈 제거, 앞뒤 공백 제거, 1~max자 */
// eslint-disable-next-line no-control-regex
const lineText = (max: number) => z.string().max(max * 4).transform((s) => s.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim()).pipe(z.string().min(1).max(max));
/** 섬 칸 좌표, 회전 0~3 */
const cell = z.number().int().min(0).max(63);
const rot = z.number().int().min(0).max(3);

/** 던전: 클라이언트 → 서버 */
export const C2S = {
  input: z.object({ seq, t, mx: axis, my: axis, run: z.boolean() }).strict(),
  action: z.object({
    seq, t, kind: z.enum(['basic', 'dash', 'skill', 'ultimate', 'backstep', 'chargeStart', 'chargeRelease']),
    skillId: z.string().max(40).optional(), x: coord, y: coord, facing: z.union([z.literal(-1), z.literal(1)]),
  }).strict(),
  item: z.object({ seq, t, slot: z.enum(['hp', 'mp']) }).strict(),
  interact: z.object({ targetId: z.string().max(40) }).strict(),
  emote: z.object({ id: z.number().int().min(1).max(4) }).strict(),
  // 앞뒤 공백을 뺀 1~60자, 제어 문자·줄바꿈 제거 (표시는 텍스트로만, security.md 4장)
  chat: z.object({ text: lineText(NET.chatMaxLen) }).strict(),
  ping: z.object({ t: z.number().nonnegative() }).strict(),
  /** 개발 명령 (서버가 개발 모드일 때만): clear = 지금 방 몬스터를 모두 기절, down = 나를 쓰러뜨림 (부활 확인) */
  dev: z.object({ cmd: z.enum(['clear', 'down']) }).strict(),
  // 섬: 장식 놓기·옮기기·치우기 (island.md 3장). from = 내 가방 / 공용 창고
  place: z.object({ itemId: z.string().max(32), x: cell, y: cell, rot, from: z.enum(['mine', 'storage']) }).strict(),
  move: z.object({ placementId: z.string().max(16), x: cell, y: cell, rot }).strict(),
  remove: z.object({ placementId: z.string().max(16) }).strict(),
  /** 개발 명령 (서버가 개발 모드일 때만): 장식·물약 받기 / 지갑·금고에 코인 */
  give: z.object({ itemId: z.string().max(32), count: z.number().int().min(1).max(99) }).strict(),
  giveCoins: z.object({ to: z.enum(['wallet', 'treasury']), amount: z.number().int().min(1).max(100000) }).strict(),
  // 섬: 잡화점 구매 (장식·물약은 지갑, 공용 장식은 공동 금고 → 공용 창고), 게시판 열기·메모 1줄 (island.md 5·8장)
  buy: z.object({ itemId: z.string().max(32), count: z.number().int().min(1).max(99) }).strict(),
  board: z.object({}).strict(),
  /** 우물 (island.md 6장): 대기 합류·나가기, 대기 시작자의 출발 */
  well: z.object({ op: z.enum(['join', 'leave', 'depart']), floor: z.string().max(16).optional() }).strict(),
  memo: z.object({ text: lineText(NET.memoMaxLen) }).strict(),
  /** 무기 고르기 (섬 우물 패널, MVP 보충 ST-4) */
  weapon: z.object({ id: z.enum(MVP_WEAPONS) }).strict(),
  /** 외형 바꾸기 (섬에서, 설정 외형 탭) */
  look: z.object({ hair: z.number().int().min(0).max(LOOK.hairStyles - 1), hairColor: z.number().int().min(0).max(LOOK.hairColors - 1) }).strict(),
} as const;

export type C2SType = keyof typeof C2S;
export type C2SMessage<K extends C2SType> = z.infer<(typeof C2S)[K]>;

/** 형식 검사. 틀리면 null (서버는 무시, network.md 4장) */
export function parseC2S<K extends C2SType>(type: K, raw: unknown): C2SMessage<K> | null {
  const r = C2S[type].safeParse(raw);
  return r.success ? (r.data as C2SMessage<K>) : null;
}

/** 던전: 서버 → 클라이언트 이벤트 (순간 사건만, 계속되는 것은 상태) */
export interface S2C {
  hit: { attacker: string; target: number; damage: number; strength: string; flags: string[]; hitstop: number; recoil: number; act: string; actT: number; x: number; y: number; z: number; t: number };
  playerHit: { pid: string; damage: number; strength: string; from: number | null };
  rejected: { seq: number; reason: 'cooldown' | 'mp' | 'stamina' | 'state' | 'rate' };
  combo: { pid: string; count: number; milestone?: number };
  emote: { player: string; id: number };
  chat: { player: string; text: string; t: number };
  pong: { t: number; server: number };
  /** 투사체는 상태에 넣지 않고 이벤트로 (network.md 5장). kind = 공격 id */
  projSpawn: { id: number; kind: string; owner: number; x: number; y: number; z: number; dir: number; t0: number };
  projEnd: { id: number; reason: 'hit' | 'range'; x: number; y: number };
  /** 플레이어 마법탄 (스태프 평타). kind = 행동 id, pid = 쏜 사람 */
  bolt: { id: number; kind: string; pid: string; x: number; y: number; dir: number; t0: number };
  boltEnd: { id: number; reason: 'hit' | 'range'; x: number; y: number };
  /** 한 판 끝 (hud.md 6장 정산 화면). kind: clear = 보스 처치, return = 귀환 지점, wipe = 전멸. 저장은 M4 */
  result: {
    kind: 'clear' | 'return' | 'wipe';
    lines: {
      pid: string; name: string; coins: number; bonusPct: number; bonusCoins: number; lost: number;
      wallet: number; treasury: number; materials: number; exp: number; levelBefore: number; levelAfter: number; levelExp: number;
    }[];
    /** 이번 판 공동 금고 적립 합 */
    treasury: number;
  };
  /** 받은 보상 (본인에게, 몬스터 기절·보물상자) */
  reward: { coins: number; material: number; exp: number };
  /** 콤보 코인 보너스 단계 달성 (본인에게, 비율은 정산 때 더함) */
  comboBonus: { count: number; rate: number };
  /** 다음 방에 들어감 (출구에 전원 모임). 클라이언트는 방 화면을 다시 만든다 */
  roomEnter: { roomIndex: number };
  /** 방의 몬스터를 모두 기절시킴 (마지막 웨이브) */
  roomClear: { roomIndex: number };
  /** 팀 콤보 단계 달성 (20·40·60, 2인 이상) */
  teamMilestone: { count: number };
  /** 섬: 입장 때 본인에게 (지갑은 상태에 넣지 않음, network.md 5장) */
  me: { wallet: number; level: number };
  /** 섬: 내 가방 (장식 id → 개수, 바뀔 때마다 본인에게) */
  inv: { items: Record<string, number> };
  /** 섬: 배치 요청 실패 (같은 칸에 먼저 온 요청 등) */
  placeFail: { op: 'place' | 'move' | 'remove'; reason: string };
  /** 섬: 구매 결과 (본인에게). ok면 지갑·가방은 me·inv로 */
  buyResult: { ok: boolean; itemId: string; count: number; reason?: 'unknown' | 'money' | 'treasury' };
  /** 섬: 출발 → 이 던전 방으로 들어가기 (파티원 각자에게) */
  depart: { roomId: string; floor: string };
  /** 섬: 우물 요청 실패 (멀리 있음·가득 참 등) */
  wellFail: { reason: 'far' | 'full' | 'busy' | 'notHost' };
  /** 섬: 게시판 (요청한 사람에게). 최신이 앞 */
  board: { log: { who: string; action: string; itemId: string | null; at: number }[]; memos: { who: string; text: string; at: number }[] };
}
