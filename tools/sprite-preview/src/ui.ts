// 조작 패널용 작은 DOM 도우미 (텍스트는 textContent로만 넣는다)

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { className?: string; text?: string } = {},
  ...children: Node[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.className) node.className = props.className;
  if (props.text !== undefined) node.textContent = props.text;
  node.append(...children);
  return node;
}

function field(label: string, control: HTMLElement): HTMLLabelElement {
  return el('label', { className: 'field' }, el('span', { text: label }), control);
}

export function select(
  label: string,
  options: [value: string, text: string][],
  value: string,
  onChange: (v: string) => void,
): { node: HTMLElement; set: (options: [string, string][], value: string) => void } {
  const s = el('select');
  const fill = (opts: [string, string][], v: string) => {
    s.replaceChildren(...opts.map(([val, text]) => {
      const o = el('option', { text });
      o.value = val;
      return o;
    }));
    s.value = v;
  };
  fill(options, value);
  s.addEventListener('change', () => onChange(s.value));
  return { node: field(label, s), set: fill };
}

export function checkbox(label: string, value: boolean, onChange: (v: boolean) => void): HTMLElement {
  const c = el('input');
  c.type = 'checkbox';
  c.checked = value;
  c.addEventListener('change', () => onChange(c.checked));
  return el('label', { className: 'field check' }, c, el('span', { text: label }));
}

export function slider(
  label: string,
  [min, max, step]: [number, number, number],
  value: number,
  format: (v: number) => string,
  onChange: (v: number) => void,
): HTMLElement {
  const r = el('input');
  r.type = 'range';
  r.min = String(min);
  r.max = String(max);
  r.step = String(step);
  r.value = String(value);
  const out = el('output', { text: format(value) });
  r.addEventListener('input', () => {
    out.textContent = format(Number(r.value));
    onChange(Number(r.value));
  });
  return el('label', { className: 'field' }, el('span', { text: label }), r, out);
}

export function buttons(label: string, items: [text: string, onClick: () => void][]): HTMLElement {
  const row = el('div', { className: 'buttons' });
  for (const [text, onClick] of items) {
    const b = el('button', { text });
    b.type = 'button';
    b.addEventListener('click', onClick);
    row.append(b);
  }
  return field(label, row);
}

export const opts = (values: string[]): [string, string][] => values.map((v) => [v, v]);
