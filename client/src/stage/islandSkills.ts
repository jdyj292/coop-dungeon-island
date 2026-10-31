// 스킬 창 (K, hud.md 8장, skills.md 1장): 무기 탭마다 맨 위 계열 줄 2개(A·B, Enter = 고르기), 공용 패시브, 기본 스킬, 고른 계열의 액티브·보조.
// 스킬·패시브는 숙련도 레벨에 열림 (안 열렸으면 이름 뒤 "(Lv N)"). 줄 = 스킬(장착한 슬롯 키·포인트 N/3) 다음에 그 변형 2개.
// 스킬 줄 ←→ = 포인트 (액티브는 열리면 1부터, 패시브는 0부터), Enter·장착 버튼 = 다음 슬롯(U→I→O→P)에 장착, 변형 줄 Enter = 고르기, 초기화 버튼.
// 임시 목록 창 (SK-6 2차에서 트리형 창으로 바뀜, 승인 데모 skill_window.html). 검사·저장은 서버 (islandShop skill), 값은 islandNet.skills
import {
  branchOf, buildFrom, COMBAT, isOpen, maxPointsOf, MVP_WEAPONS, nodeOf, PASSIVES, pointsAt, SKILLS, SLOT_COUNT, treeNodes, unlockLevelOf,
  weaponDef, BRANCHES, type Branch, type S2C, type SkillBuild,
} from '@game/shared';
import type { IslandConnection } from '../net/islandNet';
import { wrapKo } from '../ui/koText';
import { PANEL, type DetailLine, type PanelButton, type PanelRow } from '../ui/listPanel';

const TREE = COMBAT.skillTree;
/** 아래 줄 알림 시간 */
const NOTE_MS = 2000;
const SLOT_KEYS = ['U', 'I', 'O', 'P'] as const;
const ORDER = ['common', 'base', 'A', 'B'];
const FAIL_TEXT: Record<NonNullable<S2C['skills']['fail']>, string> = {
  skill: '이 무기 스킬이 아닙니다', points: `포인트는 최대 ${TREE.maxPoints}`, variant: '없는 변형입니다',
  sp: 'SP가 모자랍니다', locked: '아직 레벨이 모자랍니다', branch: '선택한 계열 스킬만 됩니다', slot: '없는 슬롯입니다', busy: '출발 카운트다운 중에는 못 바꿉니다',
};

type Line = { branch: Branch } | { skill: string; variant?: string };

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

  private level(weapon: string): number {
    return this.mine(weapon)?.level ?? 1;
  }

  private branch(weapon: string): Branch {
    return this.mine(weapon)?.branch ?? 'A';
  }

  private points(weapon: string, skill: string): number {
    return pointsAt(this.build(weapon), skill, this.level(weapon));
  }

  /** 계열 줄 A·B, 공용 패시브, 기본 스킬(변형), 고른 계열의 액티브(변형)·보조 */
  private lines(weapon: string): Line[] {
    const br = this.branch(weapon), order = (id: string) => ORDER.indexOf(branchOf(id));
    const nodes = treeNodes(weaponDef(weapon)).filter((id) => [br, 'base', 'common'].includes(branchOf(id)))
      .map((skill, i) => ({ skill, i }))
      .sort((a, b) => order(a.skill) - order(b.skill) || Number(!!PASSIVES[a.skill]) - Number(!!PASSIVES[b.skill]) || a.i - b.i);
    return [
      ...(weaponDef(weapon).branches ? BRANCHES.map((branch) => ({ branch })) : []),
      ...nodes.flatMap(({ skill }) => [{ skill }, ...Object.keys(SKILLS[skill]?.variants ?? {}).map((variant) => ({ skill, variant }))]),
    ];
  }

  private slotOf(weapon: string, skill: string): number {
    return this.mine(weapon)?.slots.indexOf(skill) ?? -1;
  }

  rows(weapon: string): PanelRow[] {
    const lv = this.level(weapon), names = weaponDef(weapon).branches;
    return this.lines(weapon).map((l) => {
      if ('branch' in l) {
        const on = this.branch(weapon) === l.branch;
        return { label: `계열 ${l.branch} ${names?.[l.branch].name ?? ''}${on ? ' (선택)' : ''}`, dim: !on };
      }
      const { skill, variant } = l, p = this.points(weapon, skill), shut = isOpen(skill, lv) ? '' : ` (Lv ${unlockLevelOf(skill)})`;
      const pv = PASSIVES[skill];
      if (pv) return { label: `${pv.branch === 'common' ? '공용' : '보조'} ${pv.name}${shut}`, right: `${p}/${maxPointsOf(skill)}`, dim: p === 0 };
      const s = SKILLS[skill]!;
      if (!variant) {
        // 앞 글자 = 장착한 슬롯 키 (장착 안 했으면 -) (오른쪽 칸은 도트 숫자 글꼴이라 한글 없음)
        const slot = this.slotOf(weapon, skill), key = slot >= 0 ? SLOT_KEYS[slot] : '-';
        return { label: `${key} ${s.name}${shut}`, right: `${p}/${TREE.maxPoints}`, dim: p === 0 };
      }
      const name = s.variants?.[variant]?.name ?? variant;
      return { label: `· ${name}${nodeOf(this.build(weapon), skill).variant === variant ? ' (선택)' : ''}`, dim: p === 0 };
    });
  }

  /** 고른 줄 설명 (패널 아래 상자): 계열 = 특징, 스킬 = 기본 효과, 패시브 = 지금 포인트 효과, 변형 = 무엇이 바뀌는지. 잠김은 첫 줄에 */
  detail(weapon: string, sel: number): string | DetailLine[] {
    const l = this.lines(weapon)[sel];
    if (!l) return '';
    if ('branch' in l) return weaponDef(weapon).branches?.[l.branch].desc ?? '';
    const s = SKILLS[l.skill], pv = PASSIVES[l.skill], p = this.points(weapon, l.skill);
    const desc = pv ? `${pv.desc.replace('\n', ' ')}${p ? ` (${pv.pointDesc[p - 1]})` : ''}` : l.variant ? (s?.variants?.[l.variant]?.desc ?? '') : (s?.desc ?? '');
    if (isOpen(l.skill, this.level(weapon))) return desc;
    return [{ text: `Lv ${unlockLevelOf(l.skill)}에 열림 (지금 Lv ${this.level(weapon)})` }, ...wrapKo(desc, PANEL.w - 2 * PANEL.pad, 1).map((text) => ({ text, dim: true }))];
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
    const l = this.lines(weapon)[sel], m = this.mine(weapon), reset = { id: 'skillReset', label: '초기화', disabled: locked || !m?.spent };
    if (!l) return [reset];
    if ('branch' in l) return [{ id: 'variant', label: '고르기', disabled: locked || this.branch(weapon) === l.branch }, reset];
    const p = this.points(weapon, l.skill), open = isOpen(l.skill, this.level(weapon));
    if (l.variant) {
      const chosen = nodeOf(this.build(weapon), l.skill).variant === l.variant;
      return [{ id: 'variant', label: chosen ? '선택 해제' : '고르기', disabled: locked || !open }, reset];
    }
    return [
      { id: 'minus', label: '-', disabled: locked || p <= (SKILLS[l.skill] ? 1 : 0) },
      { id: 'plus', label: '+', disabled: locked || !open || p >= maxPointsOf(l.skill) || !m || m.spent >= m.sp },
      // 패시브는 슬롯에 들어가지 않는다
      ...(SKILLS[l.skill] ? [{ id: 'equip', label: '장착', disabled: locked || !open }] : []),
      reset,
    ];
  }

  /** minus·plus·equip·variant·skillReset (계열 줄 Enter(variant) = 계열 고르기, 스킬 줄 Enter(variant) = 장착, 변형 줄 ←→는 무시) */
  act(id: string, weapon: string, sel: number, locked: boolean): void {
    const l = this.lines(weapon)[sel];
    if (locked || !l || !(MVP_WEAPONS as readonly string[]).includes(weapon)) return;
    const w = weapon as (typeof MVP_WEAPONS)[number];
    if (id === 'skillReset') return this.conn.send('skill', { weapon: w, op: 'reset' });
    if ('branch' in l) {
      if (id === 'variant' && this.branch(weapon) !== l.branch) this.conn.send('skill', { weapon: w, op: 'branch', branch: l.branch });
      return;
    }
    const p = this.points(weapon, l.skill), n = nodeOf(this.build(weapon), l.skill);
    if (!isOpen(l.skill, this.level(weapon))) return;
    if (l.variant) {
      if (id !== 'variant') return;
      const variant = n.variant === l.variant ? undefined : l.variant;
      return this.conn.send('skill', { weapon: w, op: 'set', skillId: l.skill, points: p, ...(variant ? { variant } : {}) });
    }
    if (id === 'equip' || id === 'variant') {
      if (!SKILLS[l.skill]) return;
      // 장착돼 있으면 다음 칸, 아니면 첫 빈칸(없으면 U)
      const slots = this.mine(weapon)?.slots ?? [], cur = slots.indexOf(l.skill);
      const slot = cur >= 0 ? (cur + 1) % SLOT_COUNT : Math.max(0, slots.indexOf(''));
      return this.conn.send('skill', { weapon: w, op: 'equip', skillId: l.skill, slot });
    }
    const points = id === 'plus' ? p + 1 : id === 'minus' ? p - 1 : p;
    if (points === p || points < (SKILLS[l.skill] ? 1 : 0) || points > maxPointsOf(l.skill)) return;
    this.conn.send('skill', { weapon: w, op: 'set', skillId: l.skill, points, ...(n.variant ? { variant: n.variant } : {}) });
  }

  private say(text: string): void {
    this.note = text;
    this.noteUntil = Date.now() + NOTE_MS;
  }
}
