// 스킬 창 오른쪽 상세 (hud.md 8장, 승인 데모 skill_window.html): 머리(계열 색·24px 칸·이름·종류) / 포인트 줄(점·N/3·위력 또는 배움, - + 버튼) /
// 설명 3줄 / 변형 카드 2장(고르기 동그라미) 또는 패시브 포인트별 효과 / 알림 2줄. 고른 칸에 마우스를 올리면 그 칸을 미리 보여 줌
import { COMBAT } from '@game/shared';
import { koWidth, wrapKo } from './koText';
import { buttonBox, lockIcon, R, SK, type Painter } from './skillParts';
import type { SkillHit, SkillSource } from './skillWindow';

const X = 246, MW = 122, LEVEL_MUL = COMBAT.skillTree.levelMul;
type CellFn = (id: string, x: number, y: number, size: number, big: boolean) => void;

export function drawDetail(p: Painter<SkillHit>, s: SkillSource, id: string, cell: CellFn): void {
  const g = p.g, n = s.node(id), mine = id === s.sel && !s.busy;
  R(g, 242, 28, 132, 180, SK.shade);
  R(g, 240, 27, 132, 180, SK.border);
  R(g, 241, 28, 130, 178, SK.card);
  R(g, 241, 28, 130, 32, n.plain ? SK.key : n.color, 0.2);
  R(g, 241, 60, 130, 1, SK.border);
  cell(id, X, 32, 24, true);
  let name = n.name;
  while (koWidth(name, 'ko') > 94 && name.length > 1) name = name.slice(0, -1);
  p.text(X + 29, 31, name, SK.txt, 'ko');
  p.text(X + 29, 44, n.kind, n.plain ? SK.key : n.color);
  // 상태 줄
  const RY = 65;
  if (!n.open) {
    lockIcon(g, X, RY + 2, SK.danger);
    p.text(X + 8, RY, `Lv ${n.lv}에 열림 · 지금 Lv ${s.level}`, SK.danger);
  } else {
    const pts = n.points, mx = n.max;
    for (let i = 0; i < mx; i++) {
      const px = X + i * 7, c = i < pts ? SK.coin : SK.track;
      R(g, px, RY + 2, 6, 6, SK.shade);
      R(g, px + 2, RY + 2, 2, 6, c);
      R(g, px, RY + 4, 6, 2, c);
      R(g, px + 1, RY + 3, 4, 4, c);
    }
    const count = `${pts}/${mx}`, tx = X + mx * 7 + 3;
    p.text(tx, RY, count, SK.txt);
    p.text(tx + koWidth(count, 'koSmall') + 5, RY, n.passive ? (pts ? '배움' : '안 배움') : `위력 ×${LEVEL_MUL[pts - 1] ?? 1}`, pts ? SK.heal : SK.key);
    if (id === s.sel) {
      button(p, s, 'minus', '-', 336, RY - 1, mine && pts > (n.passive ? 0 : 1));
      button(p, s, 'plus', '+', 353, RY - 1, mine && pts < mx && s.spent < s.sp);
    }
  }
  // 설명
  wrapKo(n.desc.replace(/\n/g, ' '), MW, 3, 'koSmall').forEach((l, i) => p.text(X, 79 + i * 10, l, SK.dim));
  for (let i = 0; i < 126; i += 2) R(g, 243 + i, 111, 1, 1, SK.cardBd);
  if (n.variants.length) variants(p, s, id, mine);
  else if (n.pointDesc) {
    p.text(X, 113, '포인트별 효과', SK.key);
    p.text(X + koWidth('포인트별 효과', 'koSmall') + 5, 113, 'SP 1씩', SK.off);
    n.pointDesc.forEach((t, i) => {
      const on = n.points === i + 1, cy = 124 + i * 11, c = on ? SK.coin : i < n.points ? SK.dim : SK.off;
      if (on) { R(g, X - 2, cy, MW + 4, 11, SK.pick); R(g, X - 2, cy, 1, 11, SK.coin); }
      p.text(X + 1, cy + 1, String(i + 1), c);
      p.text(X + 8, cy + 1, t, c);
    });
    wrapKo(n.plain ? '공용: 어느 계열에서나 켜짐' : '계열 보조: 선택한 계열일 때만 켜짐', MW, 2, 'koSmall').forEach((l, i) => p.text(X, 160 + i * 10, l, SK.off));
  }
  // 알림: 서버 거절·안내, 출발 카운트다운
  const warn = [...(s.note ? [s.note] : []), ...(s.busy ? [{ text: '출발 카운트다운 중에는 못 바꿉니다', color: SK.danger }] : [])];
  if (warn.length) {
    R(g, 241, 185, 130, 21, SK.title);
    warn.flatMap((w) => wrapKo(w.text, MW, 2, 'koSmall').map((t) => ({ t, c: w.color }))).slice(0, 2).forEach((l, i) => p.text(X, 185 + i * 10, l.t, l.c));
  }
}

function button(p: Painter<SkillHit>, s: SkillSource, b: 'minus' | 'plus', label: string, x: number, y: number, can: boolean): void {
  const hover = can && s.hoverBtn === b;
  buttonBox(p.g, x, y, 15, { hover });
  p.center(x, 15, y, label, hover ? SK.coin : SK.txt, 'koSmall', can ? 1 : 0.35);
  if (can) p.hit(x, y, 15, 12, { kind: 'btn', b });
}

/** 변형 카드 2장: 열린 스킬이면 포인트와 상관없이 고르기 (다시 누르면 해제) */
function variants(p: Painter<SkillHit>, s: SkillSource, id: string, mine: boolean): void {
  const g = p.g, n = s.node(id);
  p.text(X, 113, '변형', SK.key);
  p.text(X + koWidth('변형', 'koSmall') + 5, 113, n.open ? '하나 고르기' : '스킬이 열리면 고르기', n.open ? SK.dim : SK.off);
  n.variants.forEach((v, i) => {
    const cy = 124 + i * 30, on = n.variant === i, can = n.open && mine, hv = can && s.hoverBtn === `var${i}`;
    R(g, X - 2, cy, MW + 4, 28, on ? SK.coin : hv ? SK.key : SK.cardBd);
    R(g, X - 1, cy + 1, MW + 2, 26, on ? SK.pick : SK.title);
    const a = n.open ? 1 : 0.4;
    R(g, X + 2, cy + 4, 5, 5, on ? SK.coin : SK.key, a);
    R(g, X + 3, cy + 5, 3, 3, on ? SK.white : SK.title, a);
    p.text(X + 10, cy + 1, v.name, on ? SK.coin : SK.txt, 'koSmall', a);
    wrapKo(v.desc, MW - 8, 2, 'koSmall').forEach((l, j) => p.text(X + 3, cy + 10 + j * 8, l, SK.dim, 'koSmall', a));
    if (can) p.hit(X - 2, cy, MW + 4, 28, { kind: 'var', i });
  });
}
