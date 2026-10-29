// 게시판 주민 탭 (hud.md 8장, island.md 7장): 주민 목록 N/10, 섬 주인에게는 맨 위에 입장 신청 줄 + 거절·허용 버튼
// 주인·신청은 섬 방 상태에 없고 HTTP API로만 (GET /api/me, /api/island/requests, POST /api/island/decide). 탭을 열 때·신청 알림이 올 때마다 새로
import { AUTH, type JoinRequestItem } from '@game/shared';
import type { IslandConnection } from '../net/islandNet';
import { API_ERROR_TEXT, api } from '../net/api';
import type { PanelButton, PanelRow } from '../ui/listPanel';
import { ago } from './islandPanels';

/** 아래 줄 알림 시간 */
const NOTE_MS = 2000;

export class ResidentsTab {
  private ownerId: number | null = null;
  private requests: JoinRequestItem[] = [];
  private busy = false;
  private note = '';
  private noteUntil = 0;

  constructor(private conn: IslandConnection) {}

  /** 기다리는 입장 신청 수 (주인이 아니면 0, M 버튼 이름표) */
  get pending(): number {
    return this.owner ? this.requests.length : 0;
  }

  private get owner(): boolean {
    return this.ownerId !== null && String(this.ownerId) === this.conn.userId;
  }

  refresh(): void {
    void api.me().then((r) => {
      if (!r.ok) return this.say(API_ERROR_TEXT[r.error]);
      this.ownerId = r.value.me.island?.ownerId ?? null;
      if (!this.owner) return void (this.requests = []);
      void api.joinRequests().then((q) => (q.ok ? (this.requests = q.value.requests) : this.say(API_ERROR_TEXT[q.error])));
    });
  }

  private say(text: string): void {
    this.note = text;
    this.noteUntil = Date.now() + NOTE_MS;
  }

  /** 신청 줄(주인만) 다음에 주민 줄 (가입 순서) */
  rows(): PanelRow[] {
    const now = Date.now();
    const reqs = this.requests.map((q) => ({ label: `입장 신청 · ${q.nickname} · ${ago(q.createdAt, now)}` }));
    const residents = [...(this.conn.live.residents?.entries() ?? [])].map(([id, r]) => ({
      icon: { kind: 'face' as const, color: r.color ?? 0, hair: { style: r.hair ?? 0, color: r.hairColor ?? 0 } },
      label: `${r.name}${String(this.ownerId) === id ? ' (주인)' : ''}`, dim: !r.online,
    }));
    return [...reqs, ...residents];
  }

  footer(): string {
    if (Date.now() < this.noteUntil) return this.note;
    const n = this.conn.live.residents?.size ?? 0;
    return this.owner && this.requests.length ? `신청 ${this.requests.length} · 주민 ${n}/${AUTH.islandResidents}` : `주민 ${n}/${AUTH.islandResidents}`;
  }

  /** sel = 고른 줄 (신청 줄일 때만 버튼이 켜짐) */
  buttons(sel: number): PanelButton[] {
    if (!this.owner) return [];
    const off = this.busy || !this.requests[sel];
    return [{ id: 'reject', label: '거절', disabled: off }, { id: 'accept', label: '허용', disabled: off }];
  }

  act(id: string, sel: number): void {
    const q = this.requests[sel];
    if (!q || this.busy || (id !== 'accept' && id !== 'reject')) return;
    this.busy = true;
    void api.decideJoin(q.userId, id === 'accept').then((r) => {
      this.busy = false;
      this.say(r.ok ? (id === 'accept' ? `${q.nickname}님이 주민이 됨` : `${q.nickname}님 신청을 거절함`) : API_ERROR_TEXT[r.error]);
      this.refresh();
    });
  }
}
