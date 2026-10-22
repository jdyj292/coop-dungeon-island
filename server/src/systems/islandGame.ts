// 섬 진행 (Colyseus 없이 테스트 가능, docs/network.md 3·5장): 주민 접속·이동. 장식·상점·우물은 4-6~4-8
// 60Hz로 각 주민의 마지막 입력을 적용하고 상태(정수 위치)에 반영. 상태는 20Hz로 전송 (IslandRoom)
import { islandBounds, NET, newWalker, parseC2S, spawnPos, stepWalker, TICK, type WalkInput, type Walker } from '@game/shared';
import { IslandState, Resident } from '../schema/IslandState';
import { RateLimit } from './rateLimit';

export interface ResidentInfo {
  id: string;
  name: string;
  color: number;
}

export interface IslandOut {
  send: (id: string, type: string, msg: unknown) => void;
}

interface Live {
  walker: Walker;
  input: WalkInput & { seq: number };
  limit: RateLimit;
}

const islandRules = (): Record<string, readonly [number, number]> => ({ input: [1000, NET.limits.input], ping: [1000, NET.limits.input] });

export class IslandGame {
  readonly state = new IslandState();
  private live = new Map<string, Live>();
  private bounds = islandBounds();
  /** 방 생성부터의 서버 시각 ms */
  now = 0;

  constructor(name: string, treasury: number, residents: ResidentInfo[], private out: IslandOut) {
    this.state.name = name;
    this.state.treasury = treasury;
    for (const r of residents) this.addResident(r);
  }

  /** 주민 목록에 (새로 가입한 주민 포함) */
  addResident(info: ResidentInfo): void {
    if (this.state.residents.has(info.id)) return;
    const r = new Resident();
    Object.assign(r, { id: info.id, name: info.name, color: info.color });
    this.state.residents.set(info.id, r);
  }

  /** 섬에 들어옴: 우물 앞 빈자리에 (접속한 사람 수로 옆으로) */
  join(id: string): void {
    const r = this.state.residents.get(id);
    if (!r) return;
    const pos = spawnPos(this.live.size);
    this.live.set(id, { walker: newWalker(pos), input: { mx: 0, my: 0, run: false, seq: 0 }, limit: new RateLimit(islandRules()) });
    Object.assign(r, { online: true, status: 'island', x: Math.round(pos.x), y: Math.round(pos.y), facing: 1, state: 'idle', lastInputSeq: 0 });
  }

  leave(id: string): void {
    this.live.delete(id);
    const r = this.state.residents.get(id);
    if (r) Object.assign(r, { online: false, status: 'away', state: 'idle' });
  }

  /** 메시지. 제한을 계속 넘기면 'kick' */
  onMessage(id: string, type: string, raw: unknown): 'kick' | void {
    const l = this.live.get(id);
    if (!l) return;
    if (!l.limit.allow(type, this.now)) return l.limit.shouldKick(this.now) ? 'kick' : undefined;
    if (type === 'input') {
      const m = parseC2S('input', raw);
      if (m && m.seq > l.input.seq) l.input = { mx: m.mx, my: m.my, run: m.run, seq: m.seq };
    } else if (type === 'ping') {
      const m = parseC2S('ping', raw);
      if (m) this.out.send(id, 'pong', { t: m.t, server: this.now });
    }
  }

  tick(): void {
    this.now += TICK * 1000;
    for (const [id, l] of this.live) {
      stepWalker(l.walker, l.input, TICK, this.bounds);
      const r = this.state.residents.get(id)!, w = l.walker;
      r.x = Math.round(w.pos.x);
      r.y = Math.round(w.pos.y);
      r.facing = w.facing;
      r.state = !w.moving ? 'idle' : w.run.running ? 'run' : 'walk';
      r.lastInputSeq = l.input.seq;
    }
    this.state.serverTime = this.now;
  }

  /** 테스트·디버그용 실제 위치 */
  walkerOf(id: string): Walker | undefined {
    return this.live.get(id)?.walker;
  }
}
