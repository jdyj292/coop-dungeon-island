// 로그인·가입·비밀번호 찾기 폼 (docs/security.md 1장, hud.md 9장). 한글 입력기 때문에 DOM, 모양은 도트 패널
// 글자는 모두 textContent (사용자 입력을 HTML로 해석하지 않음). 형식 검사는 서버와 같은 shared 스키마
import { AUTH, nicknameSchema, passwordSchema, recoveryCodeSchema, type MeRes } from '@game/shared';
import { API_ERROR_TEXT, api, type ApiResult } from '../../net/api';
import { el } from './domStyle';

type Mode = 'login' | 'signup' | 'recover';

interface FieldDef {
  name: string;
  label: string;
  type: 'text' | 'password';
  autocomplete: string;
  hint?: string;
  optional?: boolean;
  /** 형식이 맞으면 null, 아니면 문구 */
  check?: (v: string, all: Record<string, string>) => string | null;
}

const nickCheck = (v: string) => (nicknameSchema.safeParse(v).success ? null : `닉네임은 ${AUTH.nicknameMin}~${AUTH.nicknameMax}자, 한글·영문·숫자만`);
const pwCheck = (v: string) => (passwordSchema.safeParse(v).success ? null : `비밀번호는 ${AUTH.passwordMin}자 이상`);
const sameCheck = (v: string, all: Record<string, string>) => (v === all.password ? null : '비밀번호가 서로 다릅니다');

const FIELDS: Record<Mode, FieldDef[]> = {
  login: [
    { name: 'nickname', label: '닉네임', type: 'text', autocomplete: 'username' },
    { name: 'password', label: '비밀번호', type: 'password', autocomplete: 'current-password' },
  ],
  signup: [
    { name: 'nickname', label: '닉네임', type: 'text', autocomplete: 'username', hint: `${AUTH.nicknameMin}~${AUTH.nicknameMax}자`, check: nickCheck },
    { name: 'password', label: '비밀번호', type: 'password', autocomplete: 'new-password', hint: `${AUTH.passwordMin}자 이상`, check: pwCheck },
    { name: 'password2', label: '비밀번호 확인', type: 'password', autocomplete: 'new-password', check: sameCheck },
  ],
  recover: [
    { name: 'nickname', label: '닉네임', type: 'text', autocomplete: 'username' },
    { name: 'code', label: '복구 코드', type: 'text', autocomplete: 'off', hint: '가입할 때 받은 16자',
      check: (v) => (recoveryCodeSchema.safeParse(v).success ? null : '복구 코드 형식이 맞지 않습니다') },
    { name: 'password', label: '새 비밀번호', type: 'password', autocomplete: 'new-password', hint: `${AUTH.passwordMin}자 이상`, check: pwCheck },
    { name: 'password2', label: '새 비밀번호 확인', type: 'password', autocomplete: 'new-password', check: sameCheck },
  ],
};

const SUBMIT: Record<Mode, string> = { login: '로그인', signup: '가입하기', recover: '비밀번호 바꾸기' };

export class LoginForm {
  private panel = el('div', 'ui-panel');
  private busy = false;

  /** onDone: 로그인 끝 (가입·복구는 복구 코드를 보여준 뒤, signedUp = 방금 가입). onLayout: 내용이 바뀜 (크기 맞추기) */
  constructor(private layer: HTMLElement, private title: string, private onDone: (me: MeRes, signedUp: boolean) => void, private onLayout: () => void = () => undefined) {
    layer.appendChild(this.panel);
    this.show('login');
  }

  destroy(): void {
    this.panel.remove();
  }

  private show(mode: Mode): void {
    const p = this.panel;
    p.replaceChildren(el('div', 'ui-title', this.title));
    const tabs = el('div', 'ui-tabs');
    tabs.setAttribute('role', 'tablist');
    for (const [m, label] of [['login', '로그인'], ['signup', '가입']] as const) {
      const t = el('button', 'ui-tab', label);
      t.type = 'button';
      t.setAttribute('role', 'tab');
      t.setAttribute('aria-selected', String(m === mode));
      t.onclick = () => this.show(m);
      tabs.appendChild(t);
    }
    if (mode !== 'recover') p.appendChild(tabs);
    else p.appendChild(el('div', 'ui-p', '닉네임과 복구 코드로 새 비밀번호를 정합니다'));

    const form = el('form', '');
    form.noValidate = true;
    const inputs = new Map<string, HTMLInputElement>();
    for (const f of FIELDS[mode]) {
      const label = el('label', 'ui-label', f.label);
      if (f.hint) label.appendChild(el('span', 'ui-hint', ` (${f.hint})`));
      const input = el('input', 'ui-input');
      Object.assign(input, { type: f.type, name: f.name, autocomplete: f.autocomplete, spellcheck: false, maxLength: 64 });
      input.setAttribute('autocapitalize', 'off');
      label.appendChild(input);
      form.appendChild(label);
      inputs.set(f.name, input);
    }
    const error = el('div', 'ui-error');
    error.setAttribute('role', 'alert');
    const submit = el('button', 'ui-btn', SUBMIT[mode]);
    submit.type = 'submit';
    form.append(error, submit);
    p.appendChild(form);

    const link = el('button', 'ui-link', mode === 'recover' ? '로그인으로 돌아가기' : '비밀번호를 잊었어요');
    link.type = 'button';
    link.onclick = () => this.show(mode === 'recover' ? 'login' : 'recover');
    p.appendChild(link);
    this.onLayout();

    form.onsubmit = (e) => {
      e.preventDefault();
      if (this.busy) return;
      const all = Object.fromEntries([...inputs].map(([k, i]) => [k, i.value]));
      // 첫 번째 틀린 칸에 문구와 표시
      for (const f of FIELDS[mode]) {
        const input = inputs.get(f.name)!, v = all[f.name] ?? '';
        const msg = !v ? (f.optional ? null : `${f.label}을(를) 입력해 주세요`) : (f.check?.(v, all) ?? null);
        input.setAttribute('aria-invalid', String(!!msg));
        if (msg) {
          error.textContent = msg;
          input.focus();
          return;
        }
      }
      error.textContent = '';
      void this.send(mode, all, submit, error);
    };
    inputs.values().next().value?.focus();
  }

  private async send(mode: Mode, v: Record<string, string>, submit: HTMLButtonElement, error: HTMLElement): Promise<void> {
    this.busy = true;
    submit.disabled = true;
    const res: ApiResult<{ me: MeRes; recoveryCode?: string }> = mode === 'login' ? await api.login(v.nickname!, v.password!)
      : mode === 'signup' ? await api.signup(v.nickname!, v.password!)
      : await api.recover(v.nickname!, v.code!, v.password!);
    this.busy = false;
    submit.disabled = false;
    if (!res.ok) {
      error.textContent = API_ERROR_TEXT[res.error];
      return;
    }
    const { me, recoveryCode } = res.value;
    if (recoveryCode) this.showCode(recoveryCode, me, mode === 'signup');
    else this.onDone(me, false);
  }

  /** 복구 코드는 이번 한 번만 보여 준다 (서버엔 해시만) */
  private showCode(code: string, me: MeRes, signedUp: boolean): void {
    const p = this.panel;
    p.replaceChildren(
      el('div', 'ui-title', '복구 코드'),
      el('div', 'ui-p', '비밀번호를 잊었을 때 필요합니다.'),
      el('div', 'ui-p', '지금 한 번만 보여 줍니다. 꼭 적어 두세요.'),
      el('div', 'ui-code', code),
    );
    const copy = el('button', 'ui-btn ui-sub', '복사하기');
    copy.type = 'button';
    copy.onclick = () => void navigator.clipboard?.writeText(code).then(() => { copy.textContent = '복사했습니다'; }, () => undefined);
    const ok = el('button', 'ui-btn', '적어 두었어요');
    ok.type = 'button';
    ok.onclick = () => this.onDone(me, signedUp);
    p.append(copy, ok);
    this.onLayout();
  }
}
