// 내 캐릭터 (온라인): 키 입력 보내기 + 1/60초 예측 + 서버 패치마다 보정 (docs/network.md 7장, predict.ts)
import { FixedStep, PLAYER, TICK, weaponDef, zoneSpeedMul, type Bounds, type ZoneArea } from '@game/shared';
import type { Connection } from './connection';
import { InputSender, type KeyInput } from './inputSender';
import { mirrorPlayer } from './mirror';
import { Predictor, type Correction } from './predict';

export class LocalPlayer {
  /** 내 첫 상태가 오면 만든다 */
  predictor: Predictor | null = null;
  /** 마지막 보정과 누적 (개발 확인용, 지연 시뮬레이터 패널) */
  lastCorrection: { mode: Correction; error: number } = { mode: 'none', error: 0 };
  corrections = { ignore: 0, smooth: 0, snap: 0, maxError: 0 };
  private sender: InputSender;
  private ticks = new FixedStep();
  /** 틱이 돌기 전에 보낸 누름을 다음 틱까지 보관 */
  private press: { input: Pick<KeyInput, 'attack' | 'skill' | 'backstep' | 'potion'>; seq: number | null } | null = null;

  constructor(private conn: Connection, private bounds: Bounds, private weapon: string) {
    this.sender = new InputSender(conn);
  }

  /** 서버 패치: 내 서버 상태로 예측 보정 */
  reconcile(): void {
    const c = this.conn, snap = c.players.latest, s = snap?.items.get(c.myId);
    if (!snap || !s) return;
    if (!this.predictor) this.predictor = new Predictor(weaponDef(this.weapon), this.bounds, { x: s.x, y: s.y });
    const server = mirrorPlayer(s, snap.t, this.weapon, c.mine, snap.t);
    const r = (this.lastCorrection = this.predictor.reconcile(server, s.lastInputSeq, TICK));
    const st = this.corrections;
    if (r.mode !== 'none') st[r.mode]++;
    st.maxError = Math.max(st.maxError, r.error);
  }

  /** 입력 보내기 + 예측 틱. 반환 = 이번 프레임에 걸은 거리 (틱이 안 돌았으면 null). zones = 감속 장판 */
  step(realDt: number, keys: KeyInput, zones: ZoneArea[]): number | null {
    const pr = this.predictor;
    const sent = this.sender.update(keys, realDt, pr?.state ?? null);
    const pressed = sent.press.attack || sent.press.skill || sent.press.backstep || sent.press.potion;
    if (pressed) this.press = { input: sent.press, seq: sent.actionSeq };
    const n = this.ticks.advance(realDt);
    if (!pr) return null;
    let moved = 0;
    for (let i = 0; i < n; i++) {
      const press = this.press;
      this.press = null;
      const input = { x: sent.x, y: sent.y, run: sent.run, attack: false, skill: null, backstep: false, potion: null, ...press?.input };
      moved += pr.tick(input, TICK, sent.seq, press?.seq ?? null, zoneSpeedMul(zones, pr.state.pos, PLAYER.hurtbox)).moved;
    }
    return n > 0 ? moved : null;
  }
}
