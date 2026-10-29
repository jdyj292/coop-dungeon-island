// HTTP 시도 제한 (docs/security.md 3장): 키(IP·계정)마다 창 안에 max회. 메모리에만 (재시작하면 비워짐, 앞단 Nginx limit_req가 함께 막음)
const MIN = 60_000, HOUR = 3_600_000;

/** [창 ms, 최대 횟수] */
export const AUTH_LIMITS = {
  loginIp: [MIN, 5], loginUser: [MIN, 5],
  signupIp: [HOUR, 3],
  recoverIp: [HOUR, 5],
  joinUser: [MIN, 5],
} as const satisfies Record<string, readonly [number, number]>;

/** 연속 실패 잠금: [횟수, 잠금 ms] */
export const LOCKS = { login: [10, 15 * MIN], recover: [5, HOUR] } as const;

export class Limiter {
  private hits = new Map<string, number[]>();

  /** 한 번 쓰기. 넘었으면 false (넘은 시도는 세지 않음) */
  take(rule: keyof typeof AUTH_LIMITS, key: string, now: number): boolean {
    const [win, max] = AUTH_LIMITS[rule];
    const k = `${rule}:${key}`;
    const list = (this.hits.get(k) ?? []).filter((t) => now - t < win);
    const ok = list.length < max;
    if (ok) list.push(now);
    if (list.length) this.hits.set(k, list);
    else this.hits.delete(k);
    return ok;
  }

  /** 오래된 키 정리 (주기적으로) */
  sweep(now: number): void {
    for (const [k, list] of this.hits) if (list.every((t) => now - t >= HOUR)) this.hits.delete(k);
  }
}
