// 가방 스킬 탭 (hud.md 8장, skills.md 1장): 장착한 무기의 기본 스킬 2개. 줄 = 스킬(포인트 N/3) 다음에 그 변형 2개
// 스킬 줄 ←→ = 포인트 내리기·올리기, 변형 줄 Enter = 고르기(3포인트일 때), 초기화 버튼. 검사·저장은 서버 (islandShop skill), 값은 islandNet.skills
import { buildFrom, COMBAT, MVP_WEAPONS, nodeOf, SKILLS, weaponDef, type S2C, type SkillNode } from '@game/shared';
import type { IslandConnection } from '../net/islandNet';
import type { PanelButton, PanelRow } from '../ui/listPanel';

const TREE = COMBAT.skillTree;
/** 아래 줄 알림 시간 */
const NOTE_MS = 2000;
const FAIL_TEXT: Record<NonNullable<S2C['skills']['fail']>, string> = {
  skill: '이 무기 스킬이 아닙니다', points: `포인트는 1~${TREE.maxPoints}`, variant: `변형은 ${TREE.variantAt}포인트부터`,
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

  private lines(weapon: string): Line[] {
    return weaponDef(weapon).baseSkills.flatMap((skill) => [{ skill }, ...Object.keys(SKILLS[skill]?.variants ?? {}).map((variant) => ({ skill, variant }))]);
  }

  rows(weapon: string): PanelRow[] {
    return this.lines(weapon).map(({ skill, variant }) => {
      const n = this.node(weapon, skill), s = SKILLS[skill]!;
      if (!variant) return { label: s.name, right: `${n.points}/${TREE.maxPoints}` };
      const name = s.variants?.[variant]?.name ?? variant;
      return { label: `· ${name}${n.variant === variant ? ' (선택)' : ''}`, dim: n.points < TREE.variantAt };
    });
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
      return [
        { id: 'minus', label: '-', disabled: locked || !l || n <= 1 },
        { id: 'plus', label: '+', disabled: locked || !l || n >= TREE.maxPoints || !m || m.spent >= m.sp },
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
    if (points === n.points || points < 1 || points > TREE.maxPoints) return;
    // 변형 조건 아래로 내리면 고른 변형도 지운다
    const variant = points >= TREE.variantAt ? n.variant : undefined;
    this.conn.send('skill', { weapon: w, op: 'set', skillId: l.skill, points, ...(variant ? { variant } : {}) });
  }

  private say(text: string): void {
    this.note = text;
    this.noteUntil = Date.now() + NOTE_MS;
  }
}
