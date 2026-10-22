// 한 줄 입력창 (채팅·게시판 메모, hud.md 4장): 한글 입력기 때문에 DOM. 화면 왼쪽 아래(아래 HUD 띠 바로 위)
// Enter 보내기 / Esc 취소. 보낸 글은 서버가 다시 검사하고, 표시는 캔버스에서 텍스트로만
import { createLayer } from './domStyle';

export interface LineInputOptions {
  placeholder: string;
  maxLength: number;
  /** 게임 정수 배율 */
  scale: number;
  /** 아래 띠 높이 (내부 px) */
  bandHeight: number;
  onSubmit: (text: string) => void;
  onClose: () => void;
}

export class LineInput {
  private layer: HTMLDivElement;
  private input: HTMLInputElement;
  private closed = false;

  constructor(parent: HTMLElement, o: LineInputOptions) {
    this.layer = createLayer(parent, o.scale);
    // 가운데 정렬 층을 왼쪽 아래 붙이기로
    Object.assign(this.layer.style, { alignItems: 'flex-end', justifyContent: 'flex-start' });
    const box = document.createElement('div');
    Object.assign(box.style, {
      pointerEvents: 'auto', width: `calc(160px * var(--s))`,
      margin: `0 0 calc(${o.bandHeight + 2}px * var(--s)) calc(4px * var(--s))`,
    });
    this.input = document.createElement('input');
    this.input.className = 'ui-input';
    Object.assign(this.input, { type: 'text', placeholder: o.placeholder, maxLength: o.maxLength, autocomplete: 'off', spellcheck: false });
    box.appendChild(this.input);
    this.layer.appendChild(box);
    this.input.addEventListener('keydown', (e) => {
      // 게임 키(Phaser)로 새지 않게
      e.stopPropagation();
      if (e.isComposing) return;
      if (e.key === 'Enter') {
        const text = this.input.value.trim();
        if (text) o.onSubmit(text);
        this.close(o);
      } else if (e.key === 'Escape') this.close(o);
    });
    this.input.addEventListener('keyup', (e) => e.stopPropagation());
    this.input.addEventListener('blur', () => this.close(o));
    requestAnimationFrame(() => this.input.focus());
  }

  private close(o: LineInputOptions): void {
    if (this.closed) return;
    this.closed = true;
    this.layer.remove();
    o.onClose();
  }
}
