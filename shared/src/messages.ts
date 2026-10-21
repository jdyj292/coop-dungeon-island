// 클라이언트 ↔ 서버 메시지 (docs/network.md 4·6장). 클라이언트 → 서버는 zod로 서버가 검사
import { z } from 'zod';
import { NET } from './constants';

const seq = z.number().int().nonnegative();
/** 서버 기준 시각(추정, ms) */
const t = z.number().nonnegative();
const axis = z.union([z.literal(-1), z.literal(0), z.literal(1)]);
const coord = z.number().finite();

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
  // 앞뒤 공백을 뺀 1~60자 (표시는 텍스트로만)
  chat: z.object({ text: z.string().trim().min(1).max(NET.chatMaxLen) }).strict(),
  ping: z.object({ t: z.number().nonnegative() }).strict(),
  /** 개발 명령 (서버가 개발 모드일 때만): clear = 지금 방 몬스터를 모두 기절, down = 나를 쓰러뜨림 (부활 확인) */
  dev: z.object({ cmd: z.enum(['clear', 'down']) }).strict(),
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
  hit: { attacker: string; target: number; damage: number; strength: string; flags: string[]; hitstop: number; x: number; y: number; z: number; t: number };
  playerHit: { pid: string; damage: number; strength: string; from: number | null };
  rejected: { seq: number; reason: 'cooldown' | 'mp' | 'state' | 'rate' };
  combo: { pid: string; count: number; milestone?: number };
  emote: { player: string; id: number };
  chat: { player: string; text: string; t: number };
  pong: { t: number; server: number };
  /** 투사체는 상태에 넣지 않고 이벤트로 (network.md 5장). kind = 공격 id */
  projSpawn: { id: number; kind: string; owner: number; x: number; y: number; z: number; dir: number; t0: number };
  projEnd: { id: number; reason: 'hit' | 'range'; x: number; y: number };
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
}
