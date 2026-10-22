// 개발용 지연 시뮬레이터 패널 (docs/network.md 13장): ` 키로 열고 닫기. 지연·흔들림·손실 슬라이더 + RTT·보정 통계
// 도구 UI라 DOM으로 만든다 (게임 HUD는 캔버스). 글자는 textContent로만
import type { Connection } from './connection';
import type { OnlineStage } from '../stage/onlineStage';

const SLIDERS = [
  { key: 'lagMs', label: '지연(왕복) ms', min: 0, max: 300, step: 10, scale: 1 },
  { key: 'jitterMs', label: '흔들림 ±ms', min: 0, max: 50, step: 5, scale: 1 },
  { key: 'loss', label: '손실 %', min: 0, max: 5, step: 0.5, scale: 100 },
] as const;
const REFRESH_MS = 250;

export class LagPanel {
  private root = document.createElement('div');
  private info = document.createElement('pre');
  private timer: number;
  private onKey = (e: KeyboardEvent) => {
    if (e.code === 'Backquote') this.root.style.display = this.root.style.display === 'none' ? 'block' : 'none';
  };

  constructor(private conn: Connection, private stage: OnlineStage) {
    Object.assign(this.root.style, {
      position: 'fixed', top: '8px', left: '8px', padding: '8px 10px', background: 'rgba(0,0,0,0.75)', color: '#e6e6e6',
      font: '12px monospace', zIndex: '10', display: 'none', borderRadius: '4px', minWidth: '220px',
    });
    const title = document.createElement('div');
    title.textContent = '네트워크 흉내 (` 키)';
    title.style.marginBottom = '6px';
    this.root.append(title);
    for (const s of SLIDERS) this.root.append(this.slider(s));
    const reset = document.createElement('button');
    reset.textContent = '통계 초기화';
    reset.onclick = () => Object.assign(this.stage.local.corrections, { ignore: 0, smooth: 0, snap: 0, maxError: 0 });
    // 개발 명령: 방 진행 확인용 (서버 개발 모드에서만 동작)
    const clear = document.createElement('button');
    clear.textContent = '방 몬스터 모두 기절 (개발)';
    clear.onclick = () => this.conn.send('dev', { cmd: 'clear' });
    this.info.style.margin = '6px 0';
    const down = document.createElement('button');
    down.textContent = '나 쓰러지기 (개발)';
    down.onclick = () => this.conn.send('dev', { cmd: 'down' });
    const drop = document.createElement('button');
    drop.textContent = '연결 끊기 (개발)';
    drop.onclick = () => this.conn.debugDrop();
    this.root.append(this.info, reset, clear, down, drop);
    document.body.append(this.root);
    window.addEventListener('keydown', this.onKey);
    this.timer = window.setInterval(() => this.refresh(), REFRESH_MS);
  }

  destroy(): void {
    window.clearInterval(this.timer);
    window.removeEventListener('keydown', this.onKey);
    this.root.remove();
  }

  private slider(s: (typeof SLIDERS)[number]): HTMLElement {
    const row = document.createElement('label');
    row.style.display = 'block';
    const text = document.createElement('span');
    const input = document.createElement('input');
    Object.assign(input, { type: 'range', min: String(s.min), max: String(s.max), step: String(s.step) });
    input.value = String(this.conn.netSim[s.key] * s.scale);
    const show = () => { text.textContent = `${s.label} ${input.value} `; };
    input.oninput = () => {
      this.conn.netSim[s.key] = Number(input.value) / s.scale;
      show();
    };
    show();
    row.append(text, input);
    return row;
  }

  private refresh(): void {
    const c = this.stage.local.corrections, last = this.stage.local.lastCorrection;
    this.info.textContent = [
      `RTT ${Math.round(this.conn.clock.rtt)}ms`,
      `보정 무시 ${c.ignore} · 부드럽게 ${c.smooth} · 즉시 ${c.snap}`,
      `최대 오차 ${c.maxError.toFixed(1)}px (마지막 ${last.mode} ${last.error.toFixed(1)})`,
    ].join('\n');
  }
}
