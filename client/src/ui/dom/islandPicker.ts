// 섬 고르기 화면 (docs/island.md 7장, hud.md 9장): 섬이 없는 계정. 모든 섬 목록(이름·주인·주민 N/10)에서 입장 신청, 또는 새 섬 만들기
// 신청하면 "허용 기다리는 중" 화면에서 POLL_MS마다 /api/me로 확인 → 허용되면 onDone. 거절되면 알리고 목록으로. 글자는 모두 textContent
import { AUTH, type IslandListItem, type MeRes } from '@game/shared';
import { API_ERROR_TEXT, api, type ApiResult } from '../../net/api';
import { el } from './domStyle';

const POLL_MS = 3000;

export class IslandPicker {
  private panel = el('div', 'ui-panel ui-wide');
  private timer = 0;
  private busy = false;
  private gone = false;

  /** onDone: 섬이 생김 (만들었거나 허용됨). onLogout: 로그아웃 */
  constructor(layer: HTMLElement, private me: MeRes, private onDone: (me: MeRes) => void, private onLogout: () => void, private onLayout: () => void) {
    layer.appendChild(this.panel);
    this.route(me);
  }

  destroy(): void {
    this.gone = true;
    window.clearTimeout(this.timer);
    this.panel.remove();
  }

  /** 서버가 준 내 상태대로 화면 고르기 */
  private route(me: MeRes, note = ''): void {
    this.me = me;
    window.clearTimeout(this.timer);
    if (me.island) return this.onDone(me);
    if (me.request?.rejected) {
      // 거절은 한 번만 알리고 지움
      void api.cancelJoin();
      return void this.showList(`'${me.request.islandName}' 입장이 거절되었습니다`);
    }
    if (me.request) return this.showWaiting(me.request.islandName, note);
    void this.showList(note);
  }

  private async send(p: Promise<ApiResult<{ me: MeRes }>>, error: HTMLElement): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    const r = await p;
    this.busy = false;
    if (this.gone) return;
    if (r.ok) this.route(r.value.me);
    else error.textContent = API_ERROR_TEXT[r.error];
  }

  private footer(): HTMLElement {
    const link = el('button', 'ui-link', '로그아웃');
    link.type = 'button';
    link.onclick = () => this.onLogout();
    return link;
  }

  private async showList(note: string): Promise<void> {
    const p = this.panel, error = el('div', 'ui-error', note), list = el('div', 'ui-list');
    list.appendChild(el('div', 'ui-empty', '불러오는 중'));
    p.replaceChildren(el('div', 'ui-title', '섬 고르기'), el('div', 'ui-p', `${this.me.nickname}님, 함께 살 섬을 고르세요. 섬 주인이 허용하면 들어갑니다.`), list, error);

    const create = el('button', 'ui-btn', '새 섬 만들기');
    create.type = 'button';
    let confirm = false;
    create.onclick = () => {
      // 1인 1섬, 나중에 옮길 수 없으니 한 번 더 확인
      if (!confirm) {
        confirm = true;
        create.textContent = '내 섬을 만들까요? (옮길 수 없음)';
        return;
      }
      void this.send(api.createIsland(), error);
    };
    p.append(create, this.footer());
    this.onLayout();

    const r = await api.islands();
    if (this.gone || !list.isConnected) return;
    if (!r.ok) {
      list.replaceChildren(el('div', 'ui-empty', API_ERROR_TEXT[r.error]));
      return;
    }
    list.replaceChildren(...(r.value.islands.length ? r.value.islands.map((i) => this.row(i, error)) : [el('div', 'ui-empty', '아직 섬이 없습니다')]));
    this.onLayout();
  }

  private row(i: IslandListItem, error: HTMLElement): HTMLElement {
    const full = i.residents >= AUTH.islandResidents;
    const row = el('div', 'ui-row'), main = el('div', 'ui-row-main');
    main.append(el('div', '', i.name), el('div', 'ui-row-sub', `주인 ${i.owner} · 주민 ${i.residents}/${AUTH.islandResidents}`));
    const btn = el('button', 'ui-btn ui-small', full ? '가득' : '신청');
    btn.type = 'button';
    btn.disabled = full;
    btn.onclick = () => void this.send(api.requestJoin(i.id), error);
    row.setAttribute('aria-disabled', String(full));
    row.append(main, btn);
    return row;
  }

  private showWaiting(islandName: string, note: string): void {
    const p = this.panel, error = el('div', 'ui-error', note);
    p.replaceChildren(
      el('div', 'ui-title', '입장 신청'),
      el('div', 'ui-p', `'${islandName}'에 입장을 신청했습니다.`),
      el('div', 'ui-p', '섬 주인이 허용하면 바로 들어갑니다.'),
      el('div', 'ui-code', '허용 기다리는 중'),
      error,
    );
    const other = el('button', 'ui-btn ui-sub', '다른 섬 고르기');
    other.type = 'button';
    other.onclick = () => void this.showList('');
    const cancel = el('button', 'ui-btn', '신청 취소');
    cancel.type = 'button';
    cancel.onclick = () => void this.send(api.cancelJoin(), error);
    p.append(other, cancel, this.footer());
    this.onLayout();
    this.poll();
  }

  private poll(): void {
    this.timer = window.setTimeout(() => {
      void api.me().then((r) => {
        if (this.gone || !this.me.request) return;
        // 허용·거절됐거나 신청이 없어짐 → 그 화면으로 (버튼 처리 중이면 다음 번에)
        if (r.ok && !this.busy && (r.value.me.island || r.value.me.request?.rejected || !r.value.me.request)) this.route(r.value.me);
        else this.poll();
      });
    }, POLL_MS);
  }
}
