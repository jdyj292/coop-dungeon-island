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
  /** 방의 몬스터를 모두 기절시킴 (마지막 웨이브) */
  roomClear: { roomIndex: number };
  /** 팀 콤보 단계 달성 (20·40·60, 2인 이상) */
  teamMilestone: { count: number };
}
