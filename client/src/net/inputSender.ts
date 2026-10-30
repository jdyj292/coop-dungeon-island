// 키 입력 → 서버 메시지 (docs/network.md 2·4·7장): 이동은 바뀌면 즉시 + 움직이는 동안 20Hz, 누름은 바로 action·item
// 달리기는 클라이언트가 두 번 누르기로 판정해 run으로 보낸다 (서버는 간격을 다시 재지 않음)
// 대검 충전: 보낸 스킬 키를 떼면 chargeRelease (서버는 스킬을 받은 뒤 이 메시지까지 누르고 있다고 본다, charge.ts)
// 안 될 행동(쿨타임·MP·피격 중)은 보내지 않는다 (예측 상태로 미리 검사)
import { canDodge, canQuickRise, NET, newRunState, skillReady, stepRun, type ActionDef, type PlayerState, type PotionKind } from '@game/shared';
import type { Connection } from './connection';

export interface KeyInput {
  x: number;
  y: number;
  attack: boolean;
  skill: ActionDef | null;
  backstep: boolean;
  potion: PotionKind | null;
  /** 마지막에 누른 스킬 키를 아직 누르고 있음 (대검 충전) */
  hold: boolean;
}

/** 이번 프레임에 보낸 결과: 예측에 넣을 입력과 seq */
export interface Sent {
  x: number;
  y: number;
  run: boolean;
  press: Pick<KeyInput, 'attack' | 'skill' | 'backstep' | 'potion'>;
  /** 서버가 보는 스킬 키 누름 (스킬을 보낸 뒤 chargeRelease 전까지) */
  hold: boolean;
  /** 지금까지 보낸 마지막 seq */
  seq: number;
  /** 이번 프레임에 보낸 행동·아이템 메시지 seq (없으면 null) */
  actionSeq: number | null;
}

export class InputSender {
  private run = newRunState();
  private last = { mx: 0, my: 0, run: false };
  private sinceSend = 0;
  private lastSeq = 0;
  /** 스킬을 보냈고 아직 chargeRelease를 안 보냄 */
  private holding = false;

  /** 던전·섬 연결 공용 (시계·보내기·번호만 씀) */
  constructor(private conn: Pick<Connection, 'clock' | 'send' | 'nextSeq'>) {}

  /** 프레임마다. dt = 실제 경과 초, me = 내 예측 상태 (없으면 검사 없이 보냄) */
  update(k: KeyInput, dt: number, me: PlayerState | null): Sent {
    const c = this.conn, t = c.clock.serverNow();
    const mx = Math.sign(k.x) as -1 | 0 | 1, my = Math.sign(k.y) as -1 | 0 | 1;
    const running = stepRun(this.run, mx, my, dt);
    const changed = mx !== this.last.mx || my !== this.last.my || running !== this.last.run;
    this.sinceSend += dt * 1000;
    if (changed || ((mx || my) && this.sinceSend >= 1000 / NET.inputRate)) {
      c.send('input', { seq: (this.lastSeq = c.nextSeq()), t, mx, my, run: running });
      this.last = { mx, my, run: running };
      this.sinceSend = 0;
    }
    const free = !me || (!me.hurt && !me.downed);
    const press = {
      attack: k.attack && free,
      skill: k.skill && free && (!me || skillReady(me, k.skill)) ? k.skill : null,
      backstep: k.backstep && (free ? !me || canDodge(me) : canQuickRise(me!)),
      potion: k.potion && (!me || (me.potions[k.potion] > 0 && me.potionCd[k.potion] <= 0)) ? k.potion : null,
    };
    const at = { x: Math.round(me?.pos.x ?? 0), y: Math.round(me?.pos.y ?? 0), facing: (me?.facing ?? 1) < 0 ? (-1 as const) : (1 as const) };
    let actionSeq: number | null = null;
    const action = (kind: 'basic' | 'dash' | 'skill' | 'backstep' | 'chargeRelease', skillId?: string) => {
      actionSeq = this.lastSeq = c.nextSeq();
      c.send('action', { seq: actionSeq, t, kind, ...(skillId ? { skillId } : {}), ...at });
    };
    if (press.attack) action(running && mx ? 'dash' : 'basic');
    if (this.holding && !k.hold) {
      action('chargeRelease');
      this.holding = false;
    }
    if (press.skill) {
      action('skill', press.skill.id);
      this.holding = true;
    }
    if (press.backstep) action('backstep');
    if (press.potion) {
      actionSeq = this.lastSeq = c.nextSeq();
      c.send('item', { seq: actionSeq, t, slot: press.potion });
    }
    return { x: mx, y: my, run: running, press, hold: this.holding, seq: this.lastSeq, actionSeq };
  }
}
