// 카드 고르기 창 (hud.md 8장): 장착 화면의 칸을 누르면 카드 창 왼쪽 자리에 뜬다. 액티브 = 끼울 칸(A S D F)이 정해져 있고, 패시브 = 끝에 더함.
// 제목 띠(액티브/패시브 카드 고르기 · 칸 또는 비용 · 닫기) / 장착 중 줄(액티브 = A S D F 4칸 아이콘 + 이름, 끼울 칸 금색 · 패시브 = 끼운 카드 아이콘) /
// 거르기 탭(전체 · 기본(공용) · 계열들, 데이터에서 만듦) + 보유 수 / 카드 격자 PICK_COLS × PICK_ROWS (카드 + 이름), 넘치면 휠·↑↓로 넘기고 오른쪽에 스크롤 막대
import { CH, CW, Painter, R, SK, cardIcon, corners, keyTag } from './cardParts';
import { fitHi, hiWidth } from './hiText';
import { PICK_COLS, PICK_ROWS, type CardHit, type CardInfo, type CardSource } from './cardTypes';

const KEYS = ['A', 'S', 'D', 'F'];
/** 격자 칸 크기 · 왼쪽 위 */
const CELL_W = 43, CELL_H = 42, GX = 15, GY = 80;

type Face = (c: CardInfo, x: number, y: number, o: { sel?: boolean; hov?: boolean }) => void;

/** 16×16 아이콘 칸 (테두리 = 계열 색, gold = 금색 테두리) */
function mini(p: Painter<CardHit>, s: CardSource, id: string | null, x: number, y: number, gold: boolean): void {
  const g = p.g;
  R(g, x + 1, y + 1, 16, 16, SK.shade);
  R(g, x, y, 16, 16, gold ? SK.coin : id ? s.card(id).color : SK.cardBd);
  R(g, x + 1, y + 1, 14, 14, SK.title);
  if (id) cardIcon(g, id, x + 1, y + 1, { inset: 1 });
  if (gold) corners(g, x, y, 16, 16, SK.coin);
}

/** 장착 중 줄 (y 42~60): 지금 끼운 카드를 보며 고름. 칸에 마우스를 올리면 상세, 누르면 액티브 = 끼울 칸 바꾸기 · 패시브 = 그 카드 고르기 */
function equipped(p: Painter<CardHit>, s: CardSource): void {
  const g = p.g, pk = s.picker!;
  R(g, 12, 42, 224, 19, SK.card);
  if (pk.kind === 'active') {
    // 칸 폭 56: 아이콘 + 이름 (끼울 칸은 금색 바탕)
    s.active.forEach((id, k) => {
      const cx = 12 + k * 56, x = cx + 4, y = 43, on = pk.slot === k;
      if (on) R(g, cx, 42, 56, 19, SK.pick);
      mini(p, s, id, x, y, on);
      keyTag(g, x - 2, y + 8, KEYS[k]!);
      p.text(x + 19, 46, id ? fitHi(s.card(id).name, 33, 'small') : '빈 칸', on ? SK.coin : id ? SK.txt : SK.off, 'small');
      p.hit(cx, 42, 56, 19, { kind: 'aslot', k });
    });
    return;
  }
  p.text(16, 46, '장착 중', SK.key, 'small');
  if (!s.passive.length) return void p.text(50, 46, '없음', SK.off, 'small');
  s.passive.forEach((id, i) => {
    const x = 50 + i * 18;
    mini(p, s, id, x, 43, s.sel === id);
    p.hit(x, 43, 16, 16, { kind: 'pslot', i });
  });
}

export function drawPicker(p: Painter<CardHit>, s: CardSource, face: Face): void {
  const g = p.g, pk = s.picker!;
  R(g, 11, 26, 228, 183, SK.shade);
  R(g, 10, 25, 228, 183, SK.border);
  R(g, 11, 26, 226, 181, SK.panel);
  R(g, 11, 26, 226, 14, SK.title);
  R(g, 11, 40, 226, 1, SK.border);
  const tw = p.text(15, 28, pk.kind === 'active' ? '액티브 카드 고르기' : '패시브 카드 고르기', SK.txt, 'title');
  const sub = pk.kind === 'active' ? `${KEYS[pk.slot]} 칸에 끼우기` : `비용 ${s.used}/${s.cap}`;
  p.text(21 + tw, 28, sub, pk.kind === 'active' || s.used <= s.cap ? SK.coin : SK.danger, 'small');
  // 닫기
  const cl = '닫기 X', cw = hiWidth(cl, 'small') + 10, cx = 234 - cw, hv = s.hoverBtn === 'pclose';
  R(g, cx, 28, cw, 11, hv ? SK.coin : SK.border);
  R(g, cx + 1, 29, cw - 2, 9, hv ? SK.pick : SK.lit);
  p.text(cx + 5, 28, cl, hv ? SK.coin : SK.txt, 'small');
  p.hit(cx, 28, cw, 11, { kind: 'pclose' });
  equipped(p, s);
  // 거르기 탭 (키보드로 탭 줄에 있으면 고른 탭에 금색 꺾쇠)
  let fx = 12;
  s.filters.forEach((lab, i) => {
    const w = hiWidth(lab, 'small') + 12, on = s.filter === i, h = s.hoverBtn === `f${i}`;
    if (on) { R(g, fx, 63, w, 13, SK.border); R(g, fx + 1, 64, w - 2, 12, SK.card); R(g, fx + 1, 64, w - 2, 1, SK.hi); }
    else { R(g, fx, 65, w, 10, h ? SK.key : SK.cardBd); R(g, fx + 1, 66, w - 2, 8, SK.title); }
    if (on && s.pickRow) corners(g, fx, 63, w, 13, SK.coin);
    p.text(fx + 6, on ? 64 : 65, lab, on || h ? SK.txt : SK.key, 'small');
    p.hit(fx, 63, w, 13, { kind: 'filter', i });
    fx += w + 2;
  });
  const ht = `보유 ${s.owned}/${s.total}`;
  p.text(234 - hiWidth(ht, 'small'), 65, ht, SK.off, 'small');
  // 격자
  R(g, 13, 78, 224, 130, SK.shade);
  R(g, 12, 77, 224, 130, SK.border);
  R(g, 13, 78, 222, 128, SK.card);
  if (!s.pick.length) return void p.center(13, 222, 136, '카드 없음', SK.off);
  const first = s.scroll * PICK_COLS;
  s.pick.slice(first, first + PICK_COLS * PICK_ROWS).forEach((id, n) => {
    const c = s.card(id), x = GX + (n % PICK_COLS) * CELL_W, y = GY + Math.floor(n / PICK_COLS) * CELL_H, kx = x + Math.floor((CELL_W - CW) / 2);
    const sel = s.sel === id && !s.pickRow;
    if (sel) R(g, x, y - 1, CELL_W - 1, CELL_H - 1, SK.pick);
    face(c, kx, y, { sel, hov: s.hover === id });
    const nm = fitHi(c.name, CELL_W - (c.enhanced ? 8 : 2), 'small'), nw = hiWidth(nm, 'small') + (c.enhanced ? 5 : 0), nx = x + Math.floor((CELL_W - nw) / 2);
    p.text(nx, y + CH + 1, nm, c.owned ? SK.txt : SK.dim, 'small');
    if (c.enhanced) p.text(nx + nw - 5, y + CH + 1, '+', SK.coin, 'small');
    p.hit(x, y - 1, CELL_W - 1, CELL_H - 1, { kind: 'card', id });
  });
  // 스크롤 막대 (넘칠 때만)
  const rows = Math.ceil(s.pick.length / PICK_COLS);
  if (rows > PICK_ROWS) {
    const th = 124, bar = Math.max(10, Math.round((th * PICK_ROWS) / rows)), by = 80 + Math.round(((th - bar) * s.scroll) / (rows - PICK_ROWS));
    R(g, 231, 80, 2, th, SK.track);
    R(g, 231, by, 2, bar, SK.key);
  }
}
