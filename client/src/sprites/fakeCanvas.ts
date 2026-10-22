// 테스트·변환용 가짜 캔버스: 승인 데모(docs/refs/demos)의 그리기 코드를 Node에서 돌려 픽셀을 얻는다
// fillRect·getImageData·drawImage(같은 크기 복사)만. 색은 '#rrggbb'만 (데모의 사물·바닥 그리기에 쓰는 것)

export class FakeCanvas {
  width = 0;
  height = 0;
  /** 행 우선 '#rrggbb' 또는 null */
  px: (string | null)[] = [];
  private ctx: FakeContext | null = null;

  getContext(): FakeContext {
    if (this.px.length !== this.width * this.height) this.px = Array(this.width * this.height).fill(null);
    this.ctx ??= new FakeContext(this);
    return this.ctx;
  }

  at(x: number, y: number): string | null {
    return x < 0 || y < 0 || x >= this.width || y >= this.height ? null : (this.px[y * this.width + x] ?? null);
  }
}

class FakeContext {
  fillStyle = '#000000';
  imageSmoothingEnabled = false;
  constructor(private c: FakeCanvas) {}

  fillRect(x: number, y: number, w: number, h: number): void {
    const col = this.fillStyle.toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(col)) throw new Error(`FakeCanvas: 지원하지 않는 색 ${this.fillStyle}`);
    for (let j = Math.max(0, Math.floor(y)); j < Math.min(this.c.height, Math.floor(y + h)); j++) {
      for (let i = Math.max(0, Math.floor(x)); i < Math.min(this.c.width, Math.floor(x + w)); i++) this.c.px[j * this.c.width + i] = col;
    }
  }

  getImageData(_x: number, _y: number, w: number, h: number): { data: Uint8ClampedArray } {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const col = this.c.at(i, j);
        if (!col) continue;
        const n = parseInt(col.slice(1), 16), k = (j * w + i) * 4;
        data.set([(n >> 16) & 255, (n >> 8) & 255, n & 255, 255], k);
      }
    }
    return { data };
  }

  drawImage(src: FakeCanvas, dx: number, dy: number): void {
    for (let j = 0; j < src.height; j++) {
      for (let i = 0; i < src.width; i++) {
        const col = src.at(i, j), x = i + dx, y = j + dy;
        if (col && x >= 0 && y >= 0 && x < this.c.width && y < this.c.height) this.c.px[y * this.c.width + x] = col;
      }
    }
  }
}

/** 데모 스크립트 조각을 가짜 document로 실행하고 이름들을 돌려받는다 */
export function runDemoScript(code: string, names: string[]): Record<string, unknown> {
  const document = { createElement: () => new FakeCanvas() };
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const fn = new Function('document', `${code}\nreturn {${names.join(',')}};`) as (d: typeof document) => Record<string, unknown>;
  return fn(document);
}

/** 데모 HTML에서 줄 범위(1부터, 끝 포함)를 잘라낸다 */
export const demoLines = (html: string, from: number, to: number): string => html.split(/\r?\n/).slice(from - 1, to).join('\n');
