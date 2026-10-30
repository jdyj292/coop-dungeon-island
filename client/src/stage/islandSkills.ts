// 스킬 창 (K, hud.md 8장, skills.md 1장): 무기 탭마다 그 무기의 기본 스킬 2개(U I)와 A·B 계열 1단계 액티브(O P, 계열마다 택1),
// 계열마다 액티브 뒤에 보조 노드 2개(1포인트, 택1, "보조 이름 0/1").
// 줄 = 스킬(슬롯 키·포인트 N/3) 다음에 그 변형 2개. 스킬 줄 ←→ = 포인트 내리기·올리기 (계열 스킬은 0 = 안 배움, 배우면 같은 키의 다른 스킬은 지워짐),
// 변형 줄 Enter = 고르기(3포인트일 때), 초기화 버튼. 검사·저장은 서버 (islandShop skill), 값은 islandNet.skills
import { buildFrom, COMBAT, maxPointsOf, minPoints, MVP_WEAPONS, nodeOf, PASSIVES, rivalsOf, SKILLS, treeNodes, weaponDef, type S2C, type SkillNode } from '@game/shared';
import type { IslandConnection } from '../net/islandNet';
import type { PanelButton, PanelRow } from '../ui/listPanel';

const TREE = COMBAT.skillTree;
/** 아래 줄 알림 시간 */
const NOTE_MS = 2000;
/** 스킬 줄 앞 슬롯 키: 기본 스킬은 순서대로 U I, 계열은 A = O, B = P */
const SLOT_KEY: Record<string, string> = { A: 'O', B: 'P' };
const BRANCH_ORDER = ['base', 'A', 'B'];
const FAIL_TEXT: Record<NonNullable<S2C['skills']['fail']>, string> = {
  skill: '이 무기 스킬이 아닙니다', points: `포인트는 최대 ${TREE.maxPoints}`, variant: `변형은 ${TREE.variantAt}포인트부터`,
  sp: 'SP가 모자랍니다', busy: '출발 카운트다운 중에는 못 바꿉니다',
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

  private node(weapon: string, skill: string): SkillNode {
    return nodeOf(buildFrom(this.mine(weapon)?.build ?? ''), skill);
  }

  /** 기본 스킬, A 계열(액티브·변형 뒤 보조), B 계열 순 */
  private lines(weapon: string): Line[] {
    const order = (id: string) => BRANCH_ORDER.indexOf(SKILLS[id]?.branch ?? PASSIVES[id]?.branch ?? 'B');
    return treeNodes(weaponDef(weapon))
      .map((skill, i) => ({ skill, i }))
      .sort((a, b) => order(a.skill) - order(b.skill) || a.i - b.i)
      .flatMap(({ skill }) => [{ skill }, ...Object.keys(SKILLS[skill]?.variants ?? {}).map((variant) => ({ skill, variant }))]);
  }

  private key(weapon: string, skill: string): string {
    const s = SKILLS[skill]!;
    return s.branch === 'base' ? (['U', 'I'][weaponDef(weapon).baseSkills.indexOf(skill)] ?? '') : (SLOT_KEY[s.branch] ?? '');
  }

  rows(weapon: string): PanelRow[] {
    return this.lines(weapon).map(({ skill, variant }) => {
      const n = this.node(weapon, skill), pv = PASSIVES[skill];
      if (pv) return { label: `보조 ${pv.name}`, right: `${n.points}/1`, dim: n.points === 0 };
      const s = SKILLS[skill]!;
      // 안 배운 계열 스킬은 흐리게
      if (!variant) return { label: `${this.key(weapon, skill)} ${s.name}`, right: `${n.points}/${TREE.maxPoints}`, dim: n.points === 0 };
      const name = s.variants?.[variant]?.name ?? variant;
      return { label: `· ${name}${n.variant === variant ? ' (선택)' : ''}`, dim: n.points < TREE.variantAt };
    });
  }

  /** 고른 줄 설명 (패널 아래 상자): 스킬 = 기본 효과, 변형 = 무엇이 바뀌는지 */
  detail(weapon: string, sel: number): string {
    const l = this.lines(weapon)[sel], s = l && SKILLS[l.skill];
    if (l && PASSIVES[l.skill]) return PASSIVES[l.skill]!.desc;
    if (!s) return '';
    return l.variant ? (s.variants?.[l.variant]?.desc ?? '') : s.desc;
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
    return `SP ${m ? m.sp - m.spent : 0}/${m?.sp ?? 0} · ←→ 포인트`;
  }

  buttons(weapon: string, sel: number, locked: boolean): PanelButton[] {
    const l = this.lines(weapon)[sel], m = this.mine(weapon);
    if (!l?.variant) {
      const n = l ? this.node(weapon, l.skill).points : 0;
      // 같은 키의 다른 스킬에서 옮겨 배우기는 SP가 모자라도 된다 (포인트가 옮겨감)
      const swap = !!l && n === 0 && rivalsOf(weaponDef(weapon), l.skill).some((r) => this.node(weapon, r).points > 0);
      return [
        { id: 'minus', label: '-', disabled: locked || !l || n <= minPoints(l.skill) },
        { id: 'plus', label: '+', disabled: locked || !l || n >= maxPointsOf(l.skill) || !m || (m.spent >= m.sp && !swap) },
        { id: 'skillReset', label: '초기화', disabled: locked || !m?.spent },
      ];
    }
    const n = this.node(weapon, l.skill);
    return [
      { id: 'variant', label: n.variant === l.variant ? '선택 해제' : '고르기', disabled: locked || n.points < TREE.variantAt },
      { id: 'skillReset', label: '초기화', disabled: locked || !m?.spent },
    ];
  }

  /** minus·plus·variant·skillReset (변형 줄에서 ←→는 무시) */
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
