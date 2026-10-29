// 계정 입력 형식 (docs/security.md 1·3·4장). 클라이언트 폼과 서버 API가 같은 스키마를 쓴다
import { z } from 'zod';

/** 계정·인증 규칙 (security.md) */
export const AUTH = {
  nicknameMin: 2,
  nicknameMax: 12,
  passwordMin: 8,
  /** Argon2 입력 상한 (긴 입력으로 서버를 느리게 하지 않게) */
  passwordMax: 128,
  /** 복구 코드: 4자리 × 4묶음 */
  recoveryGroups: 4,
  recoveryGroupLen: 4,
  /** 복구 코드 글자: 헷갈리는 글자(0 O 1 I L) 뺀 대문자·숫자 */
  codeAlphabet: 'ABCDEFGHJKMNPQRSTUVWXYZ23456789',
  sessionDays: 30,
  /** 섬 하나당 주민 최대 (island.md 7장). 던전 파티는 따로 최대 4명 (island.json well.maxParty) */
  islandResidents: 10,
} as const;

/** 닉네임: NFC로 맞춘 뒤 한글(완성형)·영문·숫자 2~12자 */
const NICK_RE = new RegExp(`^[가-힣A-Za-z0-9]{${AUTH.nicknameMin},${AUTH.nicknameMax}}$`);

export const nicknameSchema = z.string().transform((s) => s.normalize('NFC').trim()).pipe(z.string().regex(NICK_RE));
/** 중복 검사 키 (대소문자 무시) */
export const nicknameKey = (nickname: string): string => nickname.normalize('NFC').trim().toLowerCase();

export const passwordSchema = z.string().min(AUTH.passwordMin).max(AUTH.passwordMax);

/** 대문자로 바꾸고 공백·하이픈 제거 후 비교 (사람이 소문자·띄어쓰기로 입력해도 됨) */
const codeSchema = (len: number) => z.string().max(64)
  .transform((s) => s.toUpperCase().replace(/[\s-]/g, ''))
  .pipe(z.string().length(len).regex(new RegExp(`^[${AUTH.codeAlphabet}]+$`)));

export const recoveryCodeSchema = codeSchema(AUTH.recoveryGroups * AUTH.recoveryGroupLen);

export const signupReq = z.object({
  nickname: nicknameSchema,
  password: passwordSchema,
});
/** 섬 입장 신청 (island.md 7장) */
export const joinReq = z.object({ islandId: z.number().int().positive() });
/** 섬 주인의 허용·거절 */
export const decideReq = z.object({ userId: z.number().int().positive(), accept: z.boolean() });
export const loginReq = z.object({ nickname: z.string().max(64), password: z.string().max(AUTH.passwordMax) });
export const recoverReq = z.object({ nickname: z.string().max(64), recoveryCode: recoveryCodeSchema, password: passwordSchema });
export const passwordReq = z.object({ current: z.string().max(AUTH.passwordMax), password: passwordSchema });

export type SignupReq = z.infer<typeof signupReq>;
export type LoginReq = z.infer<typeof loginReq>;
export type RecoverReq = z.infer<typeof recoverReq>;
export type PasswordReq = z.infer<typeof passwordReq>;
export type JoinReq = z.infer<typeof joinReq>;
export type DecideReq = z.infer<typeof decideReq>;

/** /api/me 등의 응답 (자기 정보만) */
export interface MeRes {
  id: number;
  nickname: string;
  wallet: number;
  hairStyle: number;
  hairColor: number;
  weapon: string;
  /** 아직 섬이 없으면 null → 섬 고르기 화면 (island.md 7장) */
  island: { id: number; name: string; treasury: number; ownerId: number } | null;
  /** 섬이 없을 때 넣어 둔 입장 신청 (거절되면 rejected, 다음 신청·취소 때 지워짐) */
  request: { islandId: number; islandName: string; rejected: boolean } | null;
}

/** 섬 목록 한 줄 (GET /api/islands) */
export interface IslandListItem {
  id: number;
  name: string;
  owner: string;
  residents: number;
}

/** 섬 주인에게 보이는 입장 신청 (GET /api/island/requests) */
export interface JoinRequestItem {
  userId: number;
  nickname: string;
  createdAt: number;
}

/** 오류 코드 (화면 문구는 클라이언트가 고름. 로그인 실패는 닉네임 존재 여부를 알리지 않음) */
export type AuthError = 'invalid' | 'badLogin' | 'locked' | 'suspended' | 'rateLimited' | 'nicknameTaken' | 'islandFull' | 'unauthorized'
  | 'noIsland' | 'hasIsland' | 'notOwner' | 'noRequest';
