// 인증 HTTP API 호출 (docs/security.md 8장). 세션은 httpOnly 쿠키라 자바스크립트는 토큰을 모른다
import { AUTH, type AuthError, type IslandListItem, type JoinRequestItem, type MeRes } from '@game/shared';

export type ApiError = AuthError | 'server' | 'network';
export type ApiResult<T> = { ok: true; value: T } | { ok: false; error: ApiError };

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method, credentials: 'same-origin',
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: 'network' };
  }
  const data = await res.json().catch(() => ({})) as { error?: ApiError } & T;
  if (!res.ok) return { ok: false, error: data.error ?? 'server' };
  return { ok: true, value: data };
}

export const api = {
  me: () => call<{ me: MeRes }>('GET', '/me'),
  login: (nickname: string, password: string) => call<{ me: MeRes }>('POST', '/login', { nickname, password }),
  signup: (nickname: string, password: string) => call<{ me: MeRes; recoveryCode: string }>('POST', '/signup', { nickname, password }),
  recover: (nickname: string, recoveryCode: string, password: string) =>
    call<{ me: MeRes; recoveryCode: string }>('POST', '/recover', { nickname, recoveryCode, password }),
  logout: () => call<{ ok: true }>('POST', '/logout'),
  // 섬 고르기·입장 신청 (island.md 7장)
  islands: () => call<{ islands: IslandListItem[] }>('GET', '/islands'),
  createIsland: () => call<{ me: MeRes }>('POST', '/island/create'),
  requestJoin: (islandId: number) => call<{ me: MeRes }>('POST', '/island/request', { islandId }),
  cancelJoin: () => call<{ me: MeRes }>('POST', '/island/request/cancel'),
  /** 섬 주인만: 기다리는 신청, 허용·거절 */
  joinRequests: () => call<{ requests: JoinRequestItem[] }>('GET', '/island/requests'),
  decideJoin: (userId: number, accept: boolean) => call<{ ok: true }>('POST', '/island/decide', { userId, accept }),
};

/** 오류 → 화면 문구 */
export const API_ERROR_TEXT: Record<ApiError, string> = {
  invalid: '입력 형식을 확인해 주세요',
  badLogin: '닉네임 또는 비밀번호가 틀렸습니다',
  locked: '잠시 뒤 다시 시도해 주세요',
  suspended: '이용이 정지된 계정입니다',
  rateLimited: '시도가 너무 많습니다. 잠시 뒤 다시 시도해 주세요',
  nicknameTaken: '이미 쓰는 닉네임입니다',
  islandFull: `그 섬은 주민이 가득 찼습니다 (최대 ${AUTH.islandResidents}명)`,
  noIsland: '아직 섬이 없습니다',
  hasIsland: '이미 섬 주민입니다',
  notOwner: '섬 주인만 할 수 있습니다',
  noRequest: '이미 처리된 신청입니다',
  unauthorized: '다시 로그인해 주세요',
  server: '서버 오류입니다. 잠시 뒤 다시 시도해 주세요',
  network: '서버에 연결할 수 없습니다',
};
