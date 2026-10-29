// 우물 출발 대기 (docs/island.md 6장): 우물 앞에서 합류(최대 4명) → 대기 시작자가 출발 → 10초 카운트다운(그 사이 합류 가능)
// 혼자면 바로 출발. 대기 중 끊기거나 나가면 목록에서 빠지고, 대기 시작자가 빠지면 다음 사람이 이어받는다
import { ISLAND, nearFacility, parseC2S, type Facility, type Vec2 } from '@game/shared';
import type { IslandState } from '../schema/IslandState';

export interface WellOut {
  send: (userId: string, type: string, msg: unknown) => void;
}

export class IslandWell {
  constructor(
    private state: IslandState,
    private out: WellOut,
    /** 지금 섬에 있는 주민 위치 (우물 앞인지) */
    private posOf: (userId: string) => Vec2 | undefined,
    /** 이 섬의 시설 위치 (옮긴 시설이 우물 옆에 있어도 우물 앞인지 바르게) */
    private facilities: () => Facility[] | undefined,
    /** 출발: 파티원(대기 순서), 층 */
    private onDepart: (userIds: string[], floor: string) => void,
  ) {}

  private get w() {
    return this.state.well;
  }

  onMessage(userId: string, raw: unknown, now: number): void {
    const m = parseC2S('well', raw);
    if (!m) return;
    const fail = (reason: string) => this.out.send(userId, 'wellFail', { reason });
    const w = this.w, mine = w.members.includes(userId);
    if (m.op === 'join') {
      if (mine) return;
      const p = this.posOf(userId);
      if (!p || nearFacility(p, this.facilities()) !== 'well') return fail('far');
      if (w.members.length >= ISLAND.well.maxParty) return fail('full');
      if (!w.members.length) w.floor = m.floor && ISLAND.well.floors.includes(m.floor) ? m.floor : ISLAND.well.floors[0]!;
      w.members.push(userId);
    } else if (m.op === 'leave') this.drop(userId);
    else if (m.op === 'depart') {
      if (w.members[0] !== userId) return fail('notHost');
      if (w.departAt) return;
      if (w.members.length === 1) this.depart();
      else w.departAt = now + ISLAND.well.countdownSec * 1000;
    }
  }

  /** 대기에서 빠짐 (나가기·끊김). 아무도 없으면 카운트다운도 취소 */
  drop(userId: string): void {
    const i = this.w.members.indexOf(userId);
    if (i < 0) return;
    this.w.members.splice(i, 1);
    if (!this.w.members.length) this.reset();
  }

  tick(now: number): void {
    if (this.w.departAt && now >= this.w.departAt) this.depart();
  }

  private depart(): void {
    const ids = this.w.members.filter((id): id is string => !!id), floor = this.w.floor;
    this.reset();
    if (ids.length) this.onDepart(ids, floor);
  }

  private reset(): void {
    this.w.members.clear();
    this.w.departAt = 0;
    this.w.floor = '';
  }
}
