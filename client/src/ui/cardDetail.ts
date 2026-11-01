// 카드 창 오른쪽 상세 (hud.md 8장, 승인 데모 card_window.html): 머리(계열 색·카드·이름·종류·티어·장착 Lv) / 보유 줄(n/3 · 강화 · 없으면 지정 구매 가격) /
// 설명 3줄 / 액티브 = 변형 2장(강화만 고르기) · 패시브 = 기본/강화 효과·비용 / 아래 = 알림 또는 갈기·끼우기 버튼. 계열 보너스 줄에 마우스를 올리면 보너스 상세
import { buttonBox, cardFace, cardIcon, dustGem, fitKo, lockIcon, R, roman, SK, star, tiny, type Painter } from './cardParts';
import type { CardBtn, CardHit, CardSource } from './cardTypes';
import { koWidth, wrapKo } from './koText';

const X = 246, MW = 122;
const w7 = (t: string) => koWidth(t, 'koSmall');

export function drawDetail(p: Painter<CardHit>, s: CardSource): void {
  const g = p.g;
  R(g, 242, 27, 132, 181, SK.shade);
  R(g, 240, 26, 132, 181, SK.border);
  R(g, 241, 27, 130, 179, SK.card);
  if (s.hoverBonus) return bonusDetail(p, s);
  const id = s.hover ?? s.sel, c = s.card(id), mine = id === s.sel && !s.busy;
  R(g, 241, 27, 130, 36, c.color, 0.2);
  R(g, 241, 63, 130, 1, SK.border);
  cardFace(g, c, X - 1, 31, { big: true, merge: s.merge });
  p.text(X + 28, 29, fitKo(c.name, 94, 'ko'), c.owned ? SK.txt : SK.dim, 'ko');
  p.text(X + 28, 41, c.kind, c.color);
  for (let i = 0; i < c.tier; i++) star(g, X + 28 + i * 4, 53, c.tierColor);
  p.text(X + 28 + c.tier * 4 + 3, 50, `티어 ${c.tier} · 장착 Lv${c.equipLevel}`, s.level < c.equipLevel ? SK.danger : SK.key);
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
    const left = `${s.merge - c.count}장 더면 강화`;
    p.text(X + MW - w7(left), RY, left, SK.off);
  } else {
    R(g, X, RY + 2, 6, 6, SK.coin); R(g, X + 1, RY + 3, 4, 4, SK.gold); R(g, X + 2, RY + 4, 2, 2, SK.white);
    p.text(X + 9, RY, c.active ? `강화 카드 · 위력 ×${s.enhancedMul}` : '강화 카드', SK.coin);
    if (c.spare) p.text(X + MW - w7(`+${c.spare}`), RY, `+${c.spare}`, SK.spare);
  }
  wrapKo(c.desc.replace(/\n/g, ' '), MW, 3, 'koSmall').forEach((l, i) => p.text(X, 78 + i * 10, l, SK.dim));
  for (let i = 0; i < 126; i += 2) R(g, 243 + i, 109, 1, 1, SK.cardBd);
  if (c.active) {
    p.text(X, 111, '변형', SK.key);
    p.text(X + w7('변형') + 5, 111, c.enhanced ? '하나 고르기 · 섬에서 언제든' : `강화하면 고름 · 위력 ×${s.enhancedMul}`, c.enhanced ? SK.dim : SK.off);
    c.variants.forEach((v, i) => {
      const cy = 122 + i * 32, on = c.enhanced && c.variantIndex === i, can = c.enhanced && mine, hv = can && s.hoverBtn === `var${i}`, a = c.enhanced ? 1 : 0.4;
      R(g, X - 2, cy, MW + 4, 30, on ? SK.coin : hv ? SK.key : SK.cardBd);
      R(g, X - 1, cy + 1, MW + 2, 28, on ? SK.pick : SK.title);
      R(g, X + 2, cy + 3, 5, 5, on ? SK.coin : SK.key, a);
      R(g, X + 3, cy + 4, 3, 3, on ? SK.white : SK.title, a);
      p.text(X + 10, cy, v.name, on ? SK.coin : SK.txt, 'koSmall', a);
      tiny(g, String(i + 1), X + MW - 3, cy + 3, SK.off);
      wrapKo(v.desc, MW - 4, 2, 'koSmall').forEach((l, j) => p.text(X + 2, cy + 10 + j * 9, l, SK.dim, 'koSmall', a));
      if (can) p.hit(X - 2, cy, MW + 4, 30, { kind: 'var', i });
    });
  } else {
    p.text(X, 111, '효과', SK.key);
    const ct = `비용 ${c.cost} · 강화 ${c.cost + 1}`;
    p.text(X + MW - w7(ct), 111, ct, SK.off);
    (c.pointDesc ?? []).forEach((t, i) => {
      const on = c.owned && (i === 1) === c.enhanced, cy = 123 + i * 22;
      if (on) { R(g, X - 2, cy, MW + 4, 21, SK.pick); R(g, X - 2, cy, 1, 21, SK.coin); }
      p.text(X + 1, cy, i ? '강화' : '기본', on ? SK.coin : SK.off);
      p.text(X + 1, cy + 10, fitKo(t, MW - 4), on ? SK.coin : SK.dim);
    });
    p.text(X, 169, c.branchName ? `${c.branchName} 보너스에 1장으로 셈` : '계열 보너스에 안 셈', SK.off);
  }
  // 아래: 알림(서버 거절·안내, 출발 카운트다운) 또는 버튼
  const warn = s.note ?? (s.busy ? { text: '출발 카운트다운 중에는 못 바꿉니다', color: SK.danger } : null);
  if (warn) {
    R(g, 241, 184, 130, 22, SK.title);
    wrapKo(warn.text, MW, 2, 'koSmall').forEach((l, i) => p.text(X, 185 + i * 10, l, warn.color));
    return;
  }
  const BY = 190;
  if (c.owned && c.count > 0) {
    const n = c.spare > 1 ? c.spare : 1, arm = s.grindArm === id;
    const lab = arm ? `한 번 더 · +${c.dust * n}` : c.spare ? `갈기 추천 +${c.dust * n}` : `갈기 +${c.dust}`;
    button(p, s, 'grind', lab, X - 1, BY, mine, arm ? SK.danger : c.spare ? SK.spare : undefined);
  }
  if (c.owned && !c.locked) {
    const lab = c.equipped ? '빼기' : '끼우기', w = w7(lab) + 14;
    button(p, s, 'equip', lab, X + MW + 1 - w, BY, mine);
  } else if (c.owned) {
    const t = `Lv${c.equipLevel}부터`;
    lockIcon(g, X + MW - w7(t) - 8, BY + 3, SK.danger);
    p.text(X + MW - w7(t), BY + 1, t, SK.danger);
  } else p.text(X, BY + 1, '카드 상점에서 사기', SK.off);
}

function button(p: Painter<CardHit>, s: CardSource, b: CardBtn, label: string, x: number, y: number, can: boolean, border?: string): void {
  const w = w7(label) + 12, hover = can && s.hoverBtn === b;
  buttonBox(p.g, x, y, w, { hover, ...(border ? { border } : {}) });
  p.center(x, w, y + 1, label, hover ? SK.coin : SK.txt, 'koSmall', can ? 1 : 0.35);
  if (can) p.hit(x, y, w, 12, { kind: 'btn', b });
}

/** 계열 보너스 상세: Ⅰ·Ⅱ 문턱과 효과(지금 단계 금색), 세는 규칙, 끼운 그 계열 카드 */
function bonusDetail(p: Painter<CardHit>, s: CardSource): void {
  const g = p.g, b = s.bonus.find((x) => x.branch === s.hoverBonus)!;
  R(g, 241, 27, 130, 36, b.color, 0.2);
  R(g, 241, 63, 130, 1, SK.border);
  p.text(X, 31, b.branch, b.color, 'ko');
  p.text(X + 12, 31, `${b.name} 계열 보너스`, SK.txt, 'ko');
  p.text(X, 46, `끼운 ${b.name} 카드 ${b.ids.length}장`, SK.key);
  b.steps.forEach((lines, i) => {
    const cy = 68 + i * 34, on = b.step === i + 1;
    if (on) { R(g, X - 2, cy, MW + 4, 31, SK.pick); R(g, X - 2, cy, 1, 31, SK.coin); }
    roman(g, i + 1, X + 1, cy + 2, on ? SK.coin : SK.off);
    p.text(X + 10, cy, `${s.bonusAt[i]}장`, on ? SK.coin : SK.key);
    lines.forEach((t, j) => p.text(X + 3, cy + 10 + j * 10, t, on ? SK.coin : SK.dim));
  });
  wrapKo(`액티브·패시브 모두 셈. 기본 스킬·공용 패시브는 안 셈. ${s.bonusAt.at(-1)}장이 되면 ${s.bonusAt[0]}장 보너스 대신`, MW, 3, 'koSmall')
    .forEach((l, j) => p.text(X, 140 + j * 10, l, SK.off));
  b.ids.forEach((id, i) => {
    const x = X + i * 18, y = 176, c = s.card(id);
    R(g, x, y, 16, 16, c.tierColor);
    R(g, x + 1, y + 1, 14, 14, SK.title);
    cardIcon(g, id, x + 1, y + 1, { inset: 1 });
  });
}
