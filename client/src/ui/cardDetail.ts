// 카드 창 오른쪽 상세 (hud.md 8장, 승인 데모 card_redesign.html): 머리(계열 색·카드·이름(강화 = 금색 +)·종류·티어 글자·모자란 장착 Lv) /
// 보유 줄(n/3 · 강화 · 없으면 지정 구매 가격, 3장이 모이면 서버가 바로 강화, 갈기 없음) / 설명 3줄 / 액티브 = 강화면 변형 2장 고르기, 아니면 변형 이름만 ·
// 패시브 = 기본/강화 효과·비용 / 아래 = 알림 또는 끼우기 버튼. 계열 보너스 줄에 마우스를 올리면 보너스 상세. 머리 카드는 cardWindow가 그림
import { buttonBox, cardIcon, dustGem, fitKo, lockIcon, R, roman, SK, tiny, type Painter } from './cardParts';
import type { CardBtn, CardHit, CardSource } from './cardTypes';
import { koWidth, wrapKo } from './koText';

const X = 246, MW = 122;
const w7 = (t: string) => koWidth(t, 'koSmall');
/** 머리 카드 자리 (cardWindow가 그림, 머리 띠 27~63 안) */
export const DETAIL_CARD = { x: X - 1, y: 29 } as const;

export function drawDetail(p: Painter<CardHit>, s: CardSource): void {
  const g = p.g;
  R(g, 242, 27, 132, 181, SK.shade);
  R(g, 240, 26, 132, 181, SK.border);
  R(g, 241, 27, 130, 179, SK.card);
  if (s.hoverBonus) return bonusDetail(p, s);
  const id = s.hover ?? s.sel, c = s.card(id), mine = id === s.sel && !s.busy;
  R(g, 241, 27, 130, 36, c.color, 0.2);
  R(g, 241, 63, 130, 1, SK.border);
  const nw = p.text(X + 28, 30, fitKo(c.name, 90), c.owned ? SK.txt : SK.dim);
  if (c.enhanced) p.text(X + 29 + nw, 30, '+', SK.coin);
  p.text(X + 28, 41, c.kind, c.color);
  const tw = p.text(X + 28, 51, `티어 ${c.tier}`, SK.txt);
  if (s.level < c.equipLevel) p.text(X + 34 + tw, 51, `장착 Lv${c.equipLevel}`, SK.danger);
  // 보유 줄
  const RY = 66;
  if (!c.owned) {
    p.text(X, RY, '없는 카드', SK.off);
    const pt = `지정 구매 ${c.craft}`;
    dustGem(g, X + MW - w7(pt) - 9, RY + 2);
    p.text(X + MW - w7(pt), RY, pt, SK.key);
  } else if (!c.enhanced) {
    for (let i = 0; i < s.merge; i++) { R(g, X + i * 7, RY + 2, 6, 6, SK.shade); R(g, X + i * 7, RY + 2, 6, 5, i < c.count ? SK.coin : SK.track); }
    p.text(X + s.merge * 7 + 3, RY, `보유 ${c.count}/${s.merge}장`, SK.txt);
  } else {
    p.text(X, RY, c.active ? `강화 · 위력 ×${s.enhancedMul}` : '강화', SK.coin);
  }
  wrapKo(c.desc.replace(/\n/g, ' '), MW, 3, 'koSmall').forEach((l, i) => p.text(X, 78 + i * 10, l, SK.dim));
  for (let i = 0; i < 126; i += 2) R(g, 243 + i, 109, 1, 1, SK.cardBd);
  if (c.active && c.enhanced) {
    p.text(X, 111, '변형 고르기', SK.key);
    c.variants.forEach((v, i) => {
      const cy = 122 + i * 31, on = c.variantIndex === i, hv = mine && s.hoverBtn === `var${i}`;
      R(g, X - 2, cy, MW + 4, 29, on ? SK.coin : hv ? SK.key : SK.cardBd);
      R(g, X - 1, cy + 1, MW + 2, 27, on ? SK.pick : SK.title);
      R(g, X + 2, cy + 3, 5, 5, on ? SK.coin : SK.key);
      R(g, X + 3, cy + 4, 3, 3, on ? SK.white : SK.title);
      p.text(X + 10, cy, v.name, on ? SK.coin : SK.txt);
      tiny(g, String(i + 1), X + MW - 3, cy + 3, SK.off);
      wrapKo(v.desc, MW - 4, 2, 'koSmall').forEach((l, j) => p.text(X + 2, cy + 10 + j * 8, l, SK.dim));
      if (mine) p.hit(X - 2, cy, MW + 4, 29, { kind: 'var', i });
    });
  } else if (c.active) {
    p.text(X, 111, '변형', SK.key);
    p.text(X + w7('변형') + 5, 111, '강화하면 하나 고름', SK.off);
    c.variants.forEach((v, i) => { tiny(g, String(i + 1), X + 1, 125 + i * 12, SK.off); p.text(X + 8, 122 + i * 12, v.name, SK.dim); });
  } else {
    p.text(X, 111, '효과', SK.key);
    const ct = `비용 ${c.cost}`;
    p.text(X + MW - w7(ct), 111, ct, SK.off);
    (c.pointDesc ?? []).forEach((t, i) => {
      const on = c.owned && (i === 1) === c.enhanced, cy = 123 + i * 22;
      if (on) { R(g, X - 2, cy, MW + 4, 21, SK.pick); R(g, X - 2, cy, 1, 21, SK.coin); }
      p.text(X + 1, cy, i ? '강화' : '기본', on ? SK.coin : SK.off);
      p.text(X + 1, cy + 10, fitKo(t, MW - 4), on ? SK.coin : SK.dim);
    });
  }
  // 아래: 알림(서버 거절·안내, 출발 카운트다운) 또는 버튼
  const warn = s.note ?? (s.busy ? { text: '출발 카운트다운 중에는 못 바꿉니다', color: SK.danger } : null);
  if (warn) {
    R(g, 241, 184, 130, 22, SK.title);
    wrapKo(warn.text, MW, 2, 'koSmall').forEach((l, i) => p.text(X, 185 + i * 10, l, warn.color));
    return;
  }
  const BY = 190;
  if (c.owned && !c.locked) {
    const lab = c.equipped ? '빼기' : '끼우기', w = w7(lab) + 14;
    button(p, s, 'equip', lab, X + MW + 1 - w, BY, mine);
  } else if (c.owned) {
    const t = `Lv${c.equipLevel}부터`;
    lockIcon(g, X + MW - w7(t) - 8, BY + 3, SK.danger);
    p.text(X + MW - w7(t), BY + 1, t, SK.danger);
  } else p.text(X, BY + 1, '카드 상점에서 사기', SK.off);
}

/** 버튼 */
function button(p: Painter<CardHit>, s: CardSource, b: CardBtn, label: string, x: number, y: number, can: boolean, pad = 12): void {
  const w = w7(label) + pad, hover = can && s.hoverBtn === b;
  buttonBox(p.g, x, y, w, { hover });
  p.center(x, w, y + 1, label, hover ? SK.coin : SK.txt, 'koSmall', can ? 1 : 0.35);
  if (can) p.hit(x, y, w, 12, { kind: 'btn', b });
}

/** 계열 보너스 상세: Ⅰ·Ⅱ 문턱과 효과(지금 단계 금색), 세는 규칙, 끼운 그 계열 카드 */
function bonusDetail(p: Painter<CardHit>, s: CardSource): void {
  const g = p.g, b = s.bonus.find((x) => x.branch === s.hoverBonus)!;
  R(g, 241, 27, 130, 36, b.color, 0.2);
  R(g, 241, 63, 130, 1, SK.border);
  p.text(X, 31, `${b.name} 계열 보너스`, SK.txt);
  p.text(X, 45, `끼운 ${b.name} 카드 ${b.ids.length}장`, SK.key);
  b.steps.forEach((lines, i) => {
    const cy = 68 + i * 34, on = b.step === i + 1;
    if (on) { R(g, X - 2, cy, MW + 4, 31, SK.pick); R(g, X - 2, cy, 1, 31, SK.coin); }
    roman(g, i + 1, X + 1, cy + 2, on ? SK.coin : SK.off);
    p.text(X + 10, cy, `${s.bonusAt[i]}장`, on ? SK.coin : SK.key);
    lines.forEach((t, j) => p.text(X + 3, cy + 10 + j * 10, t, on ? SK.coin : SK.dim));
  });
  wrapKo(`액티브·패시브 모두 셈. ${s.bonusAt.at(-1)}장이 되면 ${s.bonusAt[0]}장 보너스 대신`, MW, 3, 'koSmall')
    .forEach((l, j) => p.text(X, 140 + j * 10, l, SK.off));
  b.ids.forEach((id, i) => {
    const x = X + i * 18, y = 176;
    R(g, x, y, 16, 16, s.card(id).color);
    R(g, x + 1, y + 1, 14, 14, SK.title);
    cardIcon(g, id, x + 1, y + 1, { inset: 1 });
  });
}
