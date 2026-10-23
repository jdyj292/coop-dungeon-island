// 게시판 초대 탭 (hud.md 8장): 섬 초대 코드 보기·복사·새로 받기
// 코드는 섬 방 상태에 없고 HTTP API로만 (GET /api/me, POST /api/island/invite). 탭을 열 때마다 최신으로
import { AUTH } from '@game/shared';
import { API_ERROR_TEXT, api } from '../net/api';
import type { PanelButton, PanelRow } from '../ui/listPanel';

/** 아래 줄 알림 시간 */
const NOTE_MS = 2000;

/** 4자씩 끊어 보이기 (가입 창은 하이픈·공백을 무시) */
export const showCode = (code: string): string => code.match(/.{1,4}/g)!.join('-');

export class InviteTab {
  private code: string | null = null;
  /** 새 코드 확인 중 */
  confirm = false;
  private busy = false;
  private note = '';
  private noteUntil = 0;

  refresh(): void {
    this.confirm = false;
    void api.me().then((r) => (r.ok ? (this.code = r.value.me.island.inviteCode) : this.say(API_ERROR_TEXT[r.error])));
  }

  private say(text: string): void {
    this.note = text;
    this.noteUntil = Date.now() + NOTE_MS;
  }

  rows(residents: number): PanelRow[] {
    return this.code ? [{ label: `초대 코드  ${showCode(this.code)}` }, { label: `주민 ${residents}/${AUTH.islandResidents}`, dim: true }] : [];
  }

  /** 아래 줄 (버튼 두 개 옆이라 짧게) */
  footer(): string {
    if (this.confirm) return '이전 코드는 무효';
    return Date.now() < this.noteUntil ? this.note : '가입할 때 넣는 코드';
  }

  buttons(): PanelButton[] {
    return this.confirm
      ? [{ id: 'cancel', label: '취소' }, { id: 'reissue', label: '확인', disabled: this.busy }]
      : [{ id: 'copy', label: '복사', disabled: !this.code }, { id: 'reissue', label: '새 코드', disabled: !this.code || this.busy }];
  }

  act(id: string): void {
    if (id === 'cancel') this.confirm = false;
    else if (id === 'copy' && this.code) {
      // 클립보드는 https·localhost에서만
      const done = navigator.clipboard?.writeText(showCode(this.code));
      if (!done) return this.say('복사할 수 없습니다');
      done.then(() => this.say('복사했습니다'), () => this.say('복사할 수 없습니다'));
    } else if (id === 'reissue' && !this.busy) {
      if (!this.confirm) return void (this.confirm = true);
      this.confirm = false;
      this.busy = true;
      void api.reissueInvite().then((r) => {
        this.busy = false;
        if (!r.ok) return this.say(API_ERROR_TEXT[r.error]);
        this.code = r.value.inviteCode;
        this.say('새 코드를 받음');
      });
    }
  }
}
