// 키 입력 → 서버 메시지 (docs/network.md 2·4장): 이동은 바뀌면 즉시 + 움직이는 동안 20Hz, 누름은 바로 action·item
// 달리기는 클라이언트가 두 번 누르기로 판정해 run으로 보낸다 (서버는 간격을 다시 재지 않음)
import { NET, newRunState, stepRun, type ActionDef, type PotionKind } from '@game/shared';
import type { Connection } from './connection';

export interface KeyInput {
  x: number;
  y: number;
  attack: boolean;
  skill: ActionDef | null;
  backstep: boolean;
  potion: PotionKind | null;
}

export class InputSender {
  private run = newRunState();
  private last = { mx: 0, my: 0, run: false };
  private sinceSend = 0;

  constructor(private conn: Connection) {}

  /** 프레임마다. dt = 실제 경과 초, me = 지금 보이는 내 위치·방향 (action에 담는다) */
  update(k: KeyInput, dt: number, me: { x: number; y: number; facing: number } | undefined): void {
    const c = this.conn, t = c.clock.serverNow();
    const mx = Math.sign(k.x) as -1 | 0 | 1, my = Math.sign(k.y) as -1 | 0 | 1;
    const running = stepRun(this.run, mx, dt);
    const changed = mx !== this.last.mx || my !== this.last.my || running !== this.last.run;
    this.sinceSend += dt * 1000;
    const moving = mx !== 0 || my !== 0;
    if (changed || (moving && this.sinceSend >= 1000 / NET.inputRate)) {
      c.send('input', { seq: c.nextSeq(), t, mx, my, run: running });
      this.last = { mx, my, run: running };
      this.sinceSend = 0;
    }
    const at = { x: me?.x ?? 0, y: me?.y ?? 0, facing: (me?.facing ?? 1) < 0 ? (-1 as const) : (1 as const) };
    if (k.attack) c.send('action', { seq: c.nextSeq(), t, kind: running ? 'dash' : 'basic', ...at });
    if (k.skill) c.send('action', { seq: c.nextSeq(), t, kind: 'skill', skillId: k.skill.id, ...at });
    if (k.backstep) c.send('action', { seq: c.nextSeq(), t, kind: 'backstep', ...at });
    if (k.potion) c.send('item', { seq: c.nextSeq(), t, slot: k.potion });
  }
}
