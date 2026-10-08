// sprite-preview: 게임과 같은 합성·음영 코드로 스프라이트를 확대해 본다 (docs/sprites.md 8장)
import { characterTab } from './characterTab';
import { compareTab } from './compareTab';
import { monsterTab } from './monsterTab';
import { el } from './ui';

const tabs: [string, () => HTMLElement][] = [
  ['캐릭터', characterTab],
  ['비교', compareTab],
  ['몬스터', monsterTab],
];

const app = document.getElementById('app')!;
const nav = el('nav');
const body = el('main');
const built = new Map<string, HTMLElement>();

function show(name: string): void {
  if (!built.has(name)) built.set(name, tabs.find(([n]) => n === name)![1]());
  body.replaceChildren(built.get(name)!);
  for (const b of nav.children) b.classList.toggle('on', b.textContent === name);
  location.hash = encodeURIComponent(name);
}

for (const [name] of tabs) {
  const b = el('button', { text: name });
  b.type = 'button';
  b.addEventListener('click', () => show(name));
  nav.append(b);
}
app.append(el('header', {}, el('h1', { text: 'sprite-preview' }), nav), body);
show(decodeURIComponent(location.hash.slice(1)) || tabs[0]![0]);
