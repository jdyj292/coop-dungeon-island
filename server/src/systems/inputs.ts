// 메시지 → 틱 입력 (docs/network.md 4·7장). 이동은 마지막 값 유지, 누름(행동·물약)은 다음 틱에 한 번
// 받을 때 검사해서 안 되는 행동은 거절 사유를 돌려준다 (클라이언트는 예측을 취소)
// 회피는 히트스톱으로 서버 캐릭터가 아직 후딜레이 전이면 보관했다가 후딜레이에 들어가는 틱에 실행 (network.md 4장)
import { canDodge, NET, PLAYER, skillDef, skillReady, type ActionDef, type C2SMessage, type PlayerInput, type PlayerState, type PotionKind, type S2C, type WeaponDef } from '@game/shared';

type Reason = S2C['rejected']['reason'];

export class InputQueue {
  private move = { x: 0, y: 0, run: false };
  private attack = false;
  private skill: ActionDef | null = null;
  private backstep = false;
  /** 보관 중인 회피: 행동 메시지 seq, 남은 초 */
  private dodgeWait: { seq: number; left: number } | null = null;
  private potion: PotionKind | null = null;
  /** 받은 입력 중 가장 큰 seq (다음 틱에 처리됨) */
  private seq = 0;

  onInput(m: C2SMessage<'input'>): void {
    if (m.seq < this.seq) return; // 늦게 온 옛 입력
    this.move = { x: m.mx, y: m.my, run: m.run };
    this.seq = m.seq;
  }

  /** 행동: 되면 null, 안 되면 거절 사유 */
  onAction(m: C2SMessage<'action'>, p: PlayerState, weapon: WeaponDef): Reason | null {
    this.seq = Math.max(this.seq, m.seq);
    if (p.downed || p.hurt) return 'state';
    switch (m.kind) {
      case 'basic':
      case 'dash':
        // 대시 공격 여부는 서버의 달리기 상태로 정한다
        this.attack = true;
        return null;
      case 'skill': {
        if (!m.skillId || !weapon.baseSkills.includes(m.skillId)) return 'state';
        const def = skillDef(m.skillId);
        if ((p.cooldowns[def.id] ?? 0) > 0) return 'cooldown';
        if (!skillReady(p, def)) return 'mp';
        this.skill = def;
        return null;
      }
      case 'backstep':
        if (p.backstepCd > 0) return 'cooldown';
        if (p.stamina < PLAYER.stamina.dodge) return 'stamina';
        if (canDodge(p)) this.backstep = true;
        else if (!this.dodgeWait) this.dodgeWait = { seq: m.seq, left: NET.dodgeBufferMs / 1000 };
        else return 'state';
        return null;
      default:
        // 필살기·충전은 MVP 이후
        return 'state';
    }
  }

  onItem(m: C2SMessage<'item'>, p: PlayerState): Reason | null {
    this.seq = Math.max(this.seq, m.seq);
    if (p.potions[m.slot] <= 0 || p.potionCd[m.slot] > 0) return 'cooldown';
    if (p.downed || p.hurt?.kind === 'down') return 'state';
    this.potion = m.slot;
    return null;
  }

  /** 이번 틱 입력과 처리한 seq. 누름은 비운다 (보관한 회피는 시작될 때까지 계속 누름, seq도 그 앞까지만) */
  take(): { input: PlayerInput; seq: number } {
    const input: PlayerInput = {
      x: this.move.x, y: this.move.y, run: this.move.run,
      attack: this.attack, skill: this.skill, backstep: this.backstep || !!this.dodgeWait, potion: this.potion,
    };
    this.attack = this.backstep = false;
    this.skill = null;
    this.potion = null;
    return { input, seq: this.dodgeWait ? Math.min(this.seq, this.dodgeWait.seq - 1) : this.seq };
  }

  /** 틱 뒤: 보관한 회피가 시작됐으면 비우고, 맞았거나 시간이 다 됐으면 비우고 거절할 seq를 돌려준다 */
  settleDodge(p: PlayerState, dt: number): number | null {
    const w = this.dodgeWait;
    if (!w) return null;
    if (p.backstep) {
      this.dodgeWait = null;
      return null;
    }
    w.left -= dt;
    if (!p.hurt && !p.downed && w.left > 0) return null;
    this.dodgeWait = null;
    return w.seq;
  }
}
