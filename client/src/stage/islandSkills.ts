// 스킬 창 (K, hud.md 8장, skills.md 1장): 무기 탭마다 기본 스킬 2개, 계열(A·B)마다 1단계 액티브(택1)·보조(택1), 2단계 액티브(택1).
// 2단계는 같은 계열 1단계에 3포인트를 쓰면 열림 (안 열렸으면 "잠김"). 줄 = 스킬(장착한 슬롯 키·포인트 N/3) 다음에 그 변형 2개.
// 스킬 줄 ←→ = 포인트 내리기·올리기 (계열 스킬은 0 = 안 배움, 배우면 같은 단계 다른 스킬은 지워짐), Enter·장착 버튼 = 다음 슬롯(U→I→O→P)에 장착,
// 변형 줄 Enter = 고르기(3포인트일 때), 초기화 버튼. 1단계를 내려 2단계가 지워지면 설명 상자에 먼저 경고.
// 검사·저장은 서버 (islandShop skill), 값은 islandNet.skills
import {
  branchPoints, buildFrom, COMBAT, isUnlocked, maxPointsOf, minPoints, MVP_WEAPONS, nodeOf, PASSIVES, prunedBy, rivalsOf, SKILLS, SLOT_COUNT, slotSkills, tierOf,
  treeNodes, weaponDef, type S2C, type SkillBuild, type SkillNode,
} from '@game/shared';
import type { IslandConnection } from '../net/islandNet';
import { wrapKo } from '../ui/koText';
import { PANEL, type DetailLine, type PanelButton, type PanelRow } from '../ui/listPanel';

const TREE = COMBAT.skillTree;
/** 아래 줄 알림 시간 */
const NOTE_MS = 2000;
const SLOT_KEYS = ['U', 'I', 'O', 'P'] as const;
const BRANCH_ORDER = ['base', 'A', 'B'];
const FAIL_TEXT: Record<NonNullable<S2C['skills']['fail']>, string> = {
  skill: '이 무기 스킬이 아닙니다', points: `포인트는 최대 ${TREE.maxPoints}`, variant: `변형은 ${TREE.variantAt}포인트부터`,
  sp: 'SP가 모자랍니다', locked: '아직 잠긴 단계입니다', slot: '없는 슬롯입니다', busy: '출발 카운트다운 중에는 못 바꿉니다',
};

interface Line {
  skill: string;
  variant?: string;
}

export class SkillsTab {
  private note = '';
  private noteUntil = 0;
  private seenSeq = 0;

  constructor(private conn: IslandConnection) {}

  private mine(weapon: string) {
    return this.conn.skills.weapons.find((w) => w.weapon === weapon);
  }

  private build(weapon: string): SkillBuild {
    return buildFrom(this.mine(weapon)?.build ?? '');
  }

  private node(weapon: string, skill: string): SkillNode {
    return nodeOf(this.build(weapon), skill);
  }

  /** 기본 스킬, A 계열(1단계 액티브·변형, 보조, 2단계 액티브·변형), B 계열 순 */
  private lines(weapon: string): Line[] {
    const order = (id: string) => BRANCH_ORDER.indexOf(SKILLS[id]?.branch ?? PASSIVES[id]?.branch ?? 'B');
    return treeNodes(weaponDef(weapon))
      .map((skill, i) => ({ skill, i }))
      .sort((a, b) => order(a.skill) - order(b.skill) || tierOf(a.skill) - tierOf(b.skill) || a.i - b.i)
      .flatMap(({ skill }) => [{ skill }, ...Object.keys(SKILLS[skill]?.variants ?? {}).map((variant) => ({ skill, variant }))]);
  }

  /** 장착한 슬롯 (없으면 -1) */
  private slotOf(weapon: string, skill: string): number {
    return slotSkills(weaponDef(weapon), this.build(weapon)).indexOf(skill);
  }

  private locked(weapon: string, skill: string): boolean {
    return !isUnlocked(weaponDef(weapon), this.build(weapon), skill);
  }

  rows(weapon: string): PanelRow[] {
    return this.lines(weapon).map(({ skill, variant }) => {
      const n = this.node(weapon, skill), pv = PASSIVES[skill];
      if (pv) return { label: `보조 ${pv.name}`, right: `${n.points}/1`, dim: n.points === 0 };
      const s = SKILLS[skill]!;
      if (!variant) {
        // 앞 글자 = 장착한 슬롯 키 (장착 안 했으면 -), 안 배운 계열 스킬은 흐리게, 안 열린 단계는 이름 뒤 "(잠김)" (오른쪽 칸은 도트 숫자 글꼴이라 한글 없음)
        const slot = this.slotOf(weapon, skill), key = slot >= 0 ? SLOT_KEYS[slot] : '-';
        const shut = n.points === 0 && this.locked(weapon, skill) ? ' (잠김)' : '';
        return { label: `${key} ${s.name}${shut}`, right: `${n.points}/${TREE.maxPoints}`, dim: n.points === 0 };
      }
      const name = s.variants?.[variant]?.name ?? variant;
      return { label: `· ${name}${n.variant === variant ? ' (선택)' : ''}`, dim: n.points < TREE.variantAt };
    });
  }

  /** 고른 줄 설명 (패널 아래 상자): 스킬 = 기본 효과, 변형 = 무엇이 바뀌는지. 잠김·지워질 위 단계는 첫 줄에 */
  detail(weapon: string, sel: number): string | DetailLine[] {
    const l = this.lines(weapon)[sel], s = l && SKILLS[l.skill];
    if (!l) return '';
    const desc = PASSIVES[l.skill]?.desc ?? (l.variant ? (s?.variants?.[l.variant]?.desc ?? '') : (s?.desc ?? ''));
    const head = l.variant ? null : this.warning(weapon, l.skill);
    if (!head) return desc;
    return [{ text: head }, ...wrapKo(desc, PANEL.w - 2 * PANEL.pad, 1).map((text) => ({ text, dim: true }))];
  }

  /** 잠김 사유, 또는 -(배운 스킬)·+(택1 옮겨 배우기)로 함께 지워질 위 단계 */
  private warning(weapon: string, skill: string): string | null {
    const w = weaponDef(weapon), b = this.build(weapon), n = nodeOf(b, skill), meta = SKILLS[skill] ?? PASSIVES[skill];
    if (!meta) return null;
    if (n.points === 0 && meta.branch !== 'base' && this.locked(weapon, skill)) {
      const t = tierOf(skill), need = TREE.tierPoints[t - 1] ?? 0;
      return `잠김: ${meta.branch} 계열 ${t - 1}단계에 ${need}포인트 (지금 ${branchPoints(w, b, meta.branch, t)})`;
    }
    const swap = n.points === 0 && rivalsOf(w, skill).some((r) => nodeOf(b, r).points > 0);
    const lose = n.points > minPoints(skill) ? prunedBy(w, b, skill, { points: n.points - 1, ...(n.points - 1 >= TREE.variantAt && n.variant ? { variant: n.variant } : {}) })
      : swap ? prunedBy(w, b, skill, { points: 1 }) : [];
    if (!lose.length) return null;
    const names = lose.map((id) => SKILLS[id]?.name ?? PASSIVES[id]?.name ?? id).join(', ');
    return `${swap ? '+' : '-'} 하면 ${names} 지워짐 (SP 돌려받음)`;
  }

  footer(weapon: string, locked: boolean): string {
    // 서버가 거절했으면 잠깐 사유
    if (this.conn.skillsSeq !== this.seenSeq) {
      this.seenSeq = this.conn.skillsSeq;
      const fail = this.conn.skills.fail;
      if (fail) this.say(FAIL_TEXT[fail]);
    }
    if (Date.now() < this.noteUntil) return this.note;
    if (locked) return FAIL_TEXT.busy;
    const m = this.mine(weapon);
    // 스킬 줄은 버튼이 4개(- + 장착 초기화)라 SP만
    return `SP ${m ? m.sp - m.spent : 0}/${m?.sp ?? 0}`;
  }

  buttons(weapon: string, sel: number, locked: boolean): PanelButton[] {
    const l = this.lines(weapon)[sel], m = this.mine(weapon);
    if (!l?.variant) {
      const n = l ? this.node(weapon, l.skill).points : 0;
      // 같은 단계 다른 스킬에서 옮겨 배우기는 SP가 모자라도 된다 (포인트가 옮겨감)
      const swap = !!l && n === 0 && rivalsOf(weaponDef(weapon), l.skill).some((r) => this.node(weapon, r).points > 0);
      const shut = !!l && n === 0 && this.locked(weapon, l.skill);
      return [
        { id: 'minus', label: '-', disabled: locked || !l || n <= minPoints(l.skill) },
        { id: 'plus', label: '+', disabled: locked || !l || shut || n >= maxPointsOf(l.skill) || !m || (m.spent >= m.sp && !swap) },
        // 보조 노드는 슬롯에 들어가지 않는다
        ...(l && SKILLS[l.skill] ? [{ id: 'equip', label: '장착', disabled: locked || n === 0 }] : []),
        { id: 'skillReset', label: '초기화', disabled: locked || !m?.spent },
      ];
    }
    const n = this.node(weapon, l.skill);
    return [
      { id: 'variant', label: n.variant === l.variant ? '선택 해제' : '고르기', disabled: locked || n.points < TREE.variantAt },
      { id: 'skillReset', label: '초기화', disabled: locked || !m?.spent },
    ];
  }

  /** minus·plus·equip·variant·skillReset (변형 줄에서 ←→는 무시, 스킬 줄에서 Enter(variant) = 장착) */
  act(id: string, weapon: string, sel: number, locked: boolean): void {
    const l = this.lines(weapon)[sel];
    if (locked || !l || !(MVP_WEAPONS as readonly string[]).includes(weapon)) return;
    const w = weapon as (typeof MVP_WEAPONS)[number], n = this.node(weapon, l.skill);
    if (id === 'skillReset') return this.conn.send('skill', { weapon: w, op: 'reset' });
    if (l.variant) {
      if (id !== 'variant' || n.points < TREE.variantAt) return;
      const variant = n.variant === l.variant ? undefined : l.variant;
      return this.conn.send('skill', { weapon: w, op: 'set', skillId: l.skill, points: n.points, ...(variant ? { variant } : {}) });
    }
    if (id === 'equip' || id === 'variant') {
      if (!SKILLS[l.skill] || n.points === 0) return;
      // 장착돼 있으면 다음 칸, 아니면 첫 빈칸(없으면 U)
      const slots = slotSkills(weaponDef(weapon), this.build(weapon)), cur = slots.indexOf(l.skill);
      const slot = cur >= 0 ? (cur + 1) % SLOT_COUNT : Math.max(0, slots.indexOf(null));
      return this.conn.send('skill', { weapon: w, op: 'equip', skillId: l.skill, slot });
    }
    const points = id === 'plus' ? n.points + 1 : id === 'minus' ? n.points - 1 : n.points;
    if (points === n.points || points < minPoints(l.skill) || points > maxPointsOf(l.skill)) return;
    // 변형 조건 아래로 내리면 고른 변형도 지운다
    const variant = points >= TREE.variantAt ? n.variant : undefined;
    this.conn.send('skill', { weapon: w, op: 'set', skillId: l.skill, points, ...(variant ? { variant } : {}) });
  }

  private say(text: string): void {
    this.note = text;
    this.noteUntil = Date.now() + NOTE_MS;
  }
}
