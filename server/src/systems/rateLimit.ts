// 메시지 횟수 제한 (docs/network.md 4장): 창(window) 안에 max회까지. 넘으면 무시, 계속 넘으면 연결 종료
import { NET } from '@game/shared';

export class RateLimit {
  private hits = new Map<string, number[]>();
  private drops: number[] = [];

  /** 종류별 제한: [창 ms, 최대 횟수] */
  constructor(private rules: Record<string, readonly [number, number]>) {}

  /** 받아도 되면 true. 규칙이 없는 종류는 항상 true */
  allow(kind: string, now: number): boolean {
    const rule = this.rules[kind];
    if (!rule) return true;
    const [win, max] = rule;
    const list = (this.hits.get(kind) ?? []).filter((t) => now - t < win);
    const ok = list.length < max;
    if (ok) list.push(now);
    else this.drops.push(now);
    this.hits.set(kind, list);
    return ok;
  }

  /** 최근 kickWindowMs 안에 버린 메시지가 kickDrops개 이상이면 연결 종료 */
  shouldKick(now: number): boolean {
    this.drops = this.drops.filter((t) => now - t < NET.limits.kickWindowMs);
    return this.drops.length >= NET.limits.kickDrops;
  }
}

/** 던전 메시지 제한 (chat은 3초에 3회, ping은 제한 없음) */
export const dungeonRules = (): Record<string, readonly [number, number]> => {
  const l = NET.limits;
  return {
    input: [1000, l.input], action: [1000, l.action], item: [1000, l.action], interact: [1000, l.action],
    emote: [1000, l.island], chat: [l.chatWindowMs, l.chatMax], dev: [1000, l.island],
  };
};
